/**
 * Machine à états de FLAPPY BAR (Flappy Bird multijoueur entre tables, 1 à 20
 * joueurs).
 *
 * Cycle d'une partie :
 *   lobby (salle d'attente) ─► playing (compte à rebours commun puis manche,
 *   même seed pour tous) ─► lobby (classement de la manche dans `lastRound`,
 *   verrou de relance) ─► playing ... ─► end (lobby expiré, plus personne,
 *   arrêt staff).
 *
 * Principes hérités du moteur (quiz/échecs/blackjack) :
 *   - état complet dans runtime.flappybar, toute mutation sous withSession ;
 *   - phase_ends_at porte l'échéance : TTL du lobby, ou plafond de la manche
 *     (`round.capAt`) ; l'advancer (synchrone) résout d'office les survivants ;
 *   - le broadcast est un SNAPSHOT complet (registerSyncPayload).
 *
 * Ce qui est propre à ce jeu :
 *   - les flaps en direct ne passent pas par ici (WebSocket + flapStore) ;
 *   - le client déclare sa mort avec la liste de ses flaps, le serveur REJOUE
 *     la simulation déterministe (flapSim) et impose son résultat ;
 *   - un joueur muet (socket morte, plafond) est résolu d'office à partir des
 *     flaps reçus par le pont ;
 *   - les records du bar (game_records) sont écrits APRÈS la manche, de façon
 *     idempotente, et signalés par `lastRound.records.applied`.
 */

import crypto from 'crypto';
import { supabaseAdmin } from '../../config/supabase.js';
import {
  generatePlayerToken,
  insertSession,
  listOpenSessions,
  loadPlayers,
  loadSession,
  markDirty,
  registerAdvancer,
  registerSyncPayload,
  validatePseudo,
  withSession,
} from '../engine.js';
import { broadcastTopic } from '../realtime.js';
import { bestRecord, upsertRecord } from '../records.js';
import { SIM, frameToMs, isValidFlapList, metersOf, simulate } from './flapSim.js';
import * as flapStore from './flapStore.js';
import { emitFlapEvent, onFlapEvent } from './flapStore.js';
import {
  FLAP_COUNTDOWN_MS,
  FLAP_DEATH_TOLERANCE_FRAMES,
  FLAP_INVITE_COOLDOWN_MS,
  FLAP_LOBBY_TOPIC,
  FLAP_LOBBY_TTL_MS,
  FLAP_MAX_FLAPS,
  FLAP_MAX_PLAYERS,
  FLAP_MIN_PLAYERS_TO_START,
  FLAP_RECORDS_MODE,
  FLAP_RECORDS_TOPIC,
  FLAP_ROUND_CAP_MS,
  FLAP_THEME_MAX_LEN,
  activePlayers,
  aliveCount,
  flapConfigOf,
  flapStateOf,
  playerOf,
  presentPlayers,
  restartUnlockAt,
  type FlapConfig,
  type FlapLastRound,
  type FlapPlayer,
  type FlapRankingEntry,
  type FlapRound,
  type FlapRoundEnd,
  type FlapRoundResult,
  type FlapState,
} from './types.js';
import { buildFlapPublicState } from './flapViews.js';
import type { PlayerRow, SessionRow } from '../types.js';

// ---------------------------------------------------------------------------
// Helpers internes
// ---------------------------------------------------------------------------

function httpErr(message: string, httpStatus: number): Error {
  return Object.assign(new Error(message), { httpStatus });
}

function notifyLobby(): void {
  void broadcastTopic(FLAP_LOBBY_TOPIC, 'sync', {}).catch(() => undefined);
}

function nowIso(): string {
  return new Date().toISOString();
}

function ensureFlap(session: SessionRow): void {
  if (session.mode !== 'flappybar') throw httpErr('Session introuvable', 404);
}

function isEnded(session: SessionRow): boolean {
  return session.status === 'end' || session.ended_at !== null;
}

/** le lobby vit tant qu'il bouge : chaque arrivée et chaque fin de manche repousse l'échéance */
function refreshLobbyTtl(session: SessionRow): void {
  session.phase_started_at = nowIso();
  session.phase_ends_at = new Date(Date.now() + FLAP_LOBBY_TTL_MS).toISOString();
}

function freshResult(): FlapRoundResult {
  return {
    alive: true,
    deathFrame: null,
    distance: 0,
    pipes: 0,
    timeMs: 0,
    flapsCount: 0,
    resolvedBy: null,
    mismatch: false,
  };
}

function makePlayer(state: FlapState, row: PlayerRow, status: 'active' | 'pending'): FlapPlayer {
  state.joinCounter += 1;
  return {
    playerId: row.id,
    pseudo: row.pseudo,
    device: row.device,
    joinedSeq: state.joinCounter,
    joinedAt: Date.now(),
    status,
    bestDistance: 0,
    roundsWon: 0,
  };
}

/**
 * Insert d'un joueur. Deux "Alex" dans la même partie sont ACCEPTÉS (comme au
 * blackjack) : la contrainte UNIQUE(session_id, pseudo_norm) est contournée
 * par un suffixe technique sur pseudo_norm, le pseudo affiché reste identique.
 */
async function insertFlapPlayer(sessionId: string, pseudo: string, device: string): Promise<PlayerRow> {
  const validationError = validatePseudo(pseudo);
  if (validationError) throw httpErr(validationError, 400);
  const trimmed = pseudo.trim();
  for (let attempt = 0; attempt < 3; attempt++) {
    const norm =
      attempt === 0
        ? trimmed.toLowerCase()
        : `${trimmed.toLowerCase()}~${crypto.randomBytes(3).toString('hex')}`;
    const { data, error } = await supabaseAdmin
      .from('game_players')
      .insert({
        session_id: sessionId,
        pseudo: trimmed,
        pseudo_norm: norm,
        device: device || 'unknown',
        player_token: generatePlayerToken(),
        bonuses: {},
        stats: {},
      })
      .select('*')
      .single();
    if (!error) return data as PlayerRow;
    if (!(`${error.message}`.includes('duplicate') || error.code === '23505')) throw error;
  }
  throw httpErr('error_player_already_exists', 409);
}

/** soft delete (jamais de DELETE dur, cf. quiz) : le jeton cesse d'être reconnu */
async function removeFlapPlayer(player: PlayerRow): Promise<void> {
  await supabaseAdmin
    .from('game_players')
    .update({ status: 'removed', pseudo_norm: `${player.pseudo_norm}:left:${player.id}` })
    .eq('id', player.id);
}

// ---------------------------------------------------------------------------
// Création / join
// ---------------------------------------------------------------------------

export interface CreateFlapInput {
  pseudo: string;
  device: string;
  theme: string;
  /** défaut : FLAP_MAX_PLAYERS (tout le bar) */
  maxPlayers?: number | null;
}

export async function createFlapSession(
  input: CreateFlapInput,
): Promise<{ session: SessionRow; player: PlayerRow }> {
  const validationError = validatePseudo(input.pseudo ?? '');
  if (validationError) throw httpErr(validationError, 400);
  const theme = (input.theme ?? '').trim();
  if (theme.length === 0 || theme.length > FLAP_THEME_MAX_LEN) throw httpErr('error_flap_bad_config', 400);
  const maxPlayers =
    input.maxPlayers === undefined || input.maxPlayers === null ? FLAP_MAX_PLAYERS : Number(input.maxPlayers);
  if (!Number.isInteger(maxPlayers) || maxPlayers < 1 || maxPlayers > FLAP_MAX_PLAYERS) {
    throw httpErr('error_flap_bad_config', 400);
  }

  const config: FlapConfig = {
    theme,
    maxPlayers,
    hostOnlyStart: false,
    countdownMs: FLAP_COUNTDOWN_MS,
    roundCapMs: FLAP_ROUND_CAP_MS,
    creatorPseudo: input.pseudo.trim(),
  };
  const state: FlapState = {
    hostPlayerId: '',
    players: {},
    round: null,
    lastRound: null,
    roundsPlayed: 0,
    nextRoundIndex: 0,
    joinCounter: 0,
    recordsVersion: 0,
    inviteAt: null,
  };
  const session = await insertSession({
    mode: 'flappybar',
    status: 'lobby',
    config,
    runtime: { flappybar: state },
    phaseStartedAt: nowIso(),
    phaseEndsAt: new Date(Date.now() + FLAP_LOBBY_TTL_MS).toISOString(),
  });
  const player = await insertFlapPlayer(session.id, input.pseudo, input.device);
  const committed = await withSession(session.id, async (s) => {
    const st = flapStateOf(s);
    st.hostPlayerId = player.id;
    st.players[player.id] = makePlayer(st, player, 'active');
    markDirty(s);
    return s;
  });
  notifyLobby();
  return { session: committed, player };
}

export async function joinFlapSession(
  sessionId: string,
  pseudo: string,
  device: string,
): Promise<{ session: SessionRow; player: PlayerRow }> {
  const existing = await loadSession(sessionId);
  if (!existing || existing.mode !== 'flappybar') throw httpErr('Session introuvable', 404);
  if (isEnded(existing)) throw httpErr('error_flap_game_over', 409);

  // reprise par dalle : au bar, l'écran EST l'identité physique. Si cette
  // dalle a déjà une place (localStorage perdu, navigateur redémarré), on lui
  // rend sa place au lieu de la laisser dehors ou de la dédoubler.
  const dev = (device || 'unknown').toUpperCase();
  if (dev !== 'UNKNOWN') {
    const seated = presentPlayers(flapStateOf(existing)).find((p) => p.device.toUpperCase() === dev);
    if (seated) {
      const owner = (await loadPlayers(sessionId)).find((p) => p.id === seated.playerId);
      if (owner) {
        // purge les transitions dues avant de rendre l'état
        const fresh = await withSession(sessionId, async (s) => s);
        return { session: fresh, player: owner };
      }
    }
  }

  const player = await insertFlapPlayer(sessionId, pseudo, device);
  try {
    const session = await withSession(sessionId, async (s) => {
      ensureFlap(s);
      if (isEnded(s)) throw httpErr('error_flap_game_over', 409);
      const state = flapStateOf(s);
      const config = flapConfigOf(s);
      const present = presentPlayers(state);
      if (present.length >= config.maxPlayers) throw httpErr('error_flap_full', 409);
      // garde-fou de course : deux requêtes simultanées de la même dalle ne
      // doivent pas créer deux places (le chemin normal est la reprise ci-dessus)
      if (dev !== 'UNKNOWN' && present.some((p) => p.device.toUpperCase() === dev)) {
        throw httpErr('error_flap_device_seated', 409);
      }
      // arrivé pendant une manche : on regarde, on entre à la suivante
      state.players[player.id] = makePlayer(state, player, s.status === 'lobby' ? 'active' : 'pending');
      if (s.status === 'lobby') refreshLobbyTtl(s);
      markDirty(s);
      return s;
    });
    notifyLobby();
    return { session, player };
  } catch (err) {
    await removeFlapPlayer(player).catch(() => undefined);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Manche : rejeu, résolution, classement
// ---------------------------------------------------------------------------

/**
 * Rejeu serveur d'une mort déclarée. Le serveur gagne toujours :
 *  - mort rejouée dans la tolérance : frame serveur ;
 *  - mort rejouée plus tôt : le client a déclaré plus qu'il n'a fait ;
 *  - aucune mort rejouée jusqu'à frame + tolérance : les flaps ne
 *    reproduisent pas la mort déclarée (flaps perdus, ou triche). On garde
 *    alors la frame DÉCLARÉE (déjà bornée par l'anti-triche temporelle) avec
 *    la distance que le serveur mesure à cet instant, et on signale l'écart.
 *    On ne laisse JAMAIS courir la simulation jusqu'au plafond : une liste de
 *    flaps « immortelle » fabriquée hors ligne vaudrait sinon 5 min de
 *    distance après 2 s de jeu.
 * Pure (seed + flaps + frame) : exportée pour être testée hors base.
 */
export function replayDeath(seed: number, flaps: number[], frame: number): FlapRoundResult {
  const limit = Math.min(frame + FLAP_DEATH_TOLERANCE_FRAMES + 1, SIM.MAX_FRAMES);
  let sim = simulate(seed, flaps, limit);
  let deathFrame: number;
  let mismatch: boolean;
  if (sim.deathFrame !== null) {
    deathFrame = sim.deathFrame;
    mismatch = Math.abs(deathFrame - frame) > FLAP_DEATH_TOLERANCE_FRAMES;
  } else {
    // état exact au début de la frame déclarée (frames 0..frame-1 jouées)
    sim = simulate(seed, flaps, frame);
    deathFrame = Math.min(frame, SIM.MAX_FRAMES);
    mismatch = true;
  }
  return {
    alive: false,
    deathFrame,
    distance: metersOf(sim.scroll),
    pipes: sim.pipesPassed,
    timeMs: frameToMs(deathFrame),
    flapsCount: sim.flapCount,
    resolvedBy: 'client',
    mismatch,
  };
}

/**
 * Résolution d'office d'un survivant (socket morte, plafond, départ, arrêt
 * staff) à partir des flaps reçus par le pont WebSocket. Bornée au temps
 * réellement écoulé : on ne crédite jamais des frames qui n'ont pas eu lieu.
 * Synchrone (simulation pure + mémoire) : utilisable depuis l'advancer.
 */
function resolveAlive(session: SessionRow, state: FlapState, playerId: string): void {
  const round = state.round;
  if (!round) return;
  const current = round.results[playerId];
  if (!current || !current.alive) return;
  const elapsedFrame = Math.max(
    0,
    Math.min(SIM.MAX_FRAMES, Math.floor((Date.now() - round.startsAt) / (1000 / SIM.FPS))),
  );
  const flaps = flapStore.flapsOf(session.id, round.index, playerId);
  const sim = simulate(round.seed, flaps, elapsedFrame);
  const deathFrame = sim.deathFrame ?? elapsedFrame;
  const distance = metersOf(sim.scroll);
  round.results[playerId] = {
    alive: false,
    deathFrame,
    distance,
    pipes: sim.pipesPassed,
    timeMs: frameToMs(deathFrame),
    flapsCount: sim.flapCount,
    resolvedBy: 'server',
    mismatch: false,
  };
  markDirty(session);
  emitFlapEvent('player_dead', { sessionId: session.id, playerId, frame: deathFrame, distance });
}

/**
 * Classement d'une manche : distance, puis tuyaux, puis temps de survie, puis
 * ancienneté. Rang partagé sur égalité exacte (distance ET temps). Pur et
 * exporté pour être testable hors base.
 */
export function buildRanking(state: FlapState, round: FlapRound): FlapRankingEntry[] {
  const entries = round.participants.map((id) => {
    const p = state.players[id];
    const r = round.results[id];
    return {
      playerId: id,
      pseudo: p?.pseudo ?? '?',
      device: p?.device ?? 'unknown',
      joinedSeq: p?.joinedSeq ?? Number.MAX_SAFE_INTEGER,
      distance: r?.distance ?? 0,
      pipes: r?.pipes ?? 0,
      timeMs: r?.timeMs ?? 0,
      flapsCount: r?.flapsCount ?? 0,
      resolvedBy: r?.resolvedBy ?? 'server',
    };
  });
  entries.sort(
    (a, b) =>
      b.distance - a.distance || b.pipes - a.pipes || b.timeMs - a.timeMs || a.joinedSeq - b.joinedSeq,
  );
  let rank = 0;
  return entries.map((e, i) => {
    const prev = i > 0 ? entries[i - 1] : null;
    if (!prev || prev.distance !== e.distance || prev.timeMs !== e.timeMs) rank = i + 1;
    return {
      rank,
      playerId: e.playerId,
      pseudo: e.pseudo,
      device: e.device,
      distance: e.distance,
      pipes: e.pipes,
      timeMs: e.timeMs,
      flapsCount: e.flapsCount,
      resolvedBy: e.resolvedBy,
      personalBest: false,
      firstRecord: false,
      barRecord: false,
      previousBest: null,
    };
  });
}

/**
 * Clôture synchrone d'une manche : survivants résolus d'office, classement,
 * retour au lobby (verrou de relance via lastRound.endedAt). Les records du
 * bar (asynchrones) sont appliqués à part : cf. applyRoundRecords.
 */
function finishRoundSync(session: SessionRow, state: FlapState, endedBy: FlapRoundEnd): void {
  const round = state.round;
  if (!round) return;
  for (const id of round.participants) {
    if (round.results[id]?.alive) resolveAlive(session, state, id);
  }
  const ranking = buildRanking(state, round);
  for (const entry of ranking) {
    const p = state.players[entry.playerId];
    if (!p) continue;
    if (entry.rank === 1) p.roundsWon += 1;
    if (entry.distance > p.bestDistance) p.bestDistance = entry.distance;
  }
  state.lastRound = {
    index: round.index,
    seed: round.seed,
    startsAt: round.startsAt,
    endedAt: Date.now(),
    endedBy,
    ranking,
    records: { applied: false, barBefore: null, barAfter: null },
  };
  state.round = null;
  for (const p of Object.values(state.players)) {
    if (p.status === 'pending') p.status = 'active';
  }
  state.roundsPlayed += 1;
  session.status = 'lobby';
  refreshLobbyTtl(session);
  markDirty(session);
  emitFlapEvent('round_ended', { sessionId: session.id, index: round.index });
  notifyLobby();
}

/** fin de partie (lobby expiré, plus personne, arrêt staff) */
function cancelGame(session: SessionRow, state: FlapState): void {
  state.round = null;
  session.status = 'end';
  session.ended_at = nowIso();
  session.phase_ends_at = null;
  markDirty(session);
  notifyLobby();
  emitFlapEvent('session_ended', { sessionId: session.id });
  flapStore.dropSession(session.id);
  recordsRetryAt.delete(session.id);
}

// ---------------------------------------------------------------------------
// Records du bar
// ---------------------------------------------------------------------------

/** échec des records (table absente, Supabase en panne) : on réessaie sans marteler */
const recordsRetryAt = new Map<string, number>();
const RECORDS_RETRY_MS = 30_000;

/**
 * Upsert des records de la dernière manche. Idempotent : ne fait rien si déjà
 * appliqué, et l'upsert lui-même sait reconnaître une manche rejouée.
 * Mute lastRound.ranking (personalBest, firstRecord, barRecord, previousBest).
 */
export async function applyRoundRecords(session: SessionRow, state: FlapState): Promise<void> {
  const last = state.lastRound;
  if (!last || last.records.applied) return;
  const barBefore = await bestRecord(FLAP_RECORDS_MODE);
  for (const entry of last.ranking) {
    if (entry.distance <= 0) continue;
    const { improved, previous } = await upsertRecord({
      mode: FLAP_RECORDS_MODE,
      pseudo: entry.pseudo,
      score: entry.distance,
      unit: 'm',
      details: { pipes: entry.pipes, timeMs: entry.timeMs, roundIndex: last.index, sessionId: session.id },
      sessionId: session.id,
      device: entry.device,
    });
    entry.personalBest = improved && previous !== null;
    entry.firstRecord = improved && previous === null;
    entry.previousBest = previous;
  }
  // record absolu du bar : le(s) premier(s) de la manche s'il(s) dépasse(nt) l'ancien
  const barScore = barBefore?.score ?? 0;
  for (const entry of last.ranking) {
    if (entry.rank !== 1) break;
    if (entry.distance > barScore) entry.barRecord = true;
  }
  const barAfter = await bestRecord(FLAP_RECORDS_MODE);
  last.records = { applied: true, barBefore, barAfter };
  state.recordsVersion += 1;
  markDirty(session);
  void broadcastTopic(FLAP_RECORDS_TOPIC, 'sync', {}).catch(() => undefined);
}

/** un souci de records ne doit JAMAIS faire échouer la fin d'une manche */
async function applyRoundRecordsSafe(session: SessionRow, state: FlapState): Promise<void> {
  if (Date.now() < (recordsRetryAt.get(session.id) ?? 0)) return;
  try {
    await applyRoundRecords(session, state);
    recordsRetryAt.delete(session.id);
  } catch (err) {
    recordsRetryAt.set(session.id, Date.now() + RECORDS_RETRY_MS);
    console.error('[flappybar] records non appliqués (nouvel essai plus tard)', err);
  }
}

export function recordsPending(session: SessionRow): boolean {
  const last = flapStateOf(session).lastRound;
  return last !== null && !last.records.applied;
}

/** à passer à withSession : applique les records en attente (GET /state, fin de manche) */
export async function ensureRecordsApplied(session: SessionRow): Promise<SessionRow> {
  ensureFlap(session);
  const state = flapStateOf(session);
  if (state.lastRound && !state.lastRound.records.applied) {
    await applyRoundRecordsSafe(session, state);
  }
  return session;
}

/** tous les morts : la manche se termine sans attendre le plafond */
async function maybeEndRound(session: SessionRow, state: FlapState): Promise<void> {
  if (!state.round || aliveCount(state.round) > 0) return;
  finishRoundSync(session, state, 'all_dead');
  // même commit : le classement arrive aux dalles déjà décoré des records
  await applyRoundRecordsSafe(session, state);
}

// ---------------------------------------------------------------------------
// Actions joueur
// ---------------------------------------------------------------------------

export type FlapPlayerAction = 'start' | 'leave' | 'invite';

export async function flapPlayerAction(
  sessionId: string,
  player: PlayerRow,
  action: FlapPlayerAction,
): Promise<SessionRow> {
  // la manche lancée est publiée au pont APRÈS le commit : un départ annoncé
  // aux dalles doit exister en base (propriété d'objet : TypeScript ne suit pas
  // une affectation faite dans la fermeture)
  const out: { started: FlapRound | null } = { started: null };

  const session = await withSession(sessionId, async (s) => {
    ensureFlap(s);
    const state = flapStateOf(s);
    const config = flapConfigOf(s);
    const me = playerOf(state, player.id);
    if (!me || me.status === 'left') throw httpErr('error_flap_not_seated', 403);

    switch (action) {
      case 'start': {
        if (isEnded(s)) throw httpErr('error_flap_game_over', 409);
        if (s.status !== 'lobby') throw httpErr('error_flap_not_lobby', 409);
        if (me.status !== 'active') throw httpErr('error_flap_not_seated', 403);
        if (config.hostOnlyStart && state.hostPlayerId !== player.id) {
          throw httpErr('error_flap_not_host', 403);
        }
        const now = Date.now();
        const unlock = restartUnlockAt(state);
        if (unlock !== null && now < unlock) throw httpErr('error_flap_restart_locked', 409);
        const participants = activePlayers(state).map((p) => p.playerId);
        if (participants.length < FLAP_MIN_PLAYERS_TO_START) throw httpErr('error_flap_need_players', 409);

        const startsAt = now + config.countdownMs;
        const round: FlapRound = {
          index: state.nextRoundIndex,
          // entier 32 bits signé : la simulation fait `seed | 0` des deux côtés
          seed: crypto.randomInt(0, 2 ** 32) | 0,
          startsAt,
          capAt: startsAt + config.roundCapMs,
          startedBy: player.id,
          participants,
          results: {},
        };
        for (const id of participants) round.results[id] = freshResult();
        state.nextRoundIndex += 1;
        state.round = round;
        s.status = 'playing';
        s.started_at ??= nowIso();
        s.phase_started_at = nowIso();
        s.phase_ends_at = new Date(round.capAt).toISOString();
        markDirty(s);
        out.started = round;
        return s;
      }

      case 'leave': {
        if (isEnded(s)) return s;
        me.status = 'left';
        await removeFlapPlayer(player).catch(() => undefined);
        if (state.hostPlayerId === player.id) {
          // le joueur présent depuis le plus longtemps hérite du rôle
          const next = activePlayers(state)[0] ?? presentPlayers(state)[0];
          state.hostPlayerId = next ? next.playerId : '';
        }
        if (presentPlayers(state).length === 0) {
          cancelGame(s, state);
          return s;
        }
        if (s.status === 'playing' && state.round?.results[player.id]?.alive) {
          resolveAlive(s, state, player.id);
          await maybeEndRound(s, state);
        }
        markDirty(s);
        notifyLobby();
        return s;
      }

      case 'invite': {
        // invitation générale : toutes les dalles du bar hors partie reçoivent
        // le bandeau. Anti-spam : une invitation par table par cooldown.
        if (s.status !== 'lobby') throw httpErr('error_flap_not_lobby', 409);
        const now = Date.now();
        if (state.inviteAt !== null && now - state.inviteAt < FLAP_INVITE_COOLDOWN_MS) {
          throw httpErr('error_flap_invite_cooldown', 429);
        }
        state.inviteAt = now;
        markDirty(s);
        void broadcastTopic('tables:invites', 'invite', {
          game: 'flappybar',
          sessionId: s.id,
          pseudo: me.pseudo,
          theme: config.theme,
          at: now,
        }).catch(() => undefined);
        return s;
      }

      default:
        throw httpErr('Action inconnue', 400);
    }
  });

  const started = out.started;
  if (started) {
    flapStore.beginRound(session.id, started.index);
    emitFlapEvent('round_started', {
      sessionId: session.id,
      round: {
        index: started.index,
        seed: started.seed,
        startsAt: started.startsAt,
        capAt: started.capAt,
        participants: started.participants,
      },
    });
    notifyLobby();
  }
  return session;
}

// ---------------------------------------------------------------------------
// Déclaration de mort
// ---------------------------------------------------------------------------

export interface FlapDeathInput {
  roundIndex: number;
  frame: number;
  flaps: number[];
}

/** résultat d'un joueur relu depuis le classement d'une manche déjà close */
function resultFromRanking(last: FlapLastRound, playerId: string): FlapRoundResult | null {
  const e = last.ranking.find((x) => x.playerId === playerId);
  if (!e) return null;
  return {
    alive: false,
    deathFrame: Math.round((e.timeMs * SIM.FPS) / 1000),
    distance: e.distance,
    pipes: e.pipes,
    timeMs: e.timeMs,
    flapsCount: e.flapsCount,
    resolvedBy: e.resolvedBy,
    mismatch: false,
  };
}

export async function reportFlapDeath(
  sessionId: string,
  player: PlayerRow,
  input: FlapDeathInput,
): Promise<{ session: SessionRow; result: FlapRoundResult | null }> {
  return withSession(sessionId, async (session) => {
    ensureFlap(session);
    const state = flapStateOf(session);
    const { roundIndex, frame } = input;

    // idempotence : la manche est déjà close (retry réseau après la fin)
    if (session.status === 'lobby' && state.lastRound && state.lastRound.index === roundIndex) {
      return { session, result: resultFromRanking(state.lastRound, player.id) };
    }
    const round = state.round;
    if (session.status !== 'playing' || !round || round.index !== roundIndex) {
      throw httpErr('error_flap_stale_round', 409);
    }
    if (!round.participants.includes(player.id)) throw httpErr('error_flap_not_in_round', 403);
    const current = round.results[player.id];
    // idempotence : déjà résolu (retry réseau, ou résolu d'office entre-temps)
    if (current && !current.alive) return { session, result: current };

    if (!Number.isInteger(frame) || frame < 0 || frame > SIM.MAX_FRAMES) {
      throw httpErr('error_flap_bad_flaps', 400);
    }
    if (!isValidFlapList(input.flaps)) throw httpErr('error_flap_bad_flaps', 400);
    const flaps = input.flaps.filter((f) => f <= frame);
    if (flaps.length > FLAP_MAX_FLAPS) throw httpErr('error_flap_bad_flaps', 400);
    // anti-triche temporelle : une mort à la frame F ne peut pas être déclarée
    // avant l'instant F (1,5 s de tolérance réseau + horloge)
    if (Date.now() + 1500 < round.startsAt + frameToMs(frame)) throw httpErr('error_flap_too_early', 400);

    const result = replayDeath(round.seed, flaps, frame);
    if (result.mismatch) {
      console.warn(
        `[flappybar] mismatch session=${session.id} player=${player.id} round=${round.index} ` +
          `client=${frame} server=${result.deathFrame} flaps=${flaps.length}`,
      );
    }
    round.results[player.id] = result;
    markDirty(session);
    emitFlapEvent('player_dead', {
      sessionId: session.id,
      playerId: player.id,
      frame: result.deathFrame ?? frame,
      distance: result.distance,
    });
    await maybeEndRound(session, state);
    return { session, result };
  });
}

/**
 * Résolution d'office d'un joueur muet, appelée par le pont WebSocket après
 * le délai de grâce. Sans effet s'il a déclaré sa mort entre-temps.
 */
export async function forceResolvePlayer(sessionId: string, playerId: string): Promise<SessionRow> {
  return withSession(sessionId, async (session) => {
    if (session.mode !== 'flappybar' || session.status !== 'playing') return session;
    const state = flapStateOf(session);
    const round = state.round;
    if (!round || !round.participants.includes(playerId) || !round.results[playerId]?.alive) {
      return session;
    }
    resolveAlive(session, state, playerId);
    await maybeEndRound(session, state);
    return session;
  });
}

// ---------------------------------------------------------------------------
// Action staff (console /api/game)
// ---------------------------------------------------------------------------

export async function flapGmAction(sessionId: string, action: string): Promise<SessionRow> {
  if (action !== 'terminate') {
    throw httpErr(`Action inconnue pour une partie de Flappy Bar: ${action}`, 400);
  }
  return withSession(sessionId, async (session) => {
    ensureFlap(session);
    if (isEnded(session)) return session;
    const state = flapStateOf(session);
    // la manche en cours est classée (et ses records appliqués après commit)
    if (session.status === 'playing' && state.round) finishRoundSync(session, state, 'terminated');
    cancelGame(session, state);
    return session;
  });
}

export async function listOpenFlapSessions(): Promise<SessionRow[]> {
  return listOpenSessions('flappybar', 30);
}

// ---------------------------------------------------------------------------
// Transitions automatiques
// ---------------------------------------------------------------------------

function flapAdvance(session: SessionRow): boolean {
  const state = flapStateOf(session);
  if (session.status === 'lobby') {
    // TTL du lobby écoulé : personne n'a bougé, on ferme
    cancelGame(session, state);
    return true;
  }
  if (session.status === 'playing') {
    if (!state.round) {
      // incohérence (ne devrait pas arriver) : on rend la main au lobby plutôt que de boucler
      session.status = 'lobby';
      refreshLobbyTtl(session);
      markDirty(session);
      return true;
    }
    // plafond de manche : les survivants sont résolus d'office
    finishRoundSync(session, state, 'cap');
    return true;
  }
  return false;
}

registerAdvancer('flappybar', flapAdvance);

/**
 * L'advancer est synchrone : les records (upsert asynchrone) d'une manche
 * close par le plafond ou l'arrêt staff sont appliqués dans un commit séparé,
 * juste après. Sans effet si la clôture « tous morts » les a déjà appliqués.
 */
onFlapEvent('round_ended', ({ sessionId }) => {
  setImmediate(() => {
    withSession(sessionId, ensureRecordsApplied).catch((err) =>
      console.error('[flappybar] records post-manche', err),
    );
  });
});

/**
 * Payload d'accélération du signal 'sync' : un SNAPSHOT COMPLET de la vue
 * publique. À N joueurs, plusieurs acteurs mutent l'état presque en même
 * temps (morts en rafale) : un delta séquentiel raterait sa cible une fois
 * sur deux, un snapshot s'applique dès que sa version est plus récente.
 * L'état d'une partie est petit (pas de flaps dedans), le poids reste
 * négligeable.
 */
registerSyncPayload('flappybar', (session) => ({ snapshot: buildFlapPublicState(session) }));
