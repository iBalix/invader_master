/**
 * Pont WebSocket Bar Invaders (/ws/barinvaders) : relais des entrées en direct.
 *
 * Rôle volontairement étroit : une dalle envoie ses changements d'entrée
 * ({t:'in', f, m}) et son filigrane ({t:'hb', f} : « mes entrées jusqu'à la
 * frame f sont toutes parties »). Le pont les mémorise (invStore) et les
 * rediffuse aux autres dalles de la salle, qui rejouent chaque adversaire
 * avec la simulation partagée jusqu'à son filigrane (panneau des joueurs,
 * mode spectateur). Tout ce qui fait foi (départ de manche, fins de partie,
 * classement) vient de la machine à états (invFlow) et arrive ici par le bus
 * invEvents ; le pont ne décide rien.
 *
 * Pourquoi pas Supabase Realtime comme le reste du moteur : même raison que
 * Flappy Bar, des centaines de petits messages par seconde à rediffuser avec
 * une latence qui se voit (le panneau suit les adversaires à ~0,5 s près).
 *
 * Sécurité : l'URL porte `session` (UUID) et `token` (jeton joueur, optionnel
 * : sans jeton on est spectateur). Ne JAMAIS logger req.url. Chaque message
 * rejeté compte une violation ; au-delà d'un seuil la connexion est fermée.
 */

import type { IncomingMessage } from 'http';
import { WebSocket, WebSocketServer, type RawData } from 'ws';
import { findPlayerByToken, loadSession } from '../games/engine.js';
import { forceResolvePlayer } from '../games/barinvaders/invFlow.js';
import { SIM } from '../games/barinvaders/invSim.js';
import * as invStore from '../games/barinvaders/invStore.js';
import { onInvEvent, type InvRoundInfo } from '../games/barinvaders/invStore.js';
import { INV_DISCONNECT_GRACE_MS, INV_LIVENESS_MS, invStateOf } from '../games/barinvaders/types.js';
import type { SessionRow } from '../games/types.js';
import { registerWsPath } from './upgrade-router.js';

const WS_PATH = '/ws/barinvaders';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** une entrée fait ~30 caractères ; au-delà ce n'est pas un client honnête */
const MAX_MESSAGE_CHARS = 128;
const MAX_VIOLATIONS = 100;
const HEARTBEAT_MS = 15_000;
const ROOM_SWEEP_MS = 60_000;
/** avance tolérée d'une frame sur l'horloge serveur (~2 s : latence + dérive d'horloge) */
const FRAME_LEAD = 120;
/**
 * Seau à jetons : recharge = entrées max par seconde + filigranes (4/s) et un
 * peu de marge ; capacité plus large pour absorber la file vidée d'un coup à
 * la reconnexion (une entrée perdue désynchroniserait les dalles adverses).
 */
const MSG_PER_SEC = SIM.MAX_INPUTS_PER_SEC + 10;
const MSG_BURST = 3 * MSG_PER_SEC;

interface Conn {
  ws: WebSocket;
  /** null = spectateur */
  playerId: string | null;
  tokens: number;
  lastRefill: number;
  violations: number;
  alive: boolean;
  missedPongs: number;
}

interface DeadInfo {
  frame: number;
  score: number;
}

interface Room {
  sessionId: string;
  /** manche en cours telle que publiée par le flow (null entre deux manches) */
  round: InvRoundInfo | null;
  participants: Set<string>;
  /** playerId -> fin de partie officielle */
  dead: Map<string, DeadInfo>;
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
  const state = invStateOf(session);
  const round = state.round;
  if (!round || session.status !== 'playing' || round.index <= room.lastEndedIndex) return;
  room.round = {
    index: round.index,
    startsAt: round.startsAt,
    capAt: round.capAt,
    participants: [...round.participants],
  };
  room.participants = new Set(round.participants);
  room.dead = new Map();
  for (const id of round.participants) {
    const r = round.results[id];
    if (r && !r.alive) room.dead.set(id, { frame: r.overFrame ?? SIM.MAX_FRAMES, score: r.score });
  }
  // idempotent : ne perd pas des entrées déjà reçues pour cette manche
  invStore.beginRound(room.sessionId, round.index);
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

function takeToken(conn: Conn): boolean {
  const now = Date.now();
  const elapsedSec = (now - conn.lastRefill) / 1000;
  conn.tokens = Math.min(MSG_BURST, conn.tokens + elapsedSec * MSG_PER_SEC);
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
  if (!msg || typeof msg !== 'object') return reject(conn);
  const t = (msg as { t?: unknown }).t;
  if (t !== 'in' && t !== 'hb') return reject(conn);
  const f = (msg as { f?: unknown }).f;
  if (typeof f !== 'number' || !Number.isInteger(f) || f < 0 || f > SIM.MAX_FRAMES) return reject(conn);

  const round = room.round;
  if (!round || !conn.playerId) return reject(conn);
  if (!room.participants.has(conn.playerId)) return reject(conn);
  // fin de partie officielle : les derniers filigranes en vol ne sont pas des fautes
  if (room.dead.has(conn.playerId)) return;
  // une entrée ne peut pas venir du futur : borne sur l'horloge serveur
  const elapsedFrames = (Date.now() - round.startsAt) / (1000 / SIM.FPS);
  if (f > elapsedFrames + FRAME_LEAD) return reject(conn);
  if (!takeToken(conn)) return reject(conn);

  if (t === 'in') {
    const m = (msg as { m?: unknown }).m;
    if (typeof m !== 'number' || !Number.isInteger(m) || m < 0 || m > 7) return reject(conn);
    const pushed = invStore.pushInput(room.sessionId, round.index, conn.playerId, f, m);
    if (pushed === 'same') return;
    if (pushed !== 'ok') return reject(conn);
    invStore.touchSeen(conn.playerId);
    broadcastRoom(room, { t: 'in', p: conn.playerId, f, m }, conn);
    return;
  }
  const marked = invStore.pushMark(room.sessionId, round.index, conn.playerId, f);
  if (marked !== 'ok') return reject(conn);
  invStore.touchSeen(conn.playerId);
  broadcastRoom(room, { t: 'hb', p: conn.playerId, f }, conn);
}

/**
 * Délai de grâce après une socket morte. La socket ne porte que l'affichage
 * des adversaires : un joueur dont le REST répond encore (poll de /state) est
 * VIVANT et continue sa partie, on repasse plus tard. On ne résout d'office
 * que le joueur muet partout depuis INV_LIVENESS_MS (Chrome figé, dalle
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
      const seen = invStore.lastSeen(playerId);
      if (seen !== null && Date.now() - seen < INV_LIVENESS_MS) {
        armGrace(room, playerId);
        return;
      }
      forceResolvePlayer(sessionId, playerId).catch((err) =>
        console.error('[barinvaders-ws] résolution d\'office en échec', err),
      );
    }, INV_DISCONNECT_GRACE_MS),
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
  if (!session || session.mode !== 'barinvaders' || session.ended_at || session.status === 'end') {
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
    tokens: MSG_BURST,
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
    inputs: room.round ? invStore.allInputs(sessionId, room.round.index) : {},
    marks: room.round ? invStore.allMarks(sessionId, room.round.index) : {},
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
  onInvEvent('round_started', ({ sessionId, round }) => {
    // salle créée même sans connexion : elle porte la manche jusqu'à sa fin
    const room = roomFor(sessionId);
    clearGrace(room);
    room.round = round;
    room.participants = new Set(round.participants);
    room.dead = new Map();
    broadcastRoom(room, { t: 'round', round });
  });

  onInvEvent('player_dead', ({ sessionId, playerId, frame, score, wave }) => {
    const room = rooms.get(sessionId);
    if (!room) return;
    room.dead.set(playerId, { frame, score });
    clearGrace(room, playerId);
    broadcastRoom(room, { t: 'dead', p: playerId, frame, score, wave });
  });

  onInvEvent('round_ended', ({ sessionId, index }) => {
    const room = rooms.get(sessionId);
    if (!room) return;
    broadcastRoom(room, { t: 'ended', index });
    clearGrace(room);
    room.round = null;
    room.lastEndedIndex = Math.max(room.lastEndedIndex, index);
    lastEndedBySession.set(sessionId, room.lastEndedIndex);
    room.participants.clear();
    room.dead.clear();
    dropRoomIfIdle(room);
  });

  onInvEvent('session_ended', ({ sessionId }) => {
    const room = rooms.get(sessionId);
    if (!room) return;
    broadcastRoom(room, { t: 'bye' });
    clearGrace(room);
    for (const conn of room.conns) conn.ws.close(4000, 'session ended');
    rooms.delete(sessionId);
    lastEndedBySession.delete(sessionId);
    invStore.dropSession(sessionId);
  });
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

export function initBarinvadersBridge(): void {
  if (initialized) return;
  initialized = true;

  // maxPayload réduit : une entrée fait ~30 octets, tout dépassement est
  // fermé par ws lui-même (1009) avant même d'arriver ici
  const wss = new WebSocketServer({ noServer: true, maxPayload: 512, perMessageDeflate: false });
  registerWsPath(WS_PATH, wss);

  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    acceptConnection(ws, req).catch((err) => {
      console.error('[barinvaders-ws] connexion refusée', err);
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

  console.log(`[ws] Bar Invaders bridge ready on ${WS_PATH}`);
}
