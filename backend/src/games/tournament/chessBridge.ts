/**
 * Pont échecs -> tournoi.
 *
 * Le jeu d'échecs, en production et finement réglé, n'est PAS modifié : ni
 * son flow, ni ses vues, ni l'état des parties. C'est le tournoi qui observe :
 *   1. un écouteur de commit du moteur voit passer chaque commit d'échecs
 *      (chaque coup !) et filtre en O(1) contre un instantané mémoire du
 *      tournoi actif : zéro requête quand aucun tournoi ne tourne ;
 *   2. un réconciliateur relit toutes les 20 s les parties créées depuis le
 *      tirage de la ronde : il rattrape ce que l'écouteur a manqué
 *      (redémarrage Railway, conflit de sauvegarde, instantané pas encore
 *      chargé au démarrage).
 * Toute remontée est idempotente (countedRefs / voidRefs / ignored).
 *
 * Ordre des verrous : échecs puis tournoi, en fire-and-forget après le
 * commit de la partie. Jamais l'inverse.
 */

import { supabaseAdmin } from '../../config/supabase.js';
import { loadSession, registerCommitListener } from '../engine.js';
import { currentRound, isHandledRef } from './core.js';
import { gameScore, pairKey, pseudoKey } from './swiss.js';
import { TOURNAMENT_GAMES, inScope } from './registry.js';
import {
  clearExternalLive,
  closeIdleTournament,
  markExternalLive,
  recordExternalGame,
} from './tournamentFlow.js';
import {
  RECONCILE_INTERVAL_MS,
  TOURNAMENT_IDLE_TTL_MS,
  tournamentConfigOf,
  tournamentStateOf,
  type ChessSide,
  type TournamentConfig,
  type TournamentMatch,
  type TournamentState,
} from './types.js';
import type { SessionRow } from '../types.js';

/** fins de partie qui portent un vrai résultat (les autres n'ont rien joué) */
const REAL_ENDS = new Set([
  'checkmate',
  'stalemate',
  'repetition',
  'fifty_moves',
  'insufficient_material',
  'timeout',
  'timeout_vs_insufficient',
  'resign',
  'draw_agreed',
]);

interface ChessSeatLite {
  playerId?: string;
  pseudo?: string;
}

interface ChessLite {
  id: string;
  status: string;
  createdAt: number;
  ai: boolean;
  white: ChessSeatLite | null;
  black: ChessSeatLite | null;
  result: { winner: ChessSide | null; reason: string } | null;
}

// ---------------------------------------------------------------------------
// Instantané du tournoi d'échecs actif
// ---------------------------------------------------------------------------

interface Snapshot {
  sessionId: string;
  joinCode: string;
  cfg: TournamentConfig;
  state: TournamentState;
  /** clé de pseudo -> playerId */
  keys: Map<string, string>;
  /** paires de la ronde courante -> match */
  pairs: Map<string, TournamentMatch>;
  roundStartedAt: number | null;
  refreshedAt: number;
}

let snapshot: Snapshot | null = null;
let lastEmptyCheck = 0;
const SNAPSHOT_MAX_AGE_MS = 30_000;

function buildSnapshot(session: SessionRow): Snapshot {
  const cfg = tournamentConfigOf(session);
  const state = JSON.parse(JSON.stringify(tournamentStateOf(session))) as TournamentState;
  const keys = new Map<string, string>();
  for (const [id, r] of Object.entries(state.roster)) keys.set(r.key, id);
  const pairs = new Map<string, TournamentMatch>();
  const round = currentRound(state);
  if (round) {
    for (const m of round.matches) {
      if (m.b && (m.kind === 'normal' || m.kind === 'floater')) pairs.set(pairKey(m.a, m.b), m);
    }
  }
  return {
    sessionId: session.id,
    joinCode: session.join_code,
    cfg,
    state,
    keys,
    pairs,
    roundStartedAt: round ? Date.parse(round.startedAt) : null,
    refreshedAt: Date.now(),
  };
}

function isChessTournament(session: SessionRow): boolean {
  if (session.mode !== 'tournament' || session.ended_at) return false;
  const cfg = tournamentConfigOf(session);
  return cfg.game === 'chess' && inScope(cfg);
}

/** appelé à chaque commit d'un tournoi : l'instantané suit sans requête */
function refreshFromSession(session: SessionRow): void {
  if (isChessTournament(session)) {
    snapshot = buildSnapshot(session);
  } else if (snapshot?.sessionId === session.id) {
    snapshot = null;
  }
}

/** instantané frais (au plus 30 s), relu en base au besoin */
async function ensureSnapshot(force = false): Promise<Snapshot | null> {
  const now = Date.now();
  if (!force) {
    if (snapshot && now - snapshot.refreshedAt < SNAPSHOT_MAX_AGE_MS) return snapshot;
    if (!snapshot && now - lastEmptyCheck < SNAPSHOT_MAX_AGE_MS) return null;
  }
  const { data, error } = await supabaseAdmin
    .from('game_sessions')
    .select('*')
    .eq('mode', 'tournament')
    .is('ended_at', null)
    .order('created_at', { ascending: false })
    .limit(5);
  if (error) throw error;
  const found = ((data as SessionRow[]) ?? []).find(isChessTournament) ?? null;
  snapshot = found ? buildSnapshot(found) : null;
  if (!snapshot) lastEmptyCheck = now;
  return snapshot;
}

// ---------------------------------------------------------------------------
// Lecture d'une partie d'échecs (commit ou ligne relue)
// ---------------------------------------------------------------------------

function chessLiteFromSession(session: SessionRow): ChessLite | null {
  const chess = (session.runtime as { chess?: { seats?: { w?: ChessSeatLite; b?: ChessSeatLite }; result?: ChessLite['result'] } }).chess;
  if (!chess) return null;
  return {
    id: session.id,
    status: session.status,
    createdAt: Date.parse(session.created_at),
    ai: Boolean((session.config as { ai?: unknown } | null)?.ai),
    white: chess.seats?.w ?? null,
    black: chess.seats?.b ?? null,
    result: chess.result ?? null,
  };
}

interface Resolved {
  whiteKey: string;
  blackKey: string;
  match: TournamentMatch;
}

/** deux joueurs du tournoi, appariés ensemble dans la ronde courante ? */
function resolvePair(snap: Snapshot, game: ChessLite): Resolved | null {
  if (game.ai || !game.white?.pseudo || !game.black?.pseudo) return null;
  if (game.white.playerId === 'ai' || game.black.playerId === 'ai') return null;
  const whiteKey = pseudoKey(game.white.pseudo);
  const blackKey = pseudoKey(game.black.pseudo);
  const w = snap.keys.get(whiteKey);
  const b = snap.keys.get(blackKey);
  if (!w || !b || w === b) return null;
  const match = snap.pairs.get(pairKey(w, b));
  if (!match) return null;
  return { whiteKey, blackKey, match };
}

// ---------------------------------------------------------------------------
// Écouteur de commit
// ---------------------------------------------------------------------------

/** remontées en vol : un commit rejoué ne lance jamais deux fois la même */
const inflight = new Set<string>();

function dispatch(key: string, job: () => Promise<unknown>): void {
  if (inflight.has(key)) return;
  inflight.add(key);
  setImmediate(() => {
    job()
      .catch((err) => console.error(`[tournament-chess] ${key}`, err))
      .finally(() => inflight.delete(key));
  });
}

function onChessCommit(session: SessionRow, beforeStatus: string): void {
  const snap = snapshot;
  if (!snap || snap.state.phase !== 'round') return;
  const game = chessLiteFromSession(session);
  if (!game) return;
  const resolved = resolvePair(snap, game);
  if (!resolved) return;
  const tournamentId = snap.sessionId;

  if (game.status === 'end' && beforeStatus !== 'end') {
    if (isHandledRef(snap.state, game.id)) return;
    const result = game.result;
    if (result && REAL_ENDS.has(result.reason)) {
      const input = {
        ref: game.id,
        whiteKey: resolved.whiteKey,
        blackKey: resolved.blackKey,
        winner: result.winner,
        reason: result.reason,
        createdAt: game.createdAt,
      };
      dispatch(`end:${game.id}`, async () => {
        const outcome = await recordExternalGame(tournamentId, input);
        console.log(`[tournament-chess] partie ${game.id.slice(0, 8)} -> ${JSON.stringify(outcome)}`);
      });
    } else if (resolved.match.live?.ref === game.id) {
      dispatch(`clear:${game.id}`, () => clearExternalLive(tournamentId, game.id));
    }
    return;
  }

  if (game.status === 'playing') {
    const m = resolved.match;
    if (m.status === 'done' || m.status === 'cancelled' || m.gmLocked) return;
    if (m.live?.ref === game.id) return;
    if (snap.roundStartedAt !== null && game.createdAt < snap.roundStartedAt) return;
    if (isHandledRef(snap.state, game.id)) return;
    dispatch(`live:${game.id}`, () =>
      markExternalLive(tournamentId, {
        ref: game.id,
        whiteKey: resolved.whiteKey,
        blackKey: resolved.blackKey,
        createdAt: game.createdAt,
      }),
    );
  }
}

registerCommitListener((session, before) => {
  if (session.mode === 'tournament') {
    refreshFromSession(session);
    return;
  }
  if (session.mode === 'chess') onChessCommit(session, before.status);
});

// ---------------------------------------------------------------------------
// Réconciliateur
// ---------------------------------------------------------------------------

interface ChessRow {
  id: string;
  status: string;
  created_at: string;
  ai: unknown;
  seats: { w?: ChessSeatLite; b?: ChessSeatLite } | null;
  result: ChessLite['result'];
}

let reconciling = false;

export async function reconcileOnce(): Promise<void> {
  if (reconciling) return;
  reconciling = true;
  try {
    const snap = await ensureSnapshot(true);
    if (!snap) return;
    if (Date.now() - Date.parse(snap.state.lastMutationAt) > TOURNAMENT_IDLE_TTL_MS) {
      await closeIdleTournament(snap.sessionId);
      return;
    }
    if (snap.state.phase !== 'round' || snap.roundStartedAt === null) return;
    const { data, error } = await supabaseAdmin
      .from('game_sessions')
      .select('id, status, created_at, ai:config->ai, seats:runtime->chess->seats, result:runtime->chess->result')
      .eq('mode', 'chess')
      .gte('created_at', new Date(snap.roundStartedAt).toISOString())
      .order('created_at', { ascending: true })
      .limit(300);
    if (error) throw error;
    for (const row of (data as ChessRow[]) ?? []) {
      const game: ChessLite = {
        id: row.id,
        status: row.status,
        createdAt: Date.parse(row.created_at),
        ai: Boolean(row.ai),
        white: row.seats?.w ?? null,
        black: row.seats?.b ?? null,
        result: row.result ?? null,
      };
      const current = snapshot ?? snap;
      const resolved = resolvePair(current, game);
      if (!resolved) continue;
      if (game.status === 'end') {
        if (isHandledRef(current.state, game.id)) continue;
        if (game.result && REAL_ENDS.has(game.result.reason)) {
          const outcome = await recordExternalGame(current.sessionId, {
            ref: game.id,
            whiteKey: resolved.whiteKey,
            blackKey: resolved.blackKey,
            winner: game.result.winner,
            reason: game.result.reason,
            createdAt: game.createdAt,
          });
          if (outcome.counted || outcome.changed) {
            console.log(`[tournament-chess] rattrapage ${game.id.slice(0, 8)} -> ${JSON.stringify(outcome)}`);
          }
        } else if (resolved.match.live?.ref === game.id) {
          await clearExternalLive(current.sessionId, game.id);
        }
      } else if (game.status === 'playing') {
        const m = resolved.match;
        if (m.live?.ref === game.id || m.status === 'done' || m.status === 'cancelled' || m.gmLocked) continue;
        if (isHandledRef(current.state, game.id)) continue;
        await markExternalLive(current.sessionId, {
          ref: game.id,
          whiteKey: resolved.whiteKey,
          blackKey: resolved.blackKey,
          createdAt: game.createdAt,
        });
      }
    }
  } catch (err) {
    console.error('[tournament-chess] rattrapage', err);
  } finally {
    reconciling = false;
  }
}

const reconciler = setInterval(() => {
  void reconcileOnce();
}, RECONCILE_INTERVAL_MS);
reconciler.unref?.();
// au démarrage : un tournoi en cours retrouve son instantané sans attendre
const bootTimer = setTimeout(() => void reconcileOnce(), 3_000);
bootTimer.unref?.();

// ---------------------------------------------------------------------------
// Lectures pour les tables (modales de pseudo, partie en cours)
// ---------------------------------------------------------------------------

export interface TournamentLookup {
  tournament: { id: string; joinCode: string; title: string; phase: string; round: number | null; gameLabel: string };
  player: { id: string; pseudo: string; exact: boolean; status: string; rank: number | null; points: number };
  /** que doit faire ce joueur maintenant ? */
  hint: 'registration' | 'play' | 'playing' | 'wait_bye' | 'bonus' | 'done' | 'next_round' | 'round_done' | 'left' | 'final';
  match: {
    id: string;
    board: number;
    kind: string;
    opponent: string | null;
    /** couleur conseillée de CE joueur (le blanc crée la partie) */
    color: ChessSide | null;
    status: string;
    score: { me: number; them: number };
    games: number;
    /** partie bonus : ne compte que pour l'exempt */
    countsForMe: boolean;
  } | null;
  /** adversaire tapé dans la modale « rejoindre » : cette partie comptera-t-elle ? */
  opponentCheck: { pseudo: string; counts: boolean; expected: string | null } | null;
}

function lookupInSnapshot(snap: Snapshot, pseudo: string, opponent: string | null): TournamentLookup | null {
  const key = pseudoKey(pseudo);
  const playerId = snap.keys.get(key);
  if (!playerId) return null;
  const st = snap.state;
  const entry = st.roster[playerId];
  const standing = st.standings.find((r) => r.playerId === playerId);
  const round = currentRound(st);

  let match: TournamentLookup['match'] = null;
  let hint: TournamentLookup['hint'] = 'registration';
  if (st.phase === 'final') hint = 'final';
  else if (entry.status !== 'active') hint = 'left';
  else if (st.phase === 'registration') hint = 'registration';
  else if (round) {
    const mine = round.matches.filter((m) => m.a === playerId || m.b === playerId);
    const open = mine.find((m) => m.status === 'pending' || m.status === 'playing');
    const shown = open ?? mine[mine.length - 1];
    if (shown && shown.kind !== 'bye') {
      const iAmA = shown.a === playerId;
      const s = gameScore(shown);
      match = {
        id: shown.id,
        board: shown.board,
        kind: shown.kind,
        opponent: st.roster[(iAmA ? shown.b : shown.a) ?? '']?.pseudo ?? null,
        color: shown.colorA ? (iAmA ? shown.colorA : shown.colorA === 'w' ? 'b' : 'w') : null,
        status: shown.status,
        score: iAmA ? { me: s.a, them: s.b } : { me: s.b, them: s.a },
        games: shown.games.length,
        countsForMe: shown.kind !== 'floater' || iAmA,
      };
    }
    if (round.waiting === playerId) hint = 'wait_bye';
    else if (open) hint = open.kind === 'floater' && open.b === playerId ? 'bonus' : open.status === 'playing' ? 'playing' : 'play';
    else if (st.phase === 'round_done') hint = 'round_done';
    else if (mine.length === 0) hint = 'next_round';
    else hint = 'done';
  }

  let opponentCheck: TournamentLookup['opponentCheck'] = null;
  if (opponent) {
    const oppId = snap.keys.get(pseudoKey(opponent));
    const pair = oppId ? snap.pairs.get(pairKey(playerId, oppId)) : undefined;
    const counts = Boolean(pair && (pair.status === 'pending' || pair.status === 'playing') && !pair.gmLocked);
    opponentCheck = { pseudo: opponent, counts, expected: match?.opponent ?? null };
  }

  return {
    tournament: {
      id: snap.sessionId,
      joinCode: snap.joinCode,
      title: snap.cfg.title,
      phase: st.phase,
      round: round?.number ?? null,
      gameLabel: TOURNAMENT_GAMES[snap.cfg.game]?.label ?? snap.cfg.game,
    },
    player: {
      id: playerId,
      pseudo: entry.pseudo,
      exact: entry.pseudo === pseudo.trim(),
      status: entry.status,
      rank: standing?.rank ?? null,
      points: standing?.points ?? 0,
    },
    hint,
    match,
    opponentCheck,
  };
}

export async function lookupParticipant(
  game: string,
  pseudo: string,
  opponent: string | null,
): Promise<TournamentLookup | null> {
  if (game !== 'chess' || !pseudo.trim()) return null;
  const snap = await ensureSnapshot();
  if (!snap) return null;
  return lookupInSnapshot(snap, pseudo, opponent?.trim() || null);
}

/**
 * Lookup groupé pour le lobby des échecs : pour chaque créateur de partie en
 * attente, qui doit-il affronter dans le tournoi ? (un seul aller-retour par
 * rafraîchissement du lobby, au lieu d'un par carte)
 */
export async function lookupMany(
  game: string,
  pseudos: string[],
): Promise<Record<string, { title: string; round: number | null; opponent: string | null; hint: TournamentLookup['hint'] } | null>> {
  const out: Record<string, { title: string; round: number | null; opponent: string | null; hint: TournamentLookup['hint'] } | null> = {};
  if (game !== 'chess' || pseudos.length === 0) return out;
  const snap = await ensureSnapshot();
  for (const p of pseudos.slice(0, 30)) {
    const r = snap ? lookupInSnapshot(snap, p, null) : null;
    out[p] = r ? { title: r.tournament.title, round: r.tournament.round, opponent: r.match?.opponent ?? null, hint: r.hint } : null;
  }
  return out;
}

export interface ChessGameContext {
  tournament: { id: string; title: string; round: number | null };
  /** la partie a été comptée dans ce match */
  counted: boolean;
  /** partie appariée, pas encore finie : elle comptera */
  pending: boolean;
  /** partie écartée (match déjà décidé, verrou GM, créée avant le tirage...) */
  reason: string | null;
  match: {
    id: string;
    board: number;
    kind: string;
    status: string;
    decided: boolean;
    /** score du match en parties, par couleur de CETTE partie */
    score: { w: number; b: number };
    /** points de tournoi gagnés avec ce match, par couleur de cette partie */
    points: { w: number; b: number } | null;
    /** parties restantes à jouer (match en plusieurs parties) */
    remaining: number;
  } | null;
}

/** contexte tournoi d'une partie d'échecs (pastille et récap sur la dalle) */
export async function chessGameContext(chessId: string): Promise<ChessGameContext | null> {
  const snap = await ensureSnapshot();
  if (!snap) return null;
  const chess = await loadSession(chessId).catch(() => null);
  if (!chess || chess.mode !== 'chess') return null;
  const game = chessLiteFromSession(chess);
  if (!game || game.ai || !game.white?.pseudo || !game.black?.pseudo) return null;
  const st = snap.state;
  const w = snap.keys.get(pseudoKey(game.white.pseudo));
  const b = snap.keys.get(pseudoKey(game.black.pseudo));
  if (!w || !b) return null;
  const round = currentRound(st);

  // match qui a compté cette partie (n'importe quelle ronde), sinon la paire courante
  let match: TournamentMatch | null = null;
  for (const r of st.rounds) {
    const m = r.matches.find((x) => x.games.some((g) => g.ref === chessId));
    if (m) match = m;
  }
  const counted = match !== null;
  if (!match) match = snap.pairs.get(pairKey(w, b)) ?? null;
  if (!match) return null;
  const ignored = st.ignored.find((x) => x.ref === chessId);
  const voided = st.voidRefs.includes(chessId);
  const beforeDraw = round !== null && game.createdAt < Date.parse(round.startedAt) && !counted;
  const open = match.status === 'pending' || match.status === 'playing';
  const pending = !counted && !ignored && !voided && !beforeDraw && open && !match.gmLocked && game.status !== 'end';
  const aIsWhite = match.a === w;
  const s = gameScore(match);
  const decided = match.status === 'done' || match.status === 'cancelled';
  const n = snap.cfg.match.games;
  return {
    tournament: { id: snap.sessionId, title: snap.cfg.title, round: round?.number ?? null },
    counted,
    pending,
    reason: ignored?.reason ?? (voided ? 'void' : beforeDraw ? 'before_draw' : !counted && !open ? 'match_decided' : null),
    match: {
      id: match.id,
      board: match.board,
      kind: match.kind,
      status: match.status,
      decided,
      score: aIsWhite ? { w: s.a, b: s.b } : { w: s.b, b: s.a },
      points: decided ? (aIsWhite ? { w: match.points.a, b: match.points.b } : { w: match.points.b, b: match.points.a }) : null,
      remaining: decided ? 0 : Math.max(0, n - match.games.length),
    },
  };
}
