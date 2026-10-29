/**
 * Machine à états de BAR INVADERS (Space Invaders multijoueur entre tables,
 * 1 à 8 joueurs, chacun sa partie sur sa dalle).
 *
 * Cycle d'une partie :
 *   lobby (salle d'attente) ─► playing (compte à rebours commun puis manche)
 *   ─► lobby (classement de la manche dans `lastRound`, verrou de relance)
 *   ─► playing ... ─► end (lobby expiré, plus personne, arrêt staff).
 *
 * Principes hérités du moteur (quiz/échecs/blackjack/Flappy Bar) :
 *   - état complet dans runtime.barinvaders, toute mutation sous withSession ;
 *   - phase_ends_at porte l'échéance : TTL du lobby, ou plafond de la manche
 *     (`round.capAt`) ; l'advancer (synchrone) résout d'office les survivants ;
 *   - le broadcast est un SNAPSHOT complet (registerSyncPayload).
 *
 * Ce qui est propre à ce jeu :
 *   - les entrées en direct ne passent pas par ici (WebSocket + invStore) ;
 *   - le client déclare sa fin de partie avec la liste de ses entrées, le
 *     serveur REJOUE la simulation déterministe (invSim) et impose le score ;
 *   - un joueur muet (socket morte, plafond) est résolu d'office à partir des
 *     entrées reçues par le pont, jusqu'à son filigrane ;
 *   - la manche se termine quand le dernier joueur encore en jeu est résolu ;
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
import { SIM, frameToMs, isValidInputList, simulate, type InvSimState } from './invSim.js';
import * as invStore from './invStore.js';
import { emitInvEvent, onInvEvent } from './invStore.js';
import {
  INV_COUNTDOWN_MS,
  INV_DEATH_TOLERANCE_FRAMES,
  INV_IDLE_AFTER_ROUND_MS,
  INV_INVITE_COOLDOWN_MS,
  INV_LOBBY_TOPIC,
  INV_LOBBY_TTL_MS,
  INV_MAX_INPUTS,
  INV_MAX_PLAYERS,
  INV_MIN_PLAYERS_TO_START,
  INV_RECORDS_MODE,
  INV_RECORDS_TOPIC,
  INV_ROUND_CAP_MS,
  activePlayers,
  aliveCount,
  invConfigOf,
  invStateOf,
  playerOf,
  presentPlayers,
  restartUnlockAt,
  type InvConfig,
  type InvEndReason,
  type InvLastRound,
  type InvPlayer,
  type InvRankingEntry,
  type InvRound,
  type InvRoundEnd,
  type InvRoundResult,
  type InvState,
} from './types.js';
import { buildInvPublicState } from './invViews.js';
import type { PlayerRow, SessionRow } from '../types.js';

// ---------------------------------------------------------------------------
// Helpers internes
// ---------------------------------------------------------------------------

const FRAME_MS = 1000 / SIM.FPS;

function httpErr(message: string, httpStatus: number): Error {
  return Object.assign(new Error(message), { httpStatus });
}

function notifyLobby(): void {
  void broadcastTopic(INV_LOBBY_TOPIC, 'sync', {}).catch(() => undefined);
}

function nowIso(): string {
  return new Date().toISOString();
}

function ensureInv(session: SessionRow): void {
  if (session.mode !== 'barinvaders') throw httpErr('Session introuvable', 404);
}

function isEnded(session: SessionRow): boolean {
  return session.status === 'end' || session.ended_at !== null;
}

/** le lobby vit tant qu'il bouge : chaque arrivée repousse l'échéance */
function refreshLobbyTtl(session: SessionRow): void {
  session.phase_started_at = nowIso();
  session.phase_ends_at = new Date(Date.now() + INV_LOBBY_TTL_MS).toISOString();
}

function freshResult(): InvRoundResult {
  return {
    alive: true,
    overFrame: null,
    score: 0,
    wave: 1,
    kills: 0,
    ufoHits: 0,
    timeMs: 0,
    resolvedBy: null,
    mismatch: false,
  };
}

/** résultat lu dans un état de sim terminé (ou arrêté) à la frame `overFrame` */
function resultOf(sim: InvSimState, overFrame: number, resolvedBy: 'client' | 'server', mismatch: boolean): InvRoundResult {
  return {
    alive: false,
    overFrame,
    score: sim.score,
    wave: sim.wave,
    kills: sim.kills,
    ufoHits: sim.ufoHits,
    timeMs: frameToMs(overFrame),
    resolvedBy,
    mismatch,
  };
}

function makePlayer(state: InvState, row: PlayerRow, status: 'active' | 'pending'): InvPlayer {
  state.joinCounter += 1;
  return {
    playerId: row.id,
    pseudo: row.pseudo,
    device: row.device,
    joinedSeq: state.joinCounter,
    joinedAt: Date.now(),
    status,
    bestScore: 0,
    roundsWon: 0,
  };
}

/**
 * Insert d'un joueur. Deux "Alex" dans la même partie sont ACCEPTÉS (comme au
 * blackjack et à Flappy Bar) : la contrainte UNIQUE(session_id, pseudo_norm)
 * est contournée par un suffixe technique sur pseudo_norm, le pseudo affiché
 * reste identique.
 */
async function insertInvPlayer(sessionId: string, pseudo: string, device: string): Promise<PlayerRow> {
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
async function removeInvPlayer(player: PlayerRow): Promise<void> {
  await supabaseAdmin
    .from('game_players')
    .update({ status: 'removed', pseudo_norm: `${player.pseudo_norm}:left:${player.id}` })
    .eq('id', player.id);
}

// ---------------------------------------------------------------------------
// Création / join
// ---------------------------------------------------------------------------

export interface CreateInvInput {
  pseudo: string;
  device: string;
  /** défaut : INV_MAX_PLAYERS */
  maxPlayers?: number | null;
}

export async function createInvSession(
  input: CreateInvInput,
): Promise<{ session: SessionRow; player: PlayerRow }> {
  const validationError = validatePseudo(input.pseudo ?? '');
  if (validationError) throw httpErr(validationError, 400);
  const maxPlayers =
    input.maxPlayers === undefined || input.maxPlayers === null ? INV_MAX_PLAYERS : Number(input.maxPlayers);
  if (!Number.isInteger(maxPlayers) || maxPlayers < 1 || maxPlayers > INV_MAX_PLAYERS) {
    throw httpErr('error_inv_bad_config', 400);
  }

  const config: InvConfig = {
    maxPlayers,
    // seul le créateur lance et relance les manches (même règle que Flappy Bar)
    hostOnlyStart: true,
    countdownMs: INV_COUNTDOWN_MS,
    roundCapMs: INV_ROUND_CAP_MS,
    creatorPseudo: input.pseudo.trim(),
  };
  const state: InvState = {
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
    mode: 'barinvaders',
    status: 'lobby',
    config,
    runtime: { barinvaders: state },
    phaseStartedAt: nowIso(),
    phaseEndsAt: new Date(Date.now() + INV_LOBBY_TTL_MS).toISOString(),
  });
  const player = await insertInvPlayer(session.id, input.pseudo, input.device);
  const committed = await withSession(session.id, async (s) => {
    const st = invStateOf(s);
    st.hostPlayerId = player.id;
    st.players[player.id] = makePlayer(st, player, 'active');
    markDirty(s);
    return s;
  });
  notifyLobby();
  return { session: committed, player };
}

export async function joinInvSession(
  sessionId: string,
  pseudo: string,
  device: string,
): Promise<{ session: SessionRow; player: PlayerRow }> {
  const existing = await loadSession(sessionId);
  if (!existing || existing.mode !== 'barinvaders') throw httpErr('Session introuvable', 404);
  if (isEnded(existing)) throw httpErr('error_inv_game_over', 409);

  // reprise par dalle : au bar, l'écran EST l'identité physique. Si cette
  // dalle a déjà une place (localStorage perdu, navigateur redémarré), on lui
  // rend sa place au lieu de la laisser dehors ou de la dédoubler.
  const dev = (device || 'unknown').toUpperCase();
  if (dev !== 'UNKNOWN') {
    const seated = presentPlayers(invStateOf(existing)).find((p) => p.device.toUpperCase() === dev);
    if (seated) {
      const owner = (await loadPlayers(sessionId)).find((p) => p.id === seated.playerId);
      if (owner) {
        // purge les transitions dues avant de rendre l'état
        const fresh = await withSession(sessionId, async (s) => s);
        return { session: fresh, player: owner };
      }
    }
  }

  const player = await insertInvPlayer(sessionId, pseudo, device);
  try {
    const session = await withSession(sessionId, async (s) => {
      ensureInv(s);
      if (isEnded(s)) throw httpErr('error_inv_game_over', 409);
      const state = invStateOf(s);
      const config = invConfigOf(s);
      const present = presentPlayers(state);
      if (present.length >= config.maxPlayers) throw httpErr('error_inv_full', 409);
      // garde-fou de course : deux requêtes simultanées de la même dalle ne
      // doivent pas créer deux places (le chemin normal est la reprise ci-dessus)
      if (dev !== 'UNKNOWN' && present.some((p) => p.device.toUpperCase() === dev)) {
        throw httpErr('error_inv_device_seated', 409);
      }
      // arrivé pendant une manche : on regarde, on entre à la suivante
      state.players[player.id] = makePlayer(state, player, s.status === 'lobby' ? 'active' : 'pending');
      // une arrivée prolonge la salle d'attente, pas le délai de relance entre deux manches
      if (s.status === 'lobby' && state.roundsPlayed === 0) refreshLobbyTtl(s);
      markDirty(s);
      return s;
    });
    notifyLobby();
    return { session, player };
  } catch (err) {
    await removeInvPlayer(player).catch(() => undefined);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Manche : rejeu, résolution, classement
// ---------------------------------------------------------------------------

/**
 * Rejeu serveur d'une fin de partie déclarée. Le serveur gagne toujours :
 *  - fin rejouée dans la tolérance : frame serveur ;
 *  - fin rejouée plus tôt : le client a déclaré plus qu'il n'a joué, frame
 *    serveur et écart signalé ;
 *  - aucune fin rejouée jusqu'à frame + tolérance : les entrées ne
 *    reproduisent pas la fin déclarée (entrées perdues, ou triche). On garde
 *    alors la frame DÉCLARÉE (déjà bornée par l'anti-triche temporelle) avec
 *    le score que le serveur mesure à cet instant, et on signale l'écart. On
 *    ne laisse JAMAIS courir la simulation jusqu'au plafond : une liste
 *    d'entrées « immortelle » fabriquée hors ligne vaudrait sinon 20 min de
 *    jeu après quelques secondes.
 * Pure (entrées + frame) : exportée pour être testée hors base.
 */
export function replayGameOver(inputs: number[], frame: number): InvRoundResult {
  const limit = Math.min(frame + INV_DEATH_TOLERANCE_FRAMES + 1, SIM.MAX_FRAMES);
  const sim = simulate(inputs, limit);
  if (sim.over) {
    return resultOf(sim, sim.overFrame, 'client', Math.abs(sim.overFrame - frame) > INV_DEATH_TOLERANCE_FRAMES);
  }
  // état exact au début de la frame déclarée (frames 0..frame-1 jouées)
  const at = Math.min(frame, SIM.MAX_FRAMES);
  return resultOf(simulate(inputs, at), at, 'client', true);
}

/**
 * Résolution d'office d'un joueur encore en jeu (socket morte, plafond,
 * départ, arrêt staff) à partir des entrées reçues par le pont. Bornée au
 * filigrane (entrées complètes) et au temps réellement écoulé : on ne crédite
 * jamais des frames qui n'ont pas eu lieu ni des entrées inconnues.
 * Synchrone (simulation pure + mémoire) : utilisable depuis l'advancer.
 */
function resolveAlive(session: SessionRow, state: InvState, playerId: string): void {
  const round = state.round;
  if (!round) return;
  const current = round.results[playerId];
  if (!current || !current.alive) return;
  const elapsedFrame = Math.max(0, Math.min(SIM.MAX_FRAMES, Math.floor((Date.now() - round.startsAt) / FRAME_MS)));
  const mark = invStore.markOf(session.id, round.index, playerId);
  const until = mark >= 0 ? Math.min(mark + 1, elapsedFrame) : 0;
  const inputs = invStore.inputsOf(session.id, round.index, playerId);
  const sim = simulate(inputs, until);
  const overFrame = sim.over ? sim.overFrame : until;
  const result = resultOf(sim, overFrame, 'server', false);
  round.results[playerId] = result;
  markDirty(session);
  emitInvEvent('player_dead', {
    sessionId: session.id,
    playerId,
    frame: overFrame,
    score: result.score,
    wave: result.wave,
  });
}

/**
 * Classement d'une manche : score, puis vague atteinte, puis temps de jeu,
 * puis ancienneté. Rang partagé sur égalité exacte (score, vague ET temps).
 * Pur et exporté pour être testable hors base.
 */
export function buildRanking(state: InvState, round: InvRound): InvRankingEntry[] {
  const entries = round.participants.map((id) => {
    const p = state.players[id];
    const r = round.results[id];
    return {
      playerId: id,
      pseudo: p?.pseudo ?? '?',
      device: p?.device ?? 'unknown',
      joinedSeq: p?.joinedSeq ?? Number.MAX_SAFE_INTEGER,
      score: r?.score ?? 0,
      wave: r?.wave ?? 1,
      kills: r?.kills ?? 0,
      ufoHits: r?.ufoHits ?? 0,
      timeMs: r?.timeMs ?? 0,
      resolvedBy: r?.resolvedBy ?? 'server',
    };
  });
  entries.sort(
    (a, b) => b.score - a.score || b.wave - a.wave || b.timeMs - a.timeMs || a.joinedSeq - b.joinedSeq,
  );
  let rank = 0;
  return entries.map((e, i) => {
    const prev = i > 0 ? entries[i - 1] : null;
    if (!prev || prev.score !== e.score || prev.wave !== e.wave || prev.timeMs !== e.timeMs) rank = i + 1;
    return {
      rank,
      playerId: e.playerId,
      pseudo: e.pseudo,
      device: e.device,
      score: e.score,
      wave: e.wave,
      kills: e.kills,
      ufoHits: e.ufoHits,
      timeMs: e.timeMs,
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
function finishRoundSync(session: SessionRow, state: InvState, endedBy: InvRoundEnd): void {
  const round = state.round;
  if (!round) return;
  for (const id of round.participants) {
    if (round.results[id]?.alive) resolveAlive(session, state, id);
  }
  const ranking = buildRanking(state, round);
  for (const entry of ranking) {
    const p = state.players[entry.playerId];
    if (!p) continue;
    if (entry.rank === 1 && entry.score > 0) p.roundsWon += 1;
    if (entry.score > p.bestScore) p.bestScore = entry.score;
  }
  state.lastRound = {
    index: round.index,
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
  // 2 min pour relancer, sinon la partie se ferme et les dalles retournent au lobby
  session.phase_started_at = nowIso();
  session.phase_ends_at = new Date(Date.now() + INV_IDLE_AFTER_ROUND_MS).toISOString();
  markDirty(session);
  emitInvEvent('round_ended', { sessionId: session.id, index: round.index });
  notifyLobby();
}

/** fin de partie (délai sans relance, plus personne, arrêt staff) */
function cancelGame(session: SessionRow, state: InvState, reason: InvEndReason): void {
  state.round = null;
  state.endReason = reason;
  session.status = 'end';
  session.ended_at = nowIso();
  session.phase_ends_at = null;
  markDirty(session);
  notifyLobby();
  emitInvEvent('session_ended', { sessionId: session.id });
  invStore.dropSession(session.id);
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
export async function applyRoundRecords(session: SessionRow, state: InvState): Promise<void> {
  const last = state.lastRound;
  if (!last || last.records.applied) return;
  const barBefore = await bestRecord(INV_RECORDS_MODE);
  for (const entry of last.ranking) {
    if (entry.score <= 0) continue;
    const { improved, previous } = await upsertRecord({
      mode: INV_RECORDS_MODE,
      pseudo: entry.pseudo,
      score: entry.score,
      unit: 'pts',
      details: {
        wave: entry.wave,
        kills: entry.kills,
        ufo: entry.ufoHits,
        timeMs: entry.timeMs,
        roundIndex: last.index,
        sessionId: session.id,
      },
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
    if (entry.score > barScore) entry.barRecord = true;
  }
  const barAfter = await bestRecord(INV_RECORDS_MODE);
  last.records = { applied: true, barBefore, barAfter };
  state.recordsVersion += 1;
  markDirty(session);
  void broadcastTopic(INV_RECORDS_TOPIC, 'sync', {}).catch(() => undefined);
}

/** un souci de records ne doit JAMAIS faire échouer la fin d'une manche */
async function applyRoundRecordsSafe(session: SessionRow, state: InvState): Promise<void> {
  if (Date.now() < (recordsRetryAt.get(session.id) ?? 0)) return;
  try {
    await applyRoundRecords(session, state);
    recordsRetryAt.delete(session.id);
  } catch (err) {
    recordsRetryAt.set(session.id, Date.now() + RECORDS_RETRY_MS);
    console.error('[barinvaders] records non appliqués (nouvel essai plus tard)', err);
  }
}

export function recordsPending(session: SessionRow): boolean {
  const last = invStateOf(session).lastRound;
  return last !== null && !last.records.applied;
}

/** à passer à withSession : applique les records en attente (GET /state, fin de manche) */
export async function ensureRecordsApplied(session: SessionRow): Promise<SessionRow> {
  ensureInv(session);
  const state = invStateOf(session);
  if (state.lastRound && !state.lastRound.records.applied) {
    await applyRoundRecordsSafe(session, state);
  }
  return session;
}

/** plus personne en jeu : la manche se termine sans attendre le plafond */
async function maybeEndRound(session: SessionRow, state: InvState): Promise<void> {
  if (!state.round || aliveCount(state.round) > 0) return;
  finishRoundSync(session, state, 'all_dead');
  // même commit : le classement arrive aux dalles déjà décoré des records
  await applyRoundRecordsSafe(session, state);
}

// ---------------------------------------------------------------------------
// Actions joueur
// ---------------------------------------------------------------------------

export type InvPlayerAction = 'start' | 'leave' | 'invite';

export async function invPlayerAction(
  sessionId: string,
  player: PlayerRow,
  action: InvPlayerAction,
): Promise<SessionRow> {
  // la manche lancée est publiée au pont APRÈS le commit : un départ annoncé
  // aux dalles doit exister en base (propriété d'objet : TypeScript ne suit pas
  // une affectation faite dans la fermeture)
  const out: { started: InvRound | null } = { started: null };

  const session = await withSession(sessionId, async (s) => {
    ensureInv(s);
    const state = invStateOf(s);
    const config = invConfigOf(s);
    const me = playerOf(state, player.id);
    if (!me || me.status === 'left') throw httpErr('error_inv_not_seated', 403);

    switch (action) {
      case 'start': {
        if (isEnded(s)) throw httpErr('error_inv_game_over', 409);
        if (s.status !== 'lobby') throw httpErr('error_inv_not_lobby', 409);
        if (me.status !== 'active') throw httpErr('error_inv_not_seated', 403);
        if (config.hostOnlyStart && state.hostPlayerId !== player.id) {
          throw httpErr('error_inv_not_host', 403);
        }
        const now = Date.now();
        const unlock = restartUnlockAt(state);
        if (unlock !== null && now < unlock) throw httpErr('error_inv_restart_locked', 409);
        const participants = activePlayers(state).map((p) => p.playerId);
        if (participants.length < INV_MIN_PLAYERS_TO_START) throw httpErr('error_inv_need_players', 409);

        const startsAt = now + config.countdownMs;
        const round: InvRound = {
          index: state.nextRoundIndex,
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
        await removeInvPlayer(player).catch(() => undefined);
        if (state.hostPlayerId === player.id) {
          // le joueur présent depuis le plus longtemps hérite du rôle
          const next = activePlayers(state)[0] ?? presentPlayers(state)[0];
          state.hostPlayerId = next ? next.playerId : '';
        }
        if (presentPlayers(state).length === 0) {
          cancelGame(s, state, 'empty');
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
        // le bandeau. Anti-spam : une invitation par partie par cooldown.
        if (s.status !== 'lobby') throw httpErr('error_inv_not_lobby', 409);
        const now = Date.now();
        if (state.inviteAt !== null && now - state.inviteAt < INV_INVITE_COOLDOWN_MS) {
          throw httpErr('error_inv_invite_cooldown', 429);
        }
        state.inviteAt = now;
        markDirty(s);
        void broadcastTopic('tables:invites', 'invite', {
          game: 'barinvaders',
          sessionId: s.id,
          pseudo: me.pseudo,
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
    invStore.beginRound(session.id, started.index);
    emitInvEvent('round_started', {
      sessionId: session.id,
      round: {
        index: started.index,
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
// Déclaration de fin de partie
// ---------------------------------------------------------------------------

export interface InvGameOverInput {
  roundIndex: number;
  frame: number;
  inputs: number[];
}

/**
 * Validation d'une liste d'entrées déclarée : forme (frames croissantes,
 * masques 0..7), plafond absolu et densité plausible (au plus
 * SIM.MAX_INPUTS_PER_SEC changements par seconde de jeu, une seconde offerte).
 */
export function isAcceptableInputs(inputs: unknown, frame: number): inputs is number[] {
  if (!isValidInputList(inputs) || inputs.length > INV_MAX_INPUTS) return false;
  const changes = inputs.length / 2;
  return changes <= SIM.MAX_INPUTS_PER_SEC * (Math.floor(frame / SIM.FPS) + 1);
}

/** résultat d'un joueur relu depuis le classement d'une manche déjà close */
function resultFromRanking(last: InvLastRound, playerId: string): InvRoundResult | null {
  const e = last.ranking.find((x) => x.playerId === playerId);
  if (!e) return null;
  return {
    alive: false,
    overFrame: Math.round((e.timeMs * SIM.FPS) / 1000),
    score: e.score,
    wave: e.wave,
    kills: e.kills,
    ufoHits: e.ufoHits,
    timeMs: e.timeMs,
    resolvedBy: e.resolvedBy,
    mismatch: false,
  };
}

export async function reportInvGameOver(
  sessionId: string,
  player: PlayerRow,
  input: InvGameOverInput,
): Promise<{ session: SessionRow; result: InvRoundResult | null }> {
  return withSession(sessionId, async (session) => {
    ensureInv(session);
    const state = invStateOf(session);
    const { roundIndex, frame } = input;

    // idempotence : la manche est déjà close (retry réseau après la fin)
    if (session.status === 'lobby' && state.lastRound && state.lastRound.index === roundIndex) {
      return { session, result: resultFromRanking(state.lastRound, player.id) };
    }
    const round = state.round;
    if (session.status !== 'playing' || !round || round.index !== roundIndex) {
      throw httpErr('error_inv_stale_round', 409);
    }
    if (!round.participants.includes(player.id)) throw httpErr('error_inv_not_in_round', 403);
    const current = round.results[player.id];
    // idempotence : déjà résolu (retry réseau, ou résolu d'office entre-temps)
    if (current && !current.alive) return { session, result: current };

    if (!Number.isInteger(frame) || frame < 0 || frame > SIM.MAX_FRAMES) {
      throw httpErr('error_inv_bad_inputs', 400);
    }
    if (!isAcceptableInputs(input.inputs, frame)) throw httpErr('error_inv_bad_inputs', 400);
    // les changements postérieurs à la fin déclarée ne servent à rien
    const inputs: number[] = [];
    for (let i = 0; i < input.inputs.length; i += 2) {
      if (input.inputs[i] > frame) break;
      inputs.push(input.inputs[i], input.inputs[i + 1]);
    }
    // anti-triche temporelle : une fin à la frame F ne peut pas être déclarée
    // avant l'instant F (1,5 s de tolérance réseau + horloge)
    if (Date.now() + 1500 < round.startsAt + frameToMs(frame)) throw httpErr('error_inv_too_early', 400);

    const result = replayGameOver(inputs, frame);
    if (result.mismatch) {
      console.warn(
        `[barinvaders] mismatch session=${session.id} player=${player.id} round=${round.index} ` +
          `client=${frame} server=${result.overFrame} inputs=${inputs.length / 2}`,
      );
    }
    round.results[player.id] = result;
    markDirty(session);
    emitInvEvent('player_dead', {
      sessionId: session.id,
      playerId: player.id,
      frame: result.overFrame ?? frame,
      score: result.score,
      wave: result.wave,
    });
    await maybeEndRound(session, state);
    return { session, result };
  });
}

/**
 * Résolution d'office d'un joueur muet, appelée par le pont WebSocket après
 * le délai de grâce. Sans effet s'il a déclaré sa fin entre-temps.
 */
export async function forceResolvePlayer(sessionId: string, playerId: string): Promise<SessionRow> {
  return withSession(sessionId, async (session) => {
    if (session.mode !== 'barinvaders' || session.status !== 'playing') return session;
    const state = invStateOf(session);
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

export async function invGmAction(sessionId: string, action: string): Promise<SessionRow> {
  if (action !== 'terminate') {
    throw httpErr(`Action inconnue pour une partie de Bar Invaders: ${action}`, 400);
  }
  return withSession(sessionId, async (session) => {
    ensureInv(session);
    if (isEnded(session)) return session;
    const state = invStateOf(session);
    // la manche en cours est classée (et ses records appliqués après commit)
    if (session.status === 'playing' && state.round) finishRoundSync(session, state, 'terminated');
    cancelGame(session, state, 'terminated');
    return session;
  });
}

export async function listOpenInvSessions(): Promise<SessionRow[]> {
  return listOpenSessions('barinvaders', 30);
}

// ---------------------------------------------------------------------------
// Transitions automatiques
// ---------------------------------------------------------------------------

function invAdvance(session: SessionRow): boolean {
  const state = invStateOf(session);
  if (session.status === 'lobby') {
    // TTL du lobby écoulé : personne n'a bougé, on ferme
    cancelGame(session, state, 'idle');
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

registerAdvancer('barinvaders', invAdvance);

/**
 * L'advancer est synchrone : les records (upsert asynchrone) d'une manche
 * close par le plafond ou l'arrêt staff sont appliqués dans un commit séparé,
 * juste après. Sans effet si la clôture « tous finis » les a déjà appliqués.
 */
onInvEvent('round_ended', ({ sessionId }) => {
  setImmediate(() => {
    withSession(sessionId, ensureRecordsApplied).catch((err) =>
      console.error('[barinvaders] records post-manche', err),
    );
  });
});

/**
 * Payload d'accélération du signal 'sync' : un SNAPSHOT COMPLET de la vue
 * publique (même raison que Flappy Bar : des fins de partie en rafale, un
 * delta séquentiel raterait sa cible). L'état d'une partie est petit (pas
 * d'entrées dedans), le poids reste négligeable.
 */
registerSyncPayload('barinvaders', (session) => ({ snapshot: buildInvPublicState(session) }));
