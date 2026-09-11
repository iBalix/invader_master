/**
 * Pont WebSocket Flappy Bar (/ws/flappybar) : relais des flaps en direct.
 *
 * Rôle volontairement étroit : une dalle envoie ses flaps ({t:'flap', f}), le
 * pont les mémorise (flapStore) et les rediffuse aux autres dalles de la
 * salle, qui rejouent les fantômes avec la simulation partagée. Tout ce qui
 * fait foi (départ de manche, morts, classement) vient de la machine à états
 * (flapFlow) et arrive ici par le bus flapEvents ; le pont ne décide rien.
 *
 * Pourquoi pas Supabase Realtime comme le reste du moteur : 20 joueurs à
 * 15 flaps/s font 300 messages/s à rediffuser à 20 dalles, avec une latence
 * qui se voit à l'écran. Un WS maison sur le même serveur Railway coûte zéro
 * infrastructure et reste sous la milliseconde.
 *
 * Sécurité : l'URL porte `session` (UUID) et `token` (jeton joueur, optionnel
 * : sans jeton on est spectateur). Ne JAMAIS logger req.url. Chaque message
 * rejeté compte une violation ; au-delà d'un seuil la connexion est fermée.
 */

import type { IncomingMessage } from 'http';
import { WebSocket, WebSocketServer, type RawData } from 'ws';
import { findPlayerByToken, loadSession } from '../games/engine.js';
import { forceResolvePlayer } from '../games/flappybar/flapFlow.js';
import { SIM } from '../games/flappybar/flapSim.js';
import * as flapStore from '../games/flappybar/flapStore.js';
import { onFlapEvent, type FlapRoundInfo } from '../games/flappybar/flapStore.js';
import {
  FLAP_DISCONNECT_GRACE_MS,
  FLAP_LIVENESS_MS,
  FLAP_MAX_FLAPS_PER_SEC,
  flapStateOf,
} from '../games/flappybar/types.js';
import type { SessionRow } from '../games/types.js';
import { registerWsPath } from './upgrade-router.js';

const WS_PATH = '/ws/flappybar';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** un flap fait ~15 caractères ; au-delà ce n'est pas un client honnête */
const MAX_MESSAGE_CHARS = 128;
const MAX_VIOLATIONS = 100;
const HEARTBEAT_MS = 15_000;
const ROOM_SWEEP_MS = 60_000;
/** avance tolérée d'une frame de flap sur l'horloge serveur (~2 s : latence + dérive d'horloge) */
const FLAP_FRAME_LEAD = 120;

interface Conn {
  ws: WebSocket;
  /** null = spectateur */
  playerId: string | null;
  /** seau à jetons anti-rafale */
  tokens: number;
  lastRefill: number;
  violations: number;
  alive: boolean;
  missedPongs: number;
}

interface Room {
  sessionId: string;
  /** manche en cours telle que publiée par le flow (null entre deux manches) */
  round: FlapRoundInfo | null;
  participants: Set<string>;
  /** playerId -> frame de mort */
  dead: Map<string, number>;
  conns: Set<Conn>;
  /** résolution d'office différée des joueurs dont la socket est morte */
  grace: Map<string, NodeJS.Timeout>;
  /** dernière manche close vue : évite de ré-hydrater une manche finie depuis une lecture périmée */
  lastEndedIndex: number;
}

const rooms = new Map<string, Room>();
/**
 * Dernière manche close par session, conservée même quand la salle est
 * supprimée : une connexion dont la lecture en base a précédé de quelques ms
 * la fin de manche recréerait sinon une salle qui ressuscite cette manche.
 * Purgé à la fin de la session.
 */
const lastEndedBySession = new Map<string, number>();
let initialized = false;

// ---------------------------------------------------------------------------
// Salles
// ---------------------------------------------------------------------------

function roomFor(sessionId: string): Room {
  let room = rooms.get(sessionId);
  if (!room) {
    room = {
      sessionId,
      round: null,
      participants: new Set(),
      dead: new Map(),
      conns: new Set(),
      grace: new Map(),
      lastEndedIndex: lastEndedBySession.get(sessionId) ?? -1,
    };
    rooms.set(sessionId, room);
  }
  return room;
}

function send(ws: WebSocket, payload: unknown): void {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
}

function broadcastRoom(room: Room, payload: unknown, except?: Conn): void {
  const data = JSON.stringify(payload);
  for (const conn of room.conns) {
    if (conn !== except && conn.ws.readyState === WebSocket.OPEN) conn.ws.send(data);
  }
}

function clearGrace(room: Room, playerId?: string): void {
  if (playerId !== undefined) {
    const timer = room.grace.get(playerId);
    if (timer) clearTimeout(timer);
    room.grace.delete(playerId);
    return;
  }
  for (const timer of room.grace.values()) clearTimeout(timer);
  room.grace.clear();
}

/** une salle sans connexion ni manche n'a rien à retenir */
function dropRoomIfIdle(room: Room): void {
  if (room.conns.size === 0 && !room.round) rooms.delete(room.sessionId);
}

/**
 * Salle à froid (redémarrage du serveur, première connexion) : la manche en
 * cours est relue depuis la base. On n'écrase jamais une manche déjà connue
 * par événement, ni ne ressuscite une manche close entre-temps.
 */
function hydrateRoom(room: Room, session: SessionRow): void {
  if (room.round) return;
  const state = flapStateOf(session);
  const round = state.round;
  if (!round || session.status !== 'playing' || round.index <= room.lastEndedIndex) return;
  room.round = {
    index: round.index,
    seed: round.seed,
    startsAt: round.startsAt,
    capAt: round.capAt,
    participants: [...round.participants],
  };
  room.participants = new Set(round.participants);
  room.dead = new Map();
  for (const id of round.participants) {
    const r = round.results[id];
    if (r && !r.alive) room.dead.set(id, r.deathFrame ?? SIM.MAX_FRAMES);
  }
  // idempotent : ne perd pas des flaps déjà reçus pour cette manche
  flapStore.beginRound(room.sessionId, round.index);
}

// ---------------------------------------------------------------------------
// Connexions
// ---------------------------------------------------------------------------

function rawToString(raw: RawData): string {
  if (Buffer.isBuffer(raw)) return raw.toString('utf8');
  if (Array.isArray(raw)) return Buffer.concat(raw).toString('utf8');
  return Buffer.from(raw).toString('utf8');
}

function reject(conn: Conn): void {
  conn.violations += 1;
  if (conn.violations > MAX_VIOLATIONS) conn.ws.close(4008, 'too many invalid messages');
}

/** seau à jetons : capacité et recharge = FLAP_MAX_FLAPS_PER_SEC */
function takeToken(conn: Conn): boolean {
  const now = Date.now();
  const elapsedSec = (now - conn.lastRefill) / 1000;
  conn.tokens = Math.min(FLAP_MAX_FLAPS_PER_SEC, conn.tokens + elapsedSec * FLAP_MAX_FLAPS_PER_SEC);
  conn.lastRefill = now;
  if (conn.tokens < 1) return false;
  conn.tokens -= 1;
  return true;
}

function onMessage(room: Room, conn: Conn, raw: RawData, isBinary: boolean): void {
  if (isBinary) return reject(conn);
  const text = rawToString(raw);
  if (text.length > MAX_MESSAGE_CHARS) return reject(conn);
  let msg: unknown;
  try {
    msg = JSON.parse(text);
  } catch {
    return reject(conn);
  }
  if (!msg || typeof msg !== 'object' || (msg as { t?: unknown }).t !== 'flap') return reject(conn);
  const f = (msg as { f?: unknown }).f;
  if (typeof f !== 'number' || !Number.isInteger(f) || f < 0 || f > SIM.MAX_FRAMES) return reject(conn);

  const round = room.round;
  if (!round || !conn.playerId) return reject(conn);
  if (!room.participants.has(conn.playerId) || room.dead.has(conn.playerId)) return reject(conn);
  // un flap ne peut pas venir du futur : borne sur l'horloge serveur
  const elapsedFrames = (Date.now() - round.startsAt) / (1000 / SIM.FPS);
  if (f > elapsedFrames + FLAP_FRAME_LEAD) return reject(conn);
  if (!takeToken(conn)) return reject(conn);
  if (flapStore.pushFlap(room.sessionId, round.index, conn.playerId, f) !== 'ok') return reject(conn);
  flapStore.touchSeen(conn.playerId);

  broadcastRoom(room, { t: 'flap', p: conn.playerId, f }, conn);
}

/**
 * Délai de grâce après une socket morte. La socket ne porte que les fantômes :
 * un joueur dont le REST répond encore (poll de /state, flaps acceptés) est
 * VIVANT et continue sa manche, on repasse plus tard. On ne résout d'office
 * que le joueur muet partout depuis FLAP_LIVENESS_MS (Chrome figé, dalle
 * fermée), et le plafond de manche reste la borne ultime.
 */
function armGrace(room: Room, playerId: string): void {
  clearGrace(room, playerId);
  const sessionId = room.sessionId;
  room.grace.set(
    playerId,
    setTimeout(() => {
      room.grace.delete(playerId);
      if (!room.round || room.dead.has(playerId)) return;
      const seen = flapStore.lastSeen(playerId);
      if (seen !== null && Date.now() - seen < FLAP_LIVENESS_MS) {
        armGrace(room, playerId);
        return;
      }
      forceResolvePlayer(sessionId, playerId).catch((err) =>
        console.error('[flappybar-ws] résolution d\'office en échec', err),
      );
    }, FLAP_DISCONNECT_GRACE_MS),
  );
}

function onClose(room: Room, conn: Conn): void {
  room.conns.delete(conn);
  const playerId = conn.playerId;
  if (playerId) {
    let stillHere = false;
    for (const other of room.conns) {
      if (other.playerId === playerId) {
        stillHere = true;
        break;
      }
    }
    if (!stillHere) {
      broadcastRoom(room, { t: 'left', p: playerId });
      // en pleine manche : délai de grâce (reconnexion) puis résolution d'office
      if (room.round && room.participants.has(playerId) && !room.dead.has(playerId)) {
        armGrace(room, playerId);
      }
    }
  }
  dropRoomIfIdle(room);
}

async function acceptConnection(ws: WebSocket, req: IncomingMessage): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://x');
  const sessionId = url.searchParams.get('session') ?? '';
  const token = url.searchParams.get('token') ?? undefined;
  if (!UUID_RE.test(sessionId)) {
    ws.close(4004, 'unknown session');
    return;
  }
  const session = await loadSession(sessionId);
  if (!session || session.mode !== 'flappybar' || session.ended_at || session.status === 'end') {
    ws.close(4004, 'unknown session');
    return;
  }
  let playerId: string | null = null;
  if (token) {
    const player = await findPlayerByToken(sessionId, token);
    if (!player) {
      ws.close(4001, 'unknown player');
      return;
    }
    playerId = player.id;
  }
  // le client a pu partir pendant les lectures en base
  if (ws.readyState !== WebSocket.OPEN) return;

  const room = roomFor(sessionId);
  hydrateRoom(room, session);
  const conn: Conn = {
    ws,
    playerId,
    tokens: FLAP_MAX_FLAPS_PER_SEC,
    lastRefill: Date.now(),
    violations: 0,
    alive: true,
    missedPongs: 0,
  };
  room.conns.add(conn);
  if (playerId) {
    clearGrace(room, playerId);
    broadcastRoom(room, { t: 'joined', p: playerId }, conn);
  }
  send(ws, {
    t: 'hello',
    role: playerId ? 'player' : 'spectator',
    playerId,
    serverNow: Date.now(),
    round: room.round,
    players: room.round ? flapStore.allFlaps(sessionId, room.round.index) : {},
    dead: Object.fromEntries(room.dead),
  });

  ws.on('message', (raw, isBinary) => onMessage(room, conn, raw, isBinary));
  ws.on('pong', () => {
    conn.alive = true;
    conn.missedPongs = 0;
  });
  // deux pings sans pong : la dalle a disparu sans FIN (Wi-Fi, veille)
  const heartbeat = setInterval(() => {
    if (ws.readyState !== WebSocket.OPEN) return;
    if (!conn.alive) {
      conn.missedPongs += 1;
      if (conn.missedPongs >= 2) {
        ws.terminate();
        return;
      }
    }
    conn.alive = false;
    ws.ping();
  }, HEARTBEAT_MS);
  ws.on('close', () => {
    clearInterval(heartbeat);
    onClose(room, conn);
  });
  // 'close' suit toujours 'error' : rien d'autre à faire ici
  ws.on('error', () => undefined);
}

// ---------------------------------------------------------------------------
// Événements du flow -> salles
// ---------------------------------------------------------------------------

function bindFlowEvents(): void {
  onFlapEvent('round_started', ({ sessionId, round }) => {
    // salle créée même sans connexion : elle porte la manche jusqu'à sa fin
    const room = roomFor(sessionId);
    clearGrace(room);
    room.round = round;
    room.participants = new Set(round.participants);
    room.dead = new Map();
    broadcastRoom(room, { t: 'round', round });
  });

  onFlapEvent('player_dead', ({ sessionId, playerId, frame, distance }) => {
    const room = rooms.get(sessionId);
    if (!room) return;
    room.dead.set(playerId, frame);
    clearGrace(room, playerId);
    broadcastRoom(room, { t: 'dead', p: playerId, f: frame, d: distance });
  });

  onFlapEvent('round_ended', ({ sessionId, index }) => {
    const room = rooms.get(sessionId);
    if (!room) return;
    broadcastRoom(room, { t: 'end', index });
    clearGrace(room);
    room.round = null;
    room.lastEndedIndex = Math.max(room.lastEndedIndex, index);
    lastEndedBySession.set(sessionId, room.lastEndedIndex);
    room.participants.clear();
    room.dead.clear();
    dropRoomIfIdle(room);
  });

  onFlapEvent('session_ended', ({ sessionId }) => {
    const room = rooms.get(sessionId);
    if (!room) return;
    broadcastRoom(room, { t: 'bye' });
    clearGrace(room);
    for (const conn of room.conns) conn.ws.close(4000, 'session ended');
    rooms.delete(sessionId);
    lastEndedBySession.delete(sessionId);
    flapStore.dropSession(sessionId);
  });
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

export function initFlappybarBridge(): void {
  if (initialized) return;
  initialized = true;

  // maxPayload minuscule : un flap fait ~15 octets, tout dépassement est
  // fermé par ws lui-même (1009) avant même d'arriver ici
  const wss = new WebSocketServer({ noServer: true, maxPayload: 512, perMessageDeflate: false });
  registerWsPath(WS_PATH, wss);

  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    acceptConnection(ws, req).catch((err) => {
      console.error('[flappybar-ws] connexion refusée', err);
      try {
        ws.close(1011, 'server error');
      } catch {
        // déjà fermée
      }
    });
  });

  bindFlowEvents();

  const sweeper = setInterval(() => {
    for (const room of rooms.values()) dropRoomIfIdle(room);
  }, ROOM_SWEEP_MS);
  sweeper.unref();

  console.log(`[ws] Flappy Bar bridge ready on ${WS_PATH}`);
}
