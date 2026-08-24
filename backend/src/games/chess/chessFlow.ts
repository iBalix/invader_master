/**
 * Machine à états du mode CHESS (premier jeu en réseau entre tables).
 *
 * Cycle :
 *   create ─► lobby ── join du 2e joueur ─► playing ─► end
 *               │  phase_ends_at = created + 15 min (advancer : lobby_expired)
 *               └─ action cancel (créateur) ───────────► end
 *   playing : phase_ends_at = échéance du drapeau du joueur au trait
 *             (ou +2 h sans pendule). L'advancer applique drapeau/inactivité,
 *             y compris après un redémarrage (sweeper + rattrapage paresseux).
 *
 * Contrairement à quiz/battle : PLUSIEURS sessions chess vivent en parallèle,
 * la création ne clôt jamais les autres sessions.
 */

import crypto from 'crypto';
import { Chess } from 'chess.js';
import { supabaseAdmin } from '../../config/supabase.js';
import {
  generatePlayerToken,
  insertSession,
  listOpenSessions,
  markDirty,
  registerAdvancer,
  registerSyncPayload,
  validatePseudo,
  withSession,
} from '../engine.js';
import { broadcastTopic } from '../realtime.js';
import { hasMatingMaterial, naturalResult, rebuild, tryMove } from './rules.js';
import { AI_THINK_MS, aiAcceptsDraw, chooseAiMove, isAiLevel, type AiLevel } from './ai.js';
import {
  AI_DEVICE,
  AI_PLAYER_ID,
  CHESS_LOBBY_TOPIC,
  CHESS_LOBBY_TTL_MS,
  CHESS_NOCLOCK_IDLE_MS,
  CHESS_THEME_MAX_LEN,
  chessStateOf,
  opponentOf,
  seatColorOf,
  type ChessAiConfig,
  type ChessClockConfig,
  type ChessColor,
  type ChessConfig,
  type ChessResult,
  type ChessState,
  type PromotionPiece,
} from './types.js';
import type { PlayerRow, SessionRow } from '../types.js';

// ---------------------------------------------------------------------------
// Helpers internes
// ---------------------------------------------------------------------------

function httpErr(message: string, httpStatus: number): Error {
  return Object.assign(new Error(message), { httpStatus });
}

function chessConfigOf(session: SessionRow): ChessConfig {
  return session.config as unknown as ChessConfig;
}

/** signal lobby : "la liste a changé, relis-la" (best-effort, sans donnée) */
function notifyLobby(): void {
  void broadcastTopic(CHESS_LOBBY_TOPIC, 'sync', {}).catch(() => undefined);
}

function nowIso(): string {
  return new Date().toISOString();
}

/** pseudo affiché du siège machine, par niveau */
export function aiSeatPseudo(level: number): string {
  if (level === 1) return 'IA · Débutant';
  if (level === 3) return 'IA · Costaud';
  return 'IA · Normal';
}

/** partie solo contre la machine ? */
function aiConfigOf(session: SessionRow): ChessAiConfig | null {
  return chessConfigOf(session).ai ?? null;
}

/** couleur tenue par la machine (l'inverse du créateur), null hors mode solo */
function aiColorOf(session: SessionRow): ChessColor | null {
  const config = chessConfigOf(session);
  return config.ai ? opponentOf(config.creatorColor) : null;
}

/** temps restant de la machine, Infinity sans pendule */
function aiRemainingMs(state: ChessState, aiColor: ChessColor): number {
  if (!state.clocks) return Number.POSITIVE_INFINITY;
  const base = aiColor === 'w' ? state.clocks.wMs : state.clocks.bMs;
  return base - Math.max(0, Date.now() - new Date(state.clocks.lastMoveAt).getTime());
}

/**
 * Échéance de la prochaine transition quand c'est à la machine de jouer :
 * son délai de réflexion, sauf si son drapeau tombe avant.
 */
function scheduleAiTurn(session: SessionRow, state: ChessState, aiColor: ChessColor): void {
  const now = Date.now();
  const remaining = aiRemainingMs(state, aiColor);
  const think = Math.min(AI_THINK_MS, remaining > 0 ? remaining : 0);
  session.phase_started_at = new Date(now).toISOString();
  session.phase_ends_at = new Date(now + think).toISOString();
}

/**
 * Clôt la partie. Appelable depuis une action (async) comme depuis l'advancer
 * (sync) : ne fait que muter la session + markDirty, la persistance et le
 * broadcast restent portés par withSession.
 */
function finishChess(session: SessionRow, state: ChessState, result: ChessResult): void {
  state.result = result;
  state.drawOffer = null;
  session.status = 'end';
  session.ended_at = nowIso();
  session.phase_ends_at = null;
  markDirty(session);
  notifyLobby();
}

/** insert d'un joueur (pseudo obligatoire, convention pseudo_norm du moteur) */
async function insertChessPlayer(
  sessionId: string,
  pseudo: string,
  device: string,
): Promise<PlayerRow> {
  const validationError = validatePseudo(pseudo);
  if (validationError) throw httpErr(validationError, 400);
  const trimmed = pseudo.trim();
  const { data, error } = await supabaseAdmin
    .from('game_players')
    .insert({
      session_id: sessionId,
      pseudo: trimmed,
      pseudo_norm: trimmed.toLowerCase(),
      device: device || 'unknown',
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

/** soft delete d'un joueur inséré à tort (jamais de DELETE dur, cf. quiz) */
async function removeChessPlayer(player: PlayerRow): Promise<void> {
  await supabaseAdmin
    .from('game_players')
    .update({ status: 'removed', pseudo_norm: `${player.pseudo_norm}:left:${player.id}` })
    .eq('id', player.id);
}

// ---------------------------------------------------------------------------
// Création
// ---------------------------------------------------------------------------

export interface CreateChessInput {
  pseudo: string;
  device: string;
  clock: { initialMinutes: number; incrementSeconds: number } | null;
  color: ChessColor | 'random';
  theme: string;
  /** partie solo contre la machine (niveau 1 à 3) */
  ai?: { level?: number } | null;
}

function parseClock(input: CreateChessInput['clock']): ChessClockConfig | null {
  if (input === null || input === undefined) return null;
  const minutes = Number(input.initialMinutes);
  const increment = Number(input.incrementSeconds);
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 90) {
    throw httpErr('error_chess_bad_config', 400);
  }
  if (!Number.isInteger(increment) || increment < 0 || increment > 60) {
    throw httpErr('error_chess_bad_config', 400);
  }
  return { initialMs: minutes * 60_000, incrementMs: increment * 1000 };
}

export async function createChessSession(
  input: CreateChessInput,
): Promise<{ session: SessionRow; player: PlayerRow }> {
  const clock = parseClock(input.clock);
  if (input.color !== 'w' && input.color !== 'b' && input.color !== 'random') {
    throw httpErr('error_chess_bad_config', 400);
  }
  const theme = (input.theme ?? '').trim();
  if (!theme || theme.length > CHESS_THEME_MAX_LEN) {
    throw httpErr('error_chess_bad_config', 400);
  }
  const validationError = validatePseudo(input.pseudo);
  if (validationError) throw httpErr(validationError, 400);

  const creatorColor: ChessColor =
    input.color === 'random' ? (crypto.randomInt(2) === 0 ? 'w' : 'b') : input.color;

  // mode solo : le niveau doit etre 1, 2 ou 3
  let ai: ChessAiConfig | null = null;
  if (input.ai) {
    const level = Number(input.ai.level);
    if (!isAiLevel(level)) throw httpErr('error_chess_bad_config', 400);
    ai = { level };
  }

  const config: ChessConfig = {
    clock,
    creatorColor,
    theme,
    creatorPseudo: input.pseudo.trim(),
    ai,
  };
  const state: ChessState = {
    seats: {},
    moves: [],
    fen: new Chess().fen(),
    turn: 'w',
    clocks: null,
    drawOffer: null,
    rematch: null,
    result: null,
  };

  const session = await insertSession({
    mode: 'chess',
    status: ai ? 'playing' : 'lobby',
    config,
    runtime: { chess: state },
    phaseStartedAt: nowIso(),
    // solo : la partie commence tout de suite, pas d'attente d'adversaire
    phaseEndsAt: new Date(Date.now() + (ai ? CHESS_NOCLOCK_IDLE_MS : CHESS_LOBBY_TTL_MS)).toISOString(),
  });

  const player = await insertChessPlayer(session.id, input.pseudo, input.device);

  // siège posé sous le mutex : bump version + broadcast + timer d'expiration
  const committed = await withSession(session.id, async (s) => {
    const st = chessStateOf(s);
    st.seats[creatorColor] = {
      playerId: player.id,
      pseudo: player.pseudo,
      device: player.device,
    };
    if (ai) {
      // siege machine : aucun game_players, donc aucun token ne peut le jouer
      const aiColor = opponentOf(creatorColor);
      st.seats[aiColor] = {
        playerId: AI_PLAYER_ID,
        pseudo: aiSeatPseudo(ai.level),
        device: AI_DEVICE,
      };
      const now = Date.now();
      s.started_at = nowIso();
      s.phase_started_at = nowIso();
      if (clock) {
        st.clocks = {
          wMs: clock.initialMs,
          bMs: clock.initialMs,
          lastMoveAt: new Date(now).toISOString(),
        };
      }
      if (st.turn === aiColor) {
        // la machine a les blancs : elle ouvre la partie toute seule
        scheduleAiTurn(s, st, aiColor);
      } else {
        s.phase_ends_at = clock
          ? new Date(now + clock.initialMs).toISOString()
          : new Date(now + CHESS_NOCLOCK_IDLE_MS).toISOString();
      }
    }
    markDirty(s);
    return s;
  });
  notifyLobby();
  return { session: committed, player };
}

// ---------------------------------------------------------------------------
// Join (2e joueur) : la partie démarre immédiatement
// ---------------------------------------------------------------------------

export async function joinChessSession(
  sessionId: string,
  pseudo: string,
  device: string,
): Promise<{ session: SessionRow; player: PlayerRow }> {
  // insert hors mutex (I/O), attribution du siège sous mutex ; en cas de
  // refus le joueur fraîchement inséré est retiré (soft delete)
  const player = await insertChessPlayer(sessionId, pseudo, device);
  try {
    const session = await withSession(sessionId, async (s) => {
      if (s.mode !== 'chess') throw httpErr('Session introuvable', 404);
      const state = chessStateOf(s);
      const config = chessConfigOf(s);
      const seatColor = opponentOf(config.creatorColor);
      if (s.status !== 'lobby' || state.seats[seatColor] || !state.seats[config.creatorColor]) {
        throw httpErr('error_chess_game_full', 409);
      }
      state.seats[seatColor] = {
        playerId: player.id,
        pseudo: player.pseudo,
        device: player.device,
      };
      const now = Date.now();
      s.status = 'playing';
      s.started_at = nowIso();
      s.phase_started_at = nowIso();
      if (config.clock) {
        state.clocks = {
          wMs: config.clock.initialMs,
          bMs: config.clock.initialMs,
          lastMoveAt: new Date(now).toISOString(),
        };
        s.phase_ends_at = new Date(now + config.clock.initialMs).toISOString();
      } else {
        state.clocks = null;
        s.phase_ends_at = new Date(now + CHESS_NOCLOCK_IDLE_MS).toISOString();
      }
      markDirty(s);
      return s;
    });
    notifyLobby();
    return { session, player };
  } catch (err) {
    await removeChessPlayer(player).catch(() => undefined);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Coup
// ---------------------------------------------------------------------------

export interface ChessMoveInput {
  ply: number;
  from: string;
  to: string;
  promotion?: PromotionPiece;
}

export async function playChessMove(
  sessionId: string,
  player: PlayerRow,
  input: ChessMoveInput,
): Promise<SessionRow> {
  return withSession(sessionId, async (session) => {
    if (session.mode !== 'chess') throw httpErr('Session introuvable', 404);
    const state = chessStateOf(session);
    if (session.status === 'lobby') throw httpErr('error_chess_not_started', 409);
    if (session.status !== 'playing') throw httpErr('error_chess_game_over', 409);

    const color = seatColorOf(state, player.id);
    if (!color) throw httpErr('error_chess_not_seated', 403);

    const uci = `${input.from}${input.to}${input.promotion ?? ''}`;
    // retry réseau du même coup : succès silencieux, aucune mutation
    if (input.ply === state.moves.length - 1 && state.moves[input.ply]?.uci === uci) {
      return session;
    }
    if (input.ply !== state.moves.length) throw httpErr('error_chess_wrong_ply', 409);
    if (color !== state.turn) throw httpErr('error_chess_not_your_turn', 409);

    const chess = rebuild(state.moves);
    const played = tryMove(chess, input);
    if (!played) throw httpErr('error_chess_illegal_move', 400);

    commitMove(session, state, chess, played, color);
    return session;
  });
}

/**
 * Applique un coup DÉJÀ joué sur `chess` : pendule, historique, trait, fin
 * naturelle, prochaine échéance. Chemin commun au coup humain et au coup de la
 * machine — c'est ce qui fait que la machine consomme sa pendule exactement
 * comme un joueur, sans code dédié.
 */
function commitMove(
  session: SessionRow,
  state: ChessState,
  chess: Chess,
  played: { san: string; uci: string },
  color: ChessColor,
): void {
  const now = Date.now();
  let elapsed: number | null = null;
  if (state.clocks) {
    elapsed = Math.max(0, now - new Date(state.clocks.lastMoveAt).getTime());
    const remaining = color === 'w' ? state.clocks.wMs : state.clocks.bMs;
    if (elapsed >= remaining) {
      // course de quelques ms avec l'échéance : le drapeau prime sur le
      // coup. Pas de mutation ici (un throw n'est jamais persisté par
      // withSession) : le rattrapage paresseux appliquera la chute au
      // prochain accès, l'échéance étant déjà dépassée.
      throw httpErr('error_chess_game_over', 409);
    }
    const config = chessConfigOf(session);
    const newRemaining = remaining - elapsed + (config.clock?.incrementMs ?? 0);
    if (color === 'w') state.clocks.wMs = newRemaining;
    else state.clocks.bMs = newRemaining;
    state.clocks.lastMoveAt = new Date(now).toISOString();
  }

  state.moves.push({ san: played.san, uci: played.uci, ms: elapsed });
  state.fen = chess.fen();
  state.turn = opponentOf(color);
  // tout coup joué efface une offre de nulle en attente
  state.drawOffer = null;

  const result = naturalResult(chess);
  if (result) {
    finishChess(session, state, result);
    return;
  }

  const aiColor = aiColorOf(session);
  if (aiColor && state.turn === aiColor) {
    // au tour de la machine : elle joue à l'échéance de réflexion
    scheduleAiTurn(session, state, aiColor);
  } else {
    session.phase_started_at = new Date(now).toISOString();
    session.phase_ends_at = state.clocks
      ? new Date(now + (state.turn === 'w' ? state.clocks.wMs : state.clocks.bMs)).toISOString()
      : new Date(now + CHESS_NOCLOCK_IDLE_MS).toISOString();
  }
  markDirty(session);
}

/**
 * Coup de la machine, joué par l'advancer à l'échéance de réflexion. Le calcul
 * est borné (cf. ai.ts) : il ne bloque jamais l'event loop plus de ~200 ms.
 */
function playAiMove(session: SessionRow, state: ChessState, aiColor: ChessColor): boolean {
  const level = chessConfigOf(session).ai?.level;
  if (!isAiLevel(level)) return false;
  const chess = rebuild(state.moves);
  const choice = chooseAiMove(chess, level as AiLevel);
  if (!choice) return false;
  const played = tryMove(chess, choice);
  if (!played) return false;
  commitMove(session, state, chess, played, aiColor);
  return true;
}

// ---------------------------------------------------------------------------
// Actions joueur
// ---------------------------------------------------------------------------

export type ChessPlayerAction =
  | 'resign'
  | 'draw-offer'
  | 'draw-accept'
  | 'draw-decline'
  | 'cancel'
  | 'rematch'
  | 'invite';

export async function chessPlayerAction(
  sessionId: string,
  player: PlayerRow,
  action: ChessPlayerAction,
): Promise<SessionRow> {
  return withSession(sessionId, async (session) => {
    if (session.mode !== 'chess') throw httpErr('Session introuvable', 404);
    const state = chessStateOf(session);
    const color = seatColorOf(state, player.id);
    if (!color) throw httpErr('error_chess_not_seated', 403);

    const requirePlaying = (): void => {
      if (session.status !== 'playing') throw httpErr('error_chess_game_over', 409);
    };

    switch (action) {
      case 'resign': {
        requirePlaying();
        finishChess(session, state, { winner: opponentOf(color), reason: 'resign' });
        return session;
      }
      case 'draw-offer': {
        requirePlaying();
        if (state.drawOffer?.by === color) return session; // déjà offerte : idempotent
        if (state.drawOffer) throw httpErr('error_chess_draw_pending', 409);
        const aiColor = aiColorOf(session);
        if (aiColor) {
          // solo : la machine tranche tout de suite plutôt que de laisser une
          // offre en attente que personne ne lira jamais
          if (aiAcceptsDraw(rebuild(state.moves), aiColor)) {
            finishChess(session, state, { winner: null, reason: 'draw_agreed' });
          } else {
            state.drawOffer = null;
            markDirty(session);
          }
          return session;
        }
        state.drawOffer = { by: color, atPly: state.moves.length };
        markDirty(session);
        return session;
      }
      case 'draw-accept': {
        requirePlaying();
        if (state.drawOffer?.by !== opponentOf(color)) {
          throw httpErr('error_chess_no_draw_offer', 409);
        }
        finishChess(session, state, { winner: null, reason: 'draw_agreed' });
        return session;
      }
      case 'draw-decline': {
        requirePlaying();
        if (state.drawOffer?.by === opponentOf(color)) {
          state.drawOffer = null;
          markDirty(session);
        }
        return session;
      }
      case 'invite': {
        // invitation générale au bar depuis la salle d'attente (anti-spam 45 s)
        if (session.status !== 'lobby') throw httpErr('error_chess_not_started', 409);
        const now = Date.now();
        if (state.inviteAt && now - state.inviteAt < 45_000) {
          throw httpErr('error_chess_invite_cooldown', 429);
        }
        state.inviteAt = now;
        markDirty(session);
        void broadcastTopic('tables:invites', 'invite', {
          game: 'chess',
          sessionId: session.id,
          pseudo: state.seats[color]?.pseudo ?? '',
          theme: chessConfigOf(session).theme,
          at: now,
        }).catch(() => undefined);
        return session;
      }
      case 'cancel': {
        if (session.status !== 'lobby') throw httpErr('error_chess_not_started', 409);
        finishChess(session, state, { winner: null, reason: 'cancelled' });
        return session;
      }
      case 'rematch': {
        if (session.status !== 'end' || !state.result) {
          throw httpErr('error_chess_not_started', 409);
        }
        await handleRematch(session, state, color);
        return session;
      }
      default:
        throw httpErr('Action inconnue', 400);
    }
  });
}

/**
 * Revanche : chaque joueur la demande ; la seconde demande crée la nouvelle
 * partie (couleurs inversées, mêmes réglages, démarrage immédiat). Les
 * player_token de la nouvelle partie sont stockés sur l'ANCIENNE session et
 * délivrés à chacun via sa vue privée `you` (jamais en vue publique).
 */
async function handleRematch(
  session: SessionRow,
  state: ChessState,
  color: ChessColor,
): Promise<void> {
  const rematch = state.rematch ?? { offers: {}, sessionId: null };
  state.rematch = rematch;
  if (rematch.sessionId) return; // déjà créée : le client lit son token dans you
  if (rematch.offers[color]) {
    markDirty(session); // idempotent, mais on renvoie un état frais
    return;
  }
  rematch.offers[color] = true;
  markDirty(session);

  const other = opponentOf(color);
  // solo : la machine accepte toujours, la revanche part au premier clic
  if (aiColorOf(session) === other) rematch.offers[other] = true;
  if (!rematch.offers[other]) return; // en attente de l'autre joueur

  // Les deux ont accepté : création de la nouvelle partie.
  const oldSeatW = state.seats.w;
  const oldSeatB = state.seats.b;
  if (!oldSeatW || !oldSeatB) throw httpErr('error_chess_game_full', 409);
  const config = chessConfigOf(session);

  // couleurs inversées : l'ancien blanc devient noir
  const newConfig: ChessConfig = {
    clock: config.clock,
    creatorColor: opponentOf(config.creatorColor),
    theme: config.theme,
    creatorPseudo: config.creatorPseudo,
    // sans cela, la revanche d'une partie solo repartirait en partie à deux
    // qui attend un adversaire qui ne viendra jamais
    ai: config.ai ?? null,
  };
  const now = Date.now();
  const newState: ChessState = {
    seats: {},
    moves: [],
    fen: new Chess().fen(),
    turn: 'w',
    clocks: config.clock
      ? {
          wMs: config.clock.initialMs,
          bMs: config.clock.initialMs,
          lastMoveAt: new Date(now).toISOString(),
        }
      : null,
    drawOffer: null,
    rematch: null,
    result: null,
  };

  const newSession = await insertSession({
    mode: 'chess',
    status: 'playing',
    config: newConfig,
    runtime: { chess: newState },
    phaseStartedAt: new Date(now).toISOString(),
    phaseEndsAt: config.clock
      ? new Date(now + config.clock.initialMs).toISOString()
      : new Date(now + CHESS_NOCLOCK_IDLE_MS).toISOString(),
  });

  // solo : un seul vrai joueur, la machine reprend son siège virtuel
  if (newConfig.ai) {
    const humanColor = newConfig.creatorColor;
    const aiColor = opponentOf(humanColor);
    const oldHumanSeat = humanColor === 'w' ? oldSeatB : oldSeatW; // couleurs inversées
    const human = await insertChessPlayer(newSession.id, oldHumanSeat.pseudo, oldHumanSeat.device);
    await withSession(newSession.id, async (s) => {
      const st = chessStateOf(s);
      st.seats[humanColor] = { playerId: human.id, pseudo: human.pseudo, device: human.device };
      st.seats[aiColor] = {
        playerId: AI_PLAYER_ID,
        pseudo: aiSeatPseudo(newConfig.ai?.level ?? 2),
        device: AI_DEVICE,
      };
      s.started_at = nowIso();
      // si la machine ouvre, elle joue toute seule
      if (st.turn === aiColor) scheduleAiTurn(s, st, aiColor);
      markDirty(s);
    });
    rematch.sessionId = newSession.id;
    rematch.tokens = { [humanColor]: human.player_token } as Record<ChessColor, string>;
    notifyLobby();
    return;
  }

  // nouveaux joueurs : l'ancien noir prend les blancs, et inversement
  const newWhite = await insertChessPlayer(newSession.id, oldSeatB.pseudo, oldSeatB.device);
  const newBlack = await insertChessPlayer(newSession.id, oldSeatW.pseudo, oldSeatW.device);

  // sièges + started_at posés sous le mutex de la NOUVELLE session (id
  // différent : aucun risque d'interblocage avec le mutex courant)
  await withSession(newSession.id, async (s) => {
    const st = chessStateOf(s);
    st.seats.w = { playerId: newWhite.id, pseudo: newWhite.pseudo, device: newWhite.device };
    st.seats.b = { playerId: newBlack.id, pseudo: newBlack.pseudo, device: newBlack.device };
    s.started_at = nowIso();
    markDirty(s);
  });

  rematch.sessionId = newSession.id;
  rematch.tokens = { w: newWhite.player_token, b: newBlack.player_token };
  notifyLobby();
}

// ---------------------------------------------------------------------------
// Action staff (console /api/game) : tuer une partie bloquée
// ---------------------------------------------------------------------------

export async function chessGmAction(sessionId: string, action: string): Promise<SessionRow> {
  if (action !== 'terminate') {
    throw httpErr(`Action inconnue pour une partie d'échecs: ${action}`, 400);
  }
  return withSession(sessionId, async (session) => {
    if (session.mode !== 'chess') throw httpErr('Session introuvable', 404);
    if (session.status === 'end') return session;
    finishChess(session, chessStateOf(session), { winner: null, reason: 'terminated' });
    return session;
  });
}

// ---------------------------------------------------------------------------
// Lobby
// ---------------------------------------------------------------------------

export async function listOpenChessSessions(): Promise<SessionRow[]> {
  return listOpenSessions('chess', 30);
}

// ---------------------------------------------------------------------------
// Transitions automatiques (drapeau, expirations)
// ---------------------------------------------------------------------------

function applyFlagFall(session: SessionRow, state: ChessState): void {
  if (!state.clocks) return;
  const flagged = state.turn;
  if (flagged === 'w') state.clocks.wMs = 0;
  else state.clocks.bMs = 0;
  const chess = rebuild(state.moves);
  const other = opponentOf(flagged);
  if (hasMatingMaterial(chess, other)) {
    finishChess(session, state, { winner: other, reason: 'timeout' });
  } else {
    finishChess(session, state, { winner: null, reason: 'timeout_vs_insufficient' });
  }
}

function chessAdvance(session: SessionRow): boolean {
  const state = chessStateOf(session);
  if (session.status === 'lobby') {
    finishChess(session, state, { winner: null, reason: 'lobby_expired' });
    return true;
  }
  if (session.status === 'playing') {
    const aiColor = aiColorOf(session);
    // c'est a la machine de jouer et il lui reste du temps : elle joue, la
    // chute de drapeau ne s'applique qu'ensuite
    if (aiColor && state.turn === aiColor && aiRemainingMs(state, aiColor) > 0) {
      if (playAiMove(session, state, aiColor)) return true;
    }
    if (!state.clocks) {
      finishChess(session, state, { winner: null, reason: 'inactivity' });
      return true;
    }
    applyFlagFall(session, state);
    return true;
  }
  // 'end' : phase_ends_at est null, on ne devrait jamais arriver ici
  return false;
}

registerAdvancer('chess', chessAdvance);

/**
 * Payload d'accélération du signal 'sync' : de quoi peindre le coup tout de
 * suite chez l'adversaire, sans attendre son GET /state (un aller-retour HTTP
 * de moins depuis le wifi du bar, c'est la moitié de la latence ressentie).
 *
 * Les pendules sont envoyées telles quelles avec l'instant de référence `at` :
 * le coup vient d'être joué, donc le camp au trait n'a encore rien consommé.
 * Le client n'applique ce raccourci que si la version suit exactement la
 * sienne, sinon il refetch : l'état reste dérivable de /state seul.
 */
function chessSyncPayload(session: SessionRow): Record<string, unknown> {
  const state = chessStateOf(session);
  const last = state.moves.length > 0 ? state.moves[state.moves.length - 1] : null;
  return {
    ply: state.moves.length,
    uci: last?.uci ?? null,
    fen: state.fen,
    turn: state.turn,
    wMs: state.clocks?.wMs ?? null,
    bMs: state.clocks?.bMs ?? null,
    at: Date.now(),
    result: state.result,
    phaseEndsAt: session.phase_ends_at ? new Date(session.phase_ends_at).getTime() : null,
  };
}

registerSyncPayload('chess', chessSyncPayload);
