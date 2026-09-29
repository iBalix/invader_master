/**
 * Tournoi : réducteurs PURS sur l'état (runtime.tournament).
 *
 * Chaque fonction mute l'état reçu (même style que le moteur) mais ne fait
 * aucune I/O et ne lit ni horloge ni aléa implicites : tout passe par le
 * contexte. tournamentFlow.ts les appelle sous withSession ; le script de
 * vérification les appelle directement, sans base.
 *
 * Correspondance avec le statut de session (tournamentFlow) :
 *   registration -> lobby ; round / round_done -> playing ; final -> end.
 */

import {
  computeStandings,
  decideMatch,
  isRoundComplete,
  pairKey,
  pairPlayers,
  pairingHistory,
  pointsFor,
  shuffle,
  assignColor,
} from './swiss.js';
import {
  FEED_MAX,
  IGNORED_MAX,
  TOURNAMENT_MAX_PLAYERS,
  httpErr,
  type ChessSide,
  type FeedKind,
  type MatchResult,
  type Side,
  type TournamentConfig,
  type TournamentMatch,
  type TournamentRound,
  type TournamentState,
} from './types.js';

export interface CoreCtx {
  cfg: TournamentConfig;
  now: number;
  rng: () => number;
}

function iso(ctx: CoreCtx): string {
  return new Date(ctx.now).toISOString();
}

// ---------------------------------------------------------------------------
// Utilitaires d'état
// ---------------------------------------------------------------------------

export function createInitialState(now: number): TournamentState {
  return {
    phase: 'registration',
    roster: {},
    rosterSeq: 0,
    rounds: [],
    adjustments: {},
    standings: [],
    countedRefs: [],
    voidRefs: [],
    ignored: [],
    feed: [],
    feedSeq: 0,
    pin: null,
    waitingForPlayers: false,
    lastMutationAt: new Date(now).toISOString(),
    finishedAt: null,
    closeReason: null,
  };
}

export function currentRound(state: TournamentState): TournamentRound | null {
  return state.rounds[state.rounds.length - 1] ?? null;
}

export function isActive(state: TournamentState, playerId: string | null): boolean {
  return playerId !== null && state.roster[playerId]?.status === 'active';
}

export function activeIds(state: TournamentState): string[] {
  return Object.entries(state.roster)
    .filter(([, r]) => r.status === 'active')
    .sort((x, y) => x[1].seq - y[1].seq)
    .map(([id]) => id);
}

export function pseudoOf(state: TournamentState, playerId: string | null): string {
  if (!playerId) return '?';
  return state.roster[playerId]?.pseudo ?? '?';
}

export function idByKey(state: TournamentState, key: string): string | null {
  for (const [id, r] of Object.entries(state.roster)) {
    if (r.key === key) return id;
  }
  return null;
}

export function findMatch(
  state: TournamentState,
  matchId: string,
): { round: TournamentRound; match: TournamentMatch } | null {
  for (const round of state.rounds) {
    const match = round.matches.find((m) => m.id === matchId);
    if (match) return { round, match };
  }
  return null;
}

function pushFeed(state: TournamentState, ctx: CoreCtx, kind: FeedKind, text: string, matchId?: string): void {
  state.feedSeq += 1;
  state.feed.push({ seq: state.feedSeq, kind, text, at: iso(ctx), ...(matchId ? { matchId } : {}) });
  if (state.feed.length > FEED_MAX) state.feed.splice(0, state.feed.length - FEED_MAX);
}

function pushIgnored(state: TournamentState, ctx: CoreCtx, ref: string, reason: string): void {
  if (state.ignored.some((x) => x.ref === ref)) return;
  state.ignored.push({ ref, reason, at: iso(ctx) });
  if (state.ignored.length > IGNORED_MAX) state.ignored.splice(0, state.ignored.length - IGNORED_MAX);
}

/** à appeler après toute mutation : classement recalculé, horodatage */
export function commit(state: TournamentState, ctx: CoreCtx): void {
  state.standings = computeStandings(state);
  state.lastMutationAt = iso(ctx);
}

function resultText(state: TournamentState, m: TournamentMatch): string {
  const a = pseudoOf(state, m.a);
  const b = pseudoOf(state, m.b);
  switch (m.result) {
    case 'a':
      return `${a} bat ${b}`;
    case 'b':
      return `${b} bat ${a}`;
    case 'draw':
      return `Match nul entre ${a} et ${b}`;
    case 'forfeit_a':
      return `${a} gagne par forfait contre ${b}`;
    case 'forfeit_b':
      return `${b} gagne par forfait contre ${a}`;
    case 'bye':
      return `${a} est exempt`;
    case 'cancelled':
      return `Match annulé : ${a} contre ${b}`;
    default:
      return `${a} contre ${b}`;
  }
}

function busyInRound(round: TournamentRound, playerId: string, except?: TournamentMatch): boolean {
  return round.matches.some(
    (m) =>
      m !== except &&
      (m.status === 'pending' || m.status === 'playing') &&
      (m.a === playerId || m.b === playerId),
  );
}

function nextBoard(round: TournamentRound): number {
  return round.matches.reduce((max, m) => Math.max(max, m.board), 0) + 1;
}

// ---------------------------------------------------------------------------
// Joueurs
// ---------------------------------------------------------------------------

export interface AddPlayerInput {
  playerId: string;
  pseudo: string;
  key: string;
  device: string;
  gmAdded?: boolean;
}

/** refus possible AVANT l'insert game_players : mêmes règles que addPlayer */
export function assertCanJoin(state: TournamentState, ctx: CoreCtx, key: string, byGm: boolean): void {
  if (state.phase === 'final') throw httpErr('error_tournament_over', 409);
  if (state.phase !== 'registration' && !ctx.cfg.lateJoin && !byGm) {
    throw httpErr('error_registrations_closed', 409);
  }
  if (Object.keys(state.roster).length >= TOURNAMENT_MAX_PLAYERS) {
    throw httpErr('error_tournament_full', 409);
  }
  if (Object.values(state.roster).some((r) => r.key === key)) {
    throw httpErr('error_player_already_exists', 409);
  }
}

export function addPlayer(state: TournamentState, ctx: CoreCtx, input: AddPlayerInput): void {
  assertCanJoin(state, ctx, input.key, input.gmAdded === true);
  state.rosterSeq += 1;
  state.roster[input.playerId] = {
    pseudo: input.pseudo,
    key: input.key,
    status: 'active',
    joinedAt: iso(ctx),
    seq: state.rosterSeq,
    device: input.device,
    ...(input.gmAdded ? { gmAdded: true } : {}),
  };
  pushFeed(state, ctx, 'join', `${input.pseudo} rejoint le tournoi`);
  commit(state, ctx);
}

/**
 * Départ d'un joueur (le sien ou une exclusion GM).
 *   - pendant les inscriptions : il disparaît du roster (pseudo libéré) ;
 *   - ensuite : il reste au classement, grisé, et n'est plus apparié ;
 *     un match pas commencé est perdu par forfait, une partie en cours
 *     compte normalement (elle sera résolue à sa fin).
 * Retourne true si le joueur a été retiré du roster.
 */
export function leavePlayer(
  state: TournamentState,
  ctx: CoreCtx,
  playerId: string,
  by: 'self' | 'gm',
): boolean {
  const entry = state.roster[playerId];
  if (!entry) throw httpErr('error_unknown_player', 404);
  if (state.phase === 'registration') {
    delete state.roster[playerId];
    delete state.adjustments[playerId];
    pushFeed(state, ctx, 'leave', `${entry.pseudo} se désinscrit`);
    commit(state, ctx);
    return true;
  }
  if (entry.status !== 'active') return false;
  entry.status = by === 'gm' ? 'excluded' : 'left';
  pushFeed(state, ctx, 'leave', `${entry.pseudo} quitte le tournoi`);
  const round = currentRound(state);
  if (round && state.phase === 'round') {
    if (round.waiting === playerId) round.waiting = null;
    for (const m of round.matches) {
      if (m.status !== 'pending') continue;
      if (m.a !== playerId && m.b !== playerId) continue;
      applyDeparture(state, ctx, round, m, playerId);
    }
    afterMatchChange(state, ctx, round);
  }
  commit(state, ctx);
  return false;
}

export function reinstatePlayer(state: TournamentState, ctx: CoreCtx, playerId: string, by: 'self' | 'gm'): void {
  const entry = state.roster[playerId];
  if (!entry) throw httpErr('error_unknown_player', 404);
  if (state.phase === 'final') throw httpErr('error_tournament_over', 409);
  if (entry.status === 'excluded' && by === 'self') throw httpErr('error_tournament_excluded', 403);
  if (entry.status === 'active') return;
  entry.status = 'active';
  pushFeed(state, ctx, 'join', `${entry.pseudo} revient dans le tournoi`);
  commit(state, ctx);
}

export function renamePlayer(
  state: TournamentState,
  ctx: CoreCtx,
  playerId: string,
  pseudo: string,
  key: string,
): void {
  const entry = state.roster[playerId];
  if (!entry) throw httpErr('error_unknown_player', 404);
  if (Object.entries(state.roster).some(([id, r]) => id !== playerId && r.key === key)) {
    throw httpErr('error_player_already_exists', 409);
  }
  entry.pseudo = pseudo;
  entry.key = key;
  commit(state, ctx);
}

export function adjustScore(
  state: TournamentState,
  ctx: CoreCtx,
  playerId: string,
  delta: number,
  reason: string,
): void {
  if (!state.roster[playerId]) throw httpErr('error_unknown_player', 404);
  if (!Number.isFinite(delta) || delta === 0 || Math.abs(delta) > 100) {
    throw httpErr('error_tournament_bad_points', 400);
  }
  const list = state.adjustments[playerId] ?? [];
  list.push({ delta, reason: reason.slice(0, 80), at: iso(ctx) });
  state.adjustments[playerId] = list;
  commit(state, ctx);
}

export function clearAdjustments(state: TournamentState, ctx: CoreCtx, playerId: string): void {
  delete state.adjustments[playerId];
  commit(state, ctx);
}

// ---------------------------------------------------------------------------
// Rondes
// ---------------------------------------------------------------------------

/** tirage d'une ronde (ronde 1 aléatoire, puis ordre du classement) */
export function startRound(state: TournamentState, ctx: CoreCtx): TournamentRound {
  if (state.phase !== 'registration' && state.phase !== 'round_done') {
    throw httpErr('error_tournament_round_in_progress', 409);
  }
  const eligible = activeIds(state);
  if (eligible.length < 2) throw httpErr('error_tournament_not_enough_players', 409);
  const number = state.rounds.length + 1;
  state.standings = computeStandings(state);
  const order =
    number === 1
      ? shuffle(eligible, ctx.rng)
      : state.standings.filter((r) => r.status === 'active').map((r) => r.playerId);
  const history = pairingHistory(state);
  const out = pairPlayers({ order, history });

  const round: TournamentRound = {
    number,
    startedAt: iso(ctx),
    finishedAt: null,
    waiting: null,
    byePlayer: out.bye,
    matches: [],
  };
  out.pairs.forEach((p, i) => {
    round.matches.push({
      id: `r${number}m${i + 1}`,
      round: number,
      board: i + 1,
      a: p.a,
      b: p.b,
      kind: 'normal',
      colorA: p.colorA,
      games: [],
      live: null,
      status: 'pending',
      result: null,
      points: { a: 0, b: 0 },
      gmLocked: false,
      rematch: p.rematch,
      decidedAt: null,
    });
  });
  if (out.bye) {
    if (ctx.cfg.byePolicy === 'points') {
      round.matches.push(byeMatch(round, out.bye, ctx));
    } else {
      round.waiting = out.bye;
    }
  }
  state.rounds.push(round);
  state.phase = 'round';
  state.waitingForPlayers = false;
  state.pin = null;
  pushFeed(state, ctx, 'round', `Ronde ${number} : tirage des matchs`);
  commit(state, ctx);
  return round;
}

function byeMatch(round: TournamentRound, playerId: string, ctx: CoreCtx): TournamentMatch {
  return {
    id: `r${round.number}b`,
    round: round.number,
    board: nextBoard(round),
    a: playerId,
    b: null,
    kind: 'bye',
    colorA: null,
    games: [],
    live: null,
    status: 'done',
    result: 'bye',
    points: { a: ctx.cfg.points.bye, b: 0 },
    gmLocked: false,
    rematch: false,
    decidedAt: iso(ctx),
  };
}

/** la ronde est-elle finie ? (tous les matchs joués, plus d'exempt en attente) */
function afterMatchChange(state: TournamentState, ctx: CoreCtx, round: TournamentRound): void {
  const isCurrent = currentRound(state) === round;
  if (!isCurrent) return;
  if (state.phase === 'round' && isRoundComplete(round)) {
    round.finishedAt = iso(ctx);
    state.phase = 'round_done';
    pushFeed(state, ctx, 'round', `Ronde ${round.number} terminée`);
  } else if (state.phase === 'round_done' && !isRoundComplete(round)) {
    // un match rouvert par le GM relance la ronde
    round.finishedAt = null;
    state.phase = 'round';
  }
}

function finishMatch(
  state: TournamentState,
  ctx: CoreCtx,
  round: TournamentRound,
  m: TournamentMatch,
  result: MatchResult,
  points: { a: number; b: number },
): void {
  m.status = result === 'cancelled' ? 'cancelled' : 'done';
  m.result = result;
  m.points = points;
  m.decidedAt = iso(ctx);
  if (m.live) {
    // partie encore en cours sur une table : elle ne comptera plus
    if (!state.voidRefs.includes(m.live.ref)) state.voidRefs.push(m.live.ref);
    m.live = null;
  }
  pushFeed(state, ctx, 'result', resultText(state, m), m.id);
  if (m.status === 'done' && m.kind === 'normal') maybeAssignFloater(state, ctx, round, m);
}

/**
 * Exempt en attente (politique floater) : au premier match terminé de la
 * ronde, un de ses deux joueurs encore libres lui est attribué AU HASARD
 * (décision de Romain), en évitant si possible un adversaire déjà rencontré :
 * s'ils l'ont tous deux déjà affronté et que d'autres matchs peuvent encore
 * se finir, on attend le suivant.
 */
function maybeAssignFloater(
  state: TournamentState,
  ctx: CoreCtx,
  round: TournamentRound,
  finished: TournamentMatch,
): void {
  if (ctx.cfg.byePolicy !== 'floater' || !round.waiting || !isActive(state, round.waiting)) return;
  const x = round.waiting;
  const candidates = [finished.a, finished.b].filter(
    (id): id is string => id !== null && id !== x && isActive(state, id) && !busyInRound(round, id),
  );
  if (candidates.length === 0) return;
  const met = pairingHistory(state).met.get(x);
  const fresh = candidates.filter((c) => !met?.has(c));
  const othersPending = round.matches.some(
    (m) => m !== finished && m.kind === 'normal' && (m.status === 'pending' || m.status === 'playing'),
  );
  let pool = fresh;
  if (pool.length === 0) {
    if (othersPending) return;
    pool = candidates;
  }
  const y = pool[Math.floor(ctx.rng() * pool.length)];
  createFloaterMatch(state, ctx, round, x, y, fresh.length === 0);
}

function createFloaterMatch(
  state: TournamentState,
  ctx: CoreCtx,
  round: TournamentRound,
  x: string,
  y: string,
  rematch: boolean,
): TournamentMatch {
  const k = round.matches.filter((m) => m.kind === 'floater').length + 1;
  const history = pairingHistory(state);
  const match: TournamentMatch = {
    id: `r${round.number}f${k}`,
    round: round.number,
    board: nextBoard(round),
    a: x,
    b: y,
    kind: 'floater',
    colorA: assignColor(x, y, history.colors, round.matches.length),
    games: [],
    live: null,
    status: 'pending',
    result: null,
    points: { a: 0, b: 0 },
    gmLocked: false,
    rematch,
    decidedAt: null,
  };
  round.matches.push(match);
  round.waiting = null;
  pushFeed(
    state,
    ctx,
    'floater',
    `${pseudoOf(state, y)} affronte ${pseudoOf(state, x)} (partie bonus)`,
    match.id,
  );
  return match;
}

/** départ d'un joueur d'un match pas commencé */
function applyDeparture(
  state: TournamentState,
  ctx: CoreCtx,
  round: TournamentRound,
  m: TournamentMatch,
  leaverId: string,
): void {
  if (m.kind === 'floater') {
    finishMatch(state, ctx, round, m, 'cancelled', { a: 0, b: 0 });
    // l'adversaire attribué part : l'exempt attend le match suivant
    if (m.b === leaverId && isActive(state, m.a)) round.waiting = m.a;
    return;
  }
  if (m.kind !== 'normal' || !m.b) return;
  const other = m.a === leaverId ? m.b : m.a;
  if (!isActive(state, other)) {
    finishMatch(state, ctx, round, m, 'cancelled', { a: 0, b: 0 });
    return;
  }
  const result: MatchResult = m.a === leaverId ? 'forfeit_b' : 'forfeit_a';
  finishMatch(state, ctx, round, m, result, pointsFor(m, result, ctx.cfg, 'override'));
}

// ---------------------------------------------------------------------------
// Parties (remontée automatique des jeux, saisie GM)
// ---------------------------------------------------------------------------

export interface ExternalGameInput {
  /** id de la partie d'échecs */
  ref: string;
  whiteKey: string;
  blackKey: string;
  /** null = nulle */
  winner: ChessSide | null;
  reason: string;
  /** création de la partie (epoch ms) : elle doit suivre le tirage de la ronde */
  createdAt: number;
}

export type RecordOutcome =
  | { counted: true; matchId: string; decided: boolean }
  | { counted: false; reason: string; matchId?: string; changed: boolean };

/** match de la ronde courante opposant ces deux joueurs */
function currentPairMatch(
  state: TournamentState,
  x: string,
  y: string,
): { round: TournamentRound; match: TournamentMatch } | null {
  const round = currentRound(state);
  if (!round) return null;
  const key = pairKey(x, y);
  const match = round.matches.find(
    (m) => m.b !== null && (m.kind === 'normal' || m.kind === 'floater') && pairKey(m.a, m.b) === key,
  );
  return match ? { round, match } : null;
}

export function isHandledRef(state: TournamentState, ref: string): boolean {
  return (
    state.countedRefs.includes(ref) ||
    state.voidRefs.includes(ref) ||
    state.ignored.some((x) => x.ref === ref)
  );
}

/**
 * Une partie terminée compte si : vraie fin (filtrée par l'appelant), deux
 * joueurs du tournoi appariés ensemble dans la ronde en cours, match non
 * décidé et pas verrouillé par le GM, partie créée après le tirage.
 */
export function recordExternalGame(
  state: TournamentState,
  ctx: CoreCtx,
  input: ExternalGameInput,
): RecordOutcome {
  if (isHandledRef(state, input.ref)) return { counted: false, reason: 'already_handled', changed: false };
  if (state.phase !== 'round') return { counted: false, reason: 'no_round', changed: false };
  const w = idByKey(state, input.whiteKey);
  const b = idByKey(state, input.blackKey);
  if (!w || !b || w === b) return { counted: false, reason: 'not_participants', changed: false };
  const found = currentPairMatch(state, w, b);
  if (!found) return { counted: false, reason: 'not_paired', changed: false };
  const { round, match } = found;
  if (input.createdAt < Date.parse(round.startedAt)) {
    return { counted: false, reason: 'before_draw', matchId: match.id, changed: false };
  }
  if (match.gmLocked || match.status === 'done' || match.status === 'cancelled') {
    // tracée pour l'historique, jamais recomptée
    pushIgnored(state, ctx, input.ref, match.gmLocked ? 'gm_locked' : 'match_decided');
    if (match.live?.ref === input.ref) match.live = null;
    commit(state, ctx);
    return { counted: false, reason: 'match_decided', matchId: match.id, changed: true };
  }
  const aIsWhite = match.a === w;
  const winner: Side | null =
    input.winner === null ? null : (input.winner === 'w') === aIsWhite ? 'a' : 'b';
  match.games.push({
    winner,
    source: 'auto',
    ref: input.ref,
    reason: input.reason,
    colorA: aIsWhite ? 'w' : 'b',
    at: iso(ctx),
  });
  state.countedRefs.push(input.ref);
  if (match.live?.ref === input.ref) match.live = null;
  const decision = decideMatch(match, ctx.cfg);
  if (decision.decided && decision.result) {
    finishMatch(state, ctx, round, match, decision.result, decision.points);
  } else {
    match.status = match.live ? 'playing' : 'pending';
    const s = scoreText(match);
    pushFeed(
      state,
      ctx,
      'result',
      `${pseudoOf(state, match.a)} ${s} ${pseudoOf(state, match.b)} : partie suivante`,
      match.id,
    );
  }
  afterMatchChange(state, ctx, round);
  commit(state, ctx);
  return { counted: true, matchId: match.id, decided: decision.decided };
}

function scoreText(m: TournamentMatch): string {
  let a = 0;
  let b = 0;
  for (const g of m.games) {
    if (g.winner === 'a') a += 1;
    else if (g.winner === 'b') b += 1;
    else {
      a += 0.5;
      b += 0.5;
    }
  }
  const f = (n: number): string => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ','));
  return `${f(a)}-${f(b)}`;
}

export interface LiveGameInput {
  ref: string;
  whiteKey: string;
  blackKey: string;
  createdAt: number;
}

/** une partie entre deux joueurs appariés vient de commencer : le match est « en cours » */
export function markLive(state: TournamentState, ctx: CoreCtx, input: LiveGameInput): boolean {
  if (state.phase !== 'round' || isHandledRef(state, input.ref)) return false;
  const w = idByKey(state, input.whiteKey);
  const b = idByKey(state, input.blackKey);
  if (!w || !b || w === b) return false;
  const found = currentPairMatch(state, w, b);
  if (!found) return false;
  const { round, match } = found;
  if (input.createdAt < Date.parse(round.startedAt)) return false;
  if (match.gmLocked || match.status === 'done' || match.status === 'cancelled') return false;
  if (match.live?.ref === input.ref) return false;
  match.live = { ref: input.ref, since: iso(ctx) };
  match.status = 'playing';
  commit(state, ctx);
  return true;
}

/**
 * La partie en cours s'est terminée sans résultat (annulée, expirée,
 * arrêtée) : le match redevient « à jouer ». Si un des joueurs est parti
 * entre-temps, le forfait s'applique maintenant.
 */
export function clearLive(state: TournamentState, ctx: CoreCtx, ref: string): boolean {
  const round = currentRound(state);
  if (!round) return false;
  const match = round.matches.find((m) => m.live?.ref === ref);
  if (!match) return false;
  match.live = null;
  if (match.status === 'playing') match.status = 'pending';
  if (state.phase === 'round' && match.status === 'pending') {
    const leaver = [match.a, match.b].find((id) => id !== null && !isActive(state, id));
    if (leaver) applyDeparture(state, ctx, round, match, leaver);
  }
  afterMatchChange(state, ctx, round);
  commit(state, ctx);
  return true;
}

/** saisie GM d'une partie (matchs en plusieurs parties, jeu hors système) */
export function recordGmGame(
  state: TournamentState,
  ctx: CoreCtx,
  matchId: string,
  winner: Side | null,
): void {
  const found = findMatch(state, matchId);
  if (!found) throw httpErr('error_tournament_unknown_match', 404);
  const { round, match } = found;
  if (currentRound(state) !== round || state.phase === 'final') {
    throw httpErr('error_tournament_match_closed', 409);
  }
  if (match.kind === 'bye' || match.status === 'done' || match.status === 'cancelled') {
    throw httpErr('error_tournament_match_closed', 409);
  }
  match.games.push({ winner, source: 'gm', ref: null, reason: 'gm', colorA: null, at: iso(ctx) });
  const decision = decideMatch(match, ctx.cfg);
  if (decision.decided && decision.result) {
    finishMatch(state, ctx, round, match, decision.result, decision.points);
  } else {
    pushFeed(
      state,
      ctx,
      'result',
      `${pseudoOf(state, match.a)} ${scoreText(match)} ${pseudoOf(state, match.b)}`,
      match.id,
    );
  }
  afterMatchChange(state, ctx, round);
  commit(state, ctx);
}

export type GmMatchResult = 'a' | 'b' | 'draw' | 'forfeit_a' | 'forfeit_b' | 'cancelled' | 'bye' | 'reset';

/**
 * Résultat imposé par le GM, sur n'importe quelle ronde (historique
 * corrigeable). Le match est verrouillé : les remontées automatiques qui
 * suivent sont ignorées. « reset » rouvre un match de la ronde en cours.
 */
export function setMatchResult(
  state: TournamentState,
  ctx: CoreCtx,
  matchId: string,
  result: GmMatchResult,
): void {
  const found = findMatch(state, matchId);
  if (!found) throw httpErr('error_tournament_unknown_match', 404);
  const { round, match } = found;
  const isCurrent = currentRound(state) === round;
  if (result === 'reset') {
    if (!isCurrent || state.phase === 'final') throw httpErr('error_tournament_match_closed', 409);
    if (match.kind === 'bye') throw httpErr('error_tournament_match_closed', 409);
    for (const g of match.games) {
      if (g.ref && !state.voidRefs.includes(g.ref)) state.voidRefs.push(g.ref);
    }
    if (match.live && !state.voidRefs.includes(match.live.ref)) state.voidRefs.push(match.live.ref);
    match.games = [];
    match.live = null;
    match.status = 'pending';
    match.result = null;
    match.points = { a: 0, b: 0 };
    match.gmLocked = false;
    match.decidedAt = null;
    afterMatchChange(state, ctx, round);
    commit(state, ctx);
    return;
  }
  if (match.kind === 'bye') {
    if (result !== 'cancelled' && result !== 'bye') throw httpErr('error_tournament_bad_result', 400);
    match.status = result === 'bye' ? 'done' : 'cancelled';
    match.result = result;
    match.points = result === 'bye' ? { a: ctx.cfg.points.bye, b: 0 } : { a: 0, b: 0 };
    match.gmLocked = true;
    match.decidedAt = iso(ctx);
    commit(state, ctx);
    return;
  }
  if (result === 'bye') throw httpErr('error_tournament_bad_result', 400);
  match.gmLocked = true;
  finishMatch(state, ctx, round, match, result, pointsFor(match, result, ctx.cfg, 'override'));
  afterMatchChange(state, ctx, round);
  commit(state, ctx);
}

/**
 * Attribution manuelle de l'adversaire de l'exempt (ou réattribution tant que
 * la partie bonus n'a pas commencé). N'importe quel joueur actif et libre,
 * retardataire compris.
 */
export function assignFloater(state: TournamentState, ctx: CoreCtx, opponentId: string): void {
  const round = currentRound(state);
  if (!round || state.phase !== 'round') throw httpErr('error_tournament_no_round', 409);
  let x = round.waiting;
  if (!x) {
    const pendingFloater = round.matches.find(
      (m) => m.kind === 'floater' && m.status === 'pending' && m.games.length === 0 && !m.live,
    );
    if (!pendingFloater) throw httpErr('error_tournament_no_bye', 409);
    x = pendingFloater.a;
    round.matches.splice(round.matches.indexOf(pendingFloater), 1);
  }
  if (opponentId === x || !isActive(state, opponentId)) throw httpErr('error_unknown_player', 404);
  if (busyInRound(round, opponentId)) throw httpErr('error_tournament_player_busy', 409);
  const met = pairingHistory(state).met.get(x);
  createFloaterMatch(state, ctx, round, x, opponentId, met?.has(opponentId) ?? false);
  commit(state, ctx);
}

/** l'exempt qui attend reçoit les points d'exemption, sans jouer */
export function grantBye(state: TournamentState, ctx: CoreCtx): void {
  const round = currentRound(state);
  if (!round || state.phase !== 'round') throw httpErr('error_tournament_no_round', 409);
  let x = round.waiting;
  if (!x) {
    const pendingFloater = round.matches.find(
      (m) => m.kind === 'floater' && m.status === 'pending' && m.games.length === 0 && !m.live,
    );
    if (!pendingFloater) throw httpErr('error_tournament_no_bye', 409);
    x = pendingFloater.a;
    round.matches.splice(round.matches.indexOf(pendingFloater), 1);
  }
  round.waiting = null;
  round.matches.push(byeMatch(round, x, ctx));
  pushFeed(state, ctx, 'result', `${pseudoOf(state, x)} est exempt`);
  afterMatchChange(state, ctx, round);
  commit(state, ctx);
}

/** clôture forcée : les matchs non joués sont annulés, l'exempt n'est pas crédité */
export function closeRound(state: TournamentState, ctx: CoreCtx): void {
  const round = currentRound(state);
  if (!round || state.phase !== 'round') throw httpErr('error_tournament_no_round', 409);
  round.waiting = null;
  for (const m of round.matches) {
    if (m.status === 'pending' || m.status === 'playing') {
      finishMatch(state, ctx, round, m, 'cancelled', { a: 0, b: 0 });
    }
  }
  afterMatchChange(state, ctx, round);
  commit(state, ctx);
}

/** fin du tournoi : classement final, les matchs inachevés sont annulés */
export function finishTournament(state: TournamentState, ctx: CoreCtx): void {
  if (state.phase === 'final') return;
  const round = currentRound(state);
  if (round && state.phase === 'round') {
    round.waiting = null;
    for (const m of round.matches) {
      if (m.status === 'pending' || m.status === 'playing') {
        finishMatch(state, ctx, round, m, 'cancelled', { a: 0, b: 0 });
      }
    }
    round.finishedAt = round.finishedAt ?? iso(ctx);
  }
  state.phase = 'final';
  state.finishedAt = iso(ctx);
  state.pin = null;
  commit(state, ctx);
  const winner = state.standings.find((r) => r.status !== 'excluded');
  pushFeed(
    state,
    ctx,
    'final',
    winner ? `${winner.pseudo} remporte le tournoi !` : 'Tournoi terminé',
  );
}

export function setPin(
  state: TournamentState,
  ctx: CoreCtx,
  view: 'standings' | 'round' | 'match' | null,
  matchId: string | null,
  seconds: number,
): void {
  if (!view) {
    state.pin = null;
  } else {
    if (view === 'match' && (!matchId || !findMatch(state, matchId))) {
      throw httpErr('error_tournament_unknown_match', 404);
    }
    const s = Math.min(Math.max(Math.round(seconds) || 60, 10), 3600);
    state.pin = { view, matchId: view === 'match' ? matchId : null, until: new Date(ctx.now + s * 1000).toISOString() };
  }
  state.lastMutationAt = iso(ctx);
}
