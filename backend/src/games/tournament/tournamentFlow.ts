/**
 * Tournoi : I/O et cycle de vie sur le moteur de sessions.
 *
 * Toute la logique vit dans core.ts (réducteurs purs) et swiss.ts : ce
 * fichier ne fait que charger, verrouiller (withSession), appeler un
 * réducteur, poser le statut de session et persister.
 *
 *   create ─► lobby (inscriptions, phase_ends_at = fin du compte à rebours)
 *     └─ advancer : ronde 1 si ≥ 2 joueurs, sinon attente du GM
 *   playing : rondes (phase 'round' / 'round_done'), phase_ends_at = null
 *   end     : podium (phase 'final'), phase_ends_at = +30 min puis clôture
 *   ended_at posé : écrans rendus (écouteur de commit), tournoi terminé
 *
 * Invariant du balayeur : l'advancer repousse TOUJOURS phase_ends_at ou le
 * met à null ; sinon la session occuperait pour toujours un de ses créneaux.
 * Les effets de bord (écrans) partent de l'écouteur de commit, jamais de
 * l'advancer : si l'action qui suit lève une erreur, la sauvegarde est
 * perdue mais un effet de bord, lui, serait déjà parti.
 */

import crypto from 'crypto';
import { supabaseAdmin } from '../../config/supabase.js';
import {
  endActiveSessions,
  generatePlayerToken,
  insertSession,
  loadSession,
  markDirty,
  registerAdvancer,
  registerCommitListener,
  registerSyncPayload,
  validatePseudo,
  withSession,
} from '../engine.js';
import { switchScreensToDefault, switchScreensToGame } from '../screens.js';
import * as core from './core.js';
import { decideMatch, pointsFor, pseudoKey } from './swiss.js';
import { normalizeTournamentConfig, patchTournamentConfig } from './registry.js';
import { buildTournamentPublicState } from './tournamentViews.js';
import {
  TOURNAMENT_FINAL_TTL_MS,
  TOURNAMENT_IDLE_TTL_MS,
  httpErr,
  tournamentConfigOf,
  tournamentStateOf,
  type CloseReason,
  type Side,
  type TournamentConfig,
  type TournamentState,
} from './types.js';
import type { PlayerRow, SessionRow } from '../types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const rng = (): number => crypto.randomInt(0, 2 ** 32) / 2 ** 32;

function iso(t: number = Date.now()): string {
  return new Date(t).toISOString();
}

function ctxOf(session: SessionRow): core.CoreCtx {
  return { cfg: tournamentConfigOf(session), now: Date.now(), rng };
}

function ensureTournament(session: SessionRow | null): SessionRow {
  if (!session || session.mode !== 'tournament') throw httpErr('error_tournament_not_found', 404);
  return session;
}

/** la phase dicte le statut de session (lobby / playing / end) */
function syncStatus(session: SessionRow, state: TournamentState): void {
  if (session.ended_at) return;
  const target = state.phase === 'registration' ? 'lobby' : state.phase === 'final' ? 'end' : 'playing';
  if (session.status !== target) session.status = target;
}

/** soft delete (jamais de DELETE dur) : le pseudo est libéré */
async function softDeletePlayer(player: Pick<PlayerRow, 'id' | 'pseudo_norm'>): Promise<void> {
  await supabaseAdmin
    .from('game_players')
    .update({ status: 'removed', pseudo_norm: `${player.pseudo_norm}:left:${player.id}` })
    .eq('id', player.id);
}

async function insertTournamentPlayer(
  sessionId: string,
  pseudo: string,
  key: string,
  device: string,
): Promise<PlayerRow> {
  const { data, error } = await supabaseAdmin
    .from('game_players')
    .insert({
      session_id: sessionId,
      pseudo,
      // clé normalisée (accents, casse, espaces) : la contrainte UNIQUE
      // (session_id, pseudo_norm) interdit Théo et Theo dans le même tournoi
      pseudo_norm: key,
      device: device || 'mobile',
      player_token: generatePlayerToken(),
      bonuses: {},
      stats: {},
    })
    .select('*')
    .single();
  if (error) {
    if (`${error.message}`.includes('duplicate') || error.code === '23505') {
      throw httpErr('error_player_already_exists', 409);
    }
    throw error;
  }
  return data as PlayerRow;
}

function checkPseudo(pseudo: string): { trimmed: string; key: string } {
  const validationError = validatePseudo(pseudo ?? '');
  if (validationError) throw httpErr(validationError, 400);
  const trimmed = pseudo.trim();
  return { trimmed, key: pseudoKey(trimmed) };
}

// ---------------------------------------------------------------------------
// Exclusivité du projecteur (quiz / battle / tournoi)
// ---------------------------------------------------------------------------

interface ProjectorRow {
  id: string;
  mode: string;
  config: { testMode?: boolean } | null;
}

async function activeProjectorSessions(): Promise<ProjectorRow[]> {
  const { data, error } = await supabaseAdmin
    .from('game_sessions')
    .select('id, mode, config')
    .is('ended_at', null)
    .in('mode', ['quiz', 'battle', 'tournament'])
    .order('created_at', { ascending: false })
    .limit(10);
  if (error) throw error;
  return (data as ProjectorRow[]) ?? [];
}

/** vrais tournois ouverts (un tournoi de test n'occupe pas les écrans) */
export async function activeLiveTournaments(): Promise<string[]> {
  const rows = await activeProjectorSessions();
  return rows.filter((r) => r.mode === 'tournament' && r.config?.testMode !== true).map((r) => r.id);
}

/**
 * Avant de lancer un quiz ou une battle : un vrai tournoi en cours bloque le
 * lancement (409) sauf confirmation explicite (force), auquel cas il est clos
 * proprement, sans rendre les écrans (le quiz les reprend aussitôt).
 */
export async function clearProjectorForQuiz(force: boolean): Promise<void> {
  const tournaments = await activeLiveTournaments();
  if (tournaments.length === 0) return;
  if (!force) throw httpErr('error_tournament_active', 409);
  for (const id of tournaments) await abortTournament(id, 'preempted');
}

// ---------------------------------------------------------------------------
// Création
// ---------------------------------------------------------------------------

export interface CreateTournamentOptions {
  force?: boolean;
  templateId?: string | null;
  templateName?: string | null;
}

export async function createTournamentSession(
  configInput: unknown,
  opts: CreateTournamentOptions = {},
): Promise<SessionRow> {
  const cfg: TournamentConfig = normalizeTournamentConfig({
    ...((configInput && typeof configInput === 'object' ? configInput : {}) as object),
    templateId: opts.templateId ?? null,
    templateName: opts.templateName ?? null,
  });
  if (!cfg.testMode) {
    const active = await activeProjectorSessions();
    const quizBattle = active.filter((r) => r.mode === 'quiz' || r.mode === 'battle');
    const tournaments = active.filter((r) => r.mode === 'tournament' && r.config?.testMode !== true);
    if ((quizBattle.length > 0 || tournaments.length > 0) && !opts.force) {
      throw httpErr(tournaments.length > 0 ? 'error_tournament_active' : 'error_projector_busy', 409);
    }
    for (const t of tournaments) await abortTournament(t.id, 'preempted');
    if (quizBattle.length > 0) await endActiveSessions(['quiz', 'battle']);
  }
  const now = Date.now();
  const inserted = await insertSession({
    mode: 'tournament',
    status: 'lobby',
    config: cfg,
    runtime: { tournament: core.createInitialState(now) },
    phaseStartedAt: iso(now),
    phaseEndsAt: iso(now + cfg.registrationMin * 60_000),
  });
  if (opts.templateId) {
    void supabaseAdmin
      .from('competition_templates')
      .update({ last_used_at: iso(now) })
      .eq('id', opts.templateId)
      .then(() => undefined);
  }
  // premier commit : arme le minuteur du compte à rebours et prévient les
  // écouteurs (instantané du pont échecs)
  return withSession(inserted.id, async (s) => {
    markDirty(s);
    return s;
  });
}

// ---------------------------------------------------------------------------
// Joueurs (routes publiques)
// ---------------------------------------------------------------------------

export async function joinTournament(
  sessionIdOrCode: string,
  pseudo: string,
  device: string,
): Promise<{ session: SessionRow; player: PlayerRow }> {
  const { trimmed, key } = checkPseudo(pseudo);
  const pre = ensureTournament(await loadSession(sessionIdOrCode));
  if (pre.ended_at) throw httpErr('error_tournament_over', 409);
  const preState = tournamentStateOf(pre);

  // Joueur inscrit par le GM, sans téléphone : le premier téléphone qui tape
  // ce pseudo le reprend (jeton existant), au lieu d'un 409 incompréhensible.
  const claimed = Object.entries(preState.roster).find(([, r]) => r.key === key && r.gmAdded === true);
  if (claimed) {
    const [playerId] = claimed;
    const { data } = await supabaseAdmin.from('game_players').select('*').eq('id', playerId).maybeSingle();
    const row = data as PlayerRow | null;
    if (row && row.status !== 'removed') {
      const session = await withSession(pre.id, async (s) => {
        const entry = tournamentStateOf(s).roster[playerId];
        if (entry) {
          delete entry.gmAdded;
          entry.device = device || 'mobile';
          markDirty(s);
        }
        return s;
      });
      void supabaseAdmin
        .from('game_players')
        .update({ device: device || 'mobile' })
        .eq('id', playerId)
        .then(() => undefined);
      return { session, player: row };
    }
  }

  // refus rapide avant l'insert (mêmes règles que sous verrou)
  core.assertCanJoin(preState, ctxOf(pre), key, false);
  const player = await insertTournamentPlayer(pre.id, trimmed, key, device);
  try {
    const session = await withSession(pre.id, async (s) => {
      if (s.ended_at) throw httpErr('error_tournament_over', 409);
      core.addPlayer(tournamentStateOf(s), ctxOf(s), {
        playerId: player.id,
        pseudo: trimmed,
        key,
        device: device || 'mobile',
      });
      markDirty(s);
      return s;
    });
    return { session, player };
  } catch (err) {
    // sinon le pseudo resterait pris sans figurer au roster : chaque nouvel
    // essai répondrait « pseudo déjà pris »
    await softDeletePlayer(player).catch(() => undefined);
    throw err;
  }
}

export async function leaveTournament(sessionId: string, player: PlayerRow): Promise<SessionRow> {
  let removed = false;
  const session = await withSession(sessionId, async (s) => {
    ensureTournament(s);
    if (s.ended_at) throw httpErr('error_tournament_over', 409);
    const st = tournamentStateOf(s);
    removed = core.leavePlayer(st, ctxOf(s), player.id, 'self');
    syncStatus(s, st);
    markDirty(s);
    return s;
  });
  if (removed) await softDeletePlayer(player).catch(() => undefined);
  return session;
}

export async function rejoinTournament(sessionId: string, player: PlayerRow): Promise<SessionRow> {
  return withSession(sessionId, async (s) => {
    ensureTournament(s);
    if (s.ended_at) throw httpErr('error_tournament_over', 409);
    core.reinstatePlayer(tournamentStateOf(s), ctxOf(s), player.id, 'self');
    markDirty(s);
    return s;
  });
}

// ---------------------------------------------------------------------------
// Actions GM
// ---------------------------------------------------------------------------

export interface TournamentActionParams {
  minutes?: number;
  matchId?: string;
  result?: string;
  winner?: string;
  playerId?: string;
  delta?: number;
  reason?: string;
  pseudo?: string;
  view?: string | null;
  seconds?: number;
  config?: unknown;
}

const GM_RESULTS = new Set(['a', 'b', 'draw', 'forfeit_a', 'forfeit_b', 'cancelled', 'bye', 'reset']);

/** barème modifié en cours de route : les points des matchs joués suivent */
function recomputeMatchPoints(state: TournamentState, cfg: TournamentConfig): void {
  for (const round of state.rounds) {
    for (const m of round.matches) {
      if (m.status !== 'done' || !m.result) continue;
      if (m.kind === 'bye') {
        m.points = { a: cfg.points.bye, b: 0 };
      } else if (m.gmLocked || m.result === 'forfeit_a' || m.result === 'forfeit_b') {
        m.points = pointsFor(m, m.result, cfg, 'override');
      } else {
        const d = decideMatch(m, cfg);
        m.points = d.decided ? d.points : pointsFor(m, m.result, cfg, 'games');
      }
    }
  }
}

function closeSession(session: SessionRow, state: TournamentState, reason: CloseReason): void {
  if (session.ended_at) return;
  state.closeReason = reason;
  state.lastMutationAt = iso();
  session.status = 'end';
  session.ended_at = iso();
  session.phase_ends_at = null;
  markDirty(session);
}

export async function tournamentGmAction(
  sessionId: string,
  action: string,
  params: TournamentActionParams = {},
): Promise<SessionRow> {
  // actions à effet externe hors verrou
  if (action === 'rescreen') {
    const s = ensureTournament(await loadSession(sessionId));
    if (s.ended_at) throw httpErr('error_tournament_over', 409);
    if (!tournamentConfigOf(s).testMode) switchScreensToGame(`tournament ${s.id.slice(0, 8)} rescreen`);
    return s;
  }

  let toSoftDelete: PlayerRow | null = null;
  const session = await withSession(sessionId, async (s) => {
    ensureTournament(s);
    const st = tournamentStateOf(s);
    const ctx = ctxOf(s);
    if (s.ended_at && action !== 'close') throw httpErr('error_tournament_over', 409);

    switch (action) {
      case 'start-now': {
        if (st.phase !== 'registration') throw httpErr('error_tournament_already_started', 409);
        core.startRound(st, ctx);
        s.started_at = iso();
        s.phase_started_at = iso();
        s.phase_ends_at = null;
        break;
      }
      case 'add-time': {
        if (st.phase !== 'registration') throw httpErr('error_tournament_already_started', 409);
        const minutes = Number(params.minutes);
        if (!Number.isFinite(minutes) || minutes <= 0 || minutes > 60) throw httpErr('error_tournament_bad_minutes', 400);
        const base = Math.max(Date.now(), s.phase_ends_at ? Date.parse(s.phase_ends_at) : Date.now());
        s.phase_ends_at = iso(base + Math.round(minutes * 60_000));
        st.waitingForPlayers = false;
        st.lastMutationAt = iso();
        break;
      }
      case 'next-round': {
        if (st.phase !== 'round_done') throw httpErr('error_tournament_round_in_progress', 409);
        core.startRound(st, ctx);
        s.phase_started_at = iso();
        break;
      }
      case 'record-game': {
        const w = params.winner;
        if (w !== 'a' && w !== 'b' && w !== 'draw') throw httpErr('error_tournament_bad_result', 400);
        core.recordGmGame(st, ctx, String(params.matchId ?? ''), w === 'draw' ? null : (w as Side));
        break;
      }
      case 'set-match-result': {
        const r = String(params.result ?? '');
        if (!GM_RESULTS.has(r)) throw httpErr('error_tournament_bad_result', 400);
        core.setMatchResult(st, ctx, String(params.matchId ?? ''), r as core.GmMatchResult);
        break;
      }
      case 'assign-floater':
        core.assignFloater(st, ctx, String(params.playerId ?? ''));
        break;
      case 'grant-bye':
        core.grantBye(st, ctx);
        break;
      case 'adjust-score':
        core.adjustScore(st, ctx, String(params.playerId ?? ''), Number(params.delta), String(params.reason ?? ''));
        break;
      case 'clear-adjustments':
        core.clearAdjustments(st, ctx, String(params.playerId ?? ''));
        break;
      case 'add-player': {
        const { trimmed, key } = checkPseudo(String(params.pseudo ?? ''));
        core.assertCanJoin(st, ctx, key, true);
        const player = await insertTournamentPlayer(s.id, trimmed, key, 'gm');
        try {
          core.addPlayer(st, ctx, { playerId: player.id, pseudo: trimmed, key, device: 'gm', gmAdded: true });
        } catch (err) {
          await softDeletePlayer(player).catch(() => undefined);
          throw err;
        }
        break;
      }
      case 'rename-player': {
        const playerId = String(params.playerId ?? '');
        if (!st.roster[playerId]) throw httpErr('error_unknown_player', 404);
        const { trimmed, key } = checkPseudo(String(params.pseudo ?? ''));
        if (Object.entries(st.roster).some(([id, r]) => id !== playerId && r.key === key)) {
          throw httpErr('error_player_already_exists', 409);
        }
        const { error } = await supabaseAdmin
          .from('game_players')
          .update({ pseudo: trimmed, pseudo_norm: key })
          .eq('id', playerId);
        if (error) {
          if (`${error.message}`.includes('duplicate') || error.code === '23505') {
            throw httpErr('error_player_already_exists', 409);
          }
          throw error;
        }
        core.renamePlayer(st, ctx, playerId, trimmed, key);
        break;
      }
      case 'exclude-player': {
        const playerId = String(params.playerId ?? '');
        const removed = core.leavePlayer(st, ctx, playerId, 'gm');
        if (removed) {
          const { data } = await supabaseAdmin.from('game_players').select('id, pseudo_norm').eq('id', playerId).maybeSingle();
          if (data) toSoftDelete = data as PlayerRow;
        }
        break;
      }
      case 'reinstate-player':
        core.reinstatePlayer(st, ctx, String(params.playerId ?? ''), 'gm');
        break;
      case 'close-round':
        core.closeRound(st, ctx);
        break;
      case 'pin-screen': {
        const view = params.view ?? null;
        if (view !== null && view !== 'standings' && view !== 'round' && view !== 'match') {
          throw httpErr('error_tournament_bad_view', 400);
        }
        core.setPin(st, ctx, view, params.matchId ?? null, Number(params.seconds ?? 60));
        break;
      }
      case 'set-config': {
        const next = patchTournamentConfig(tournamentConfigOf(s), params.config);
        s.config = next as unknown as SessionRow['config'];
        recomputeMatchPoints(st, next);
        core.commit(st, { ...ctx, cfg: next });
        break;
      }
      case 'finish': {
        if (st.phase === 'final') break;
        core.finishTournament(st, ctx);
        s.phase_started_at = iso();
        s.phase_ends_at = iso(Date.now() + TOURNAMENT_FINAL_TTL_MS);
        break;
      }
      case 'close':
        closeSession(s, st, 'close');
        return s;
      case 'abort':
        closeSession(s, st, 'abort');
        return s;
      default:
        throw httpErr(`Action inconnue pour un tournoi : ${action}`, 400);
    }
    syncStatus(s, st);
    markDirty(s);
    return s;
  });
  if (toSoftDelete) await softDeletePlayer(toSoftDelete).catch(() => undefined);
  return session;
}

/** clôture sans passer par la console : lancement forcé d'un quiz, oubli */
export async function abortTournament(sessionId: string, reason: CloseReason): Promise<SessionRow> {
  return withSession(sessionId, async (s) => {
    ensureTournament(s);
    closeSession(s, tournamentStateOf(s), reason);
    return s;
  });
}

/** tournoi oublié : revérifié sous verrou avant de clore */
export async function closeIdleTournament(sessionId: string): Promise<void> {
  await withSession(sessionId, async (s) => {
    ensureTournament(s);
    const st = tournamentStateOf(s);
    if (Date.now() - Date.parse(st.lastMutationAt) < TOURNAMENT_IDLE_TTL_MS) return s;
    closeSession(s, st, 'idle');
    return s;
  });
}

// ---------------------------------------------------------------------------
// Remontées des jeux (pont échecs)
// ---------------------------------------------------------------------------

export async function recordExternalGame(
  tournamentId: string,
  input: core.ExternalGameInput,
): Promise<core.RecordOutcome> {
  let outcome: core.RecordOutcome = { counted: false, reason: 'closed', changed: false };
  await withSession(tournamentId, async (s) => {
    if (s.mode !== 'tournament' || s.ended_at) return s;
    const st = tournamentStateOf(s);
    outcome = core.recordExternalGame(st, ctxOf(s), input);
    if (outcome.counted || outcome.changed) {
      syncStatus(s, st);
      markDirty(s);
    }
    return s;
  });
  return outcome;
}

export async function markExternalLive(tournamentId: string, input: core.LiveGameInput): Promise<boolean> {
  let changed = false;
  await withSession(tournamentId, async (s) => {
    if (s.mode !== 'tournament' || s.ended_at) return s;
    changed = core.markLive(tournamentStateOf(s), ctxOf(s), input);
    if (changed) markDirty(s);
    return s;
  });
  return changed;
}

export async function clearExternalLive(tournamentId: string, ref: string): Promise<boolean> {
  let changed = false;
  await withSession(tournamentId, async (s) => {
    if (s.mode !== 'tournament' || s.ended_at) return s;
    const st = tournamentStateOf(s);
    changed = core.clearLive(st, ctxOf(s), ref);
    if (changed) {
      syncStatus(s, st);
      markDirty(s);
    }
    return s;
  });
  return changed;
}

// ---------------------------------------------------------------------------
// Transitions automatiques, signal, écrans
// ---------------------------------------------------------------------------

function tournamentAdvance(session: SessionRow): boolean {
  const st = tournamentStateOf(session);
  const now = Date.now();
  if (!session.ended_at && session.status === 'lobby' && st.phase === 'registration') {
    // fin du compte à rebours : tirage de la ronde 1, ou attente du GM
    if (core.activeIds(st).length >= 2) {
      try {
        core.startRound(st, ctxOf(session));
        session.status = 'playing';
        session.started_at = iso(now);
        session.phase_started_at = iso(now);
      } catch (err) {
        console.error('[tournament] tirage automatique impossible', err);
        st.waitingForPlayers = true;
      }
    } else {
      st.waitingForPlayers = true;
      st.lastMutationAt = iso(now);
    }
    session.phase_ends_at = null;
    return true;
  }
  if (!session.ended_at && session.status === 'end' && st.phase === 'final') {
    // le podium a eu son temps : les écrans reviennent à leur défaut
    st.closeReason = st.closeReason ?? 'final_ttl';
    session.ended_at = iso(now);
    session.phase_ends_at = null;
    return true;
  }
  // branche par défaut : jamais d'échéance passée laissée derrière soi
  session.phase_ends_at = null;
  return true;
}

registerAdvancer('tournament', tournamentAdvance);

/** instantané complet de la vue publique dans le signal (cf. tournamentViews) */
registerSyncPayload('tournament', (session) => ({ snapshot: buildTournamentPublicState(session) }));

/**
 * Tournoi clos : les postes du bar reviennent à leur écran par défaut, sauf
 * tournoi de test (il n'avait rien basculé) ou clôture par le lancement forcé
 * d'un quiz (qui vient de prendre les écrans).
 */
registerCommitListener((session, before) => {
  if (session.mode !== 'tournament') return;
  if (before.endedAt || !session.ended_at) return;
  const cfg = tournamentConfigOf(session);
  const reason = tournamentStateOf(session).closeReason;
  if (cfg.testMode || reason === 'preempted') return;
  switchScreensToDefault(`tournament ${reason ?? 'end'}`);
});
