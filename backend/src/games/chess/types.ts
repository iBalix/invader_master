/**
 * Échecs multijoueur — types du module.
 *
 * L'état complet d'une partie vit dans game_sessions.runtime.chess (JSONB) :
 * tout client (joueur, spectateur, staff) doit pouvoir se reconstruire depuis
 * GET /state, le broadcast temps réel ne porte jamais de donnée métier.
 */

import type { SessionRow } from '../types.js';

export type ChessColor = 'w' | 'b';
export type PromotionPiece = 'q' | 'r' | 'b' | 'n';

export interface ChessClockConfig {
  initialMs: number;
  incrementMs: number; // incrément Fischer, ajouté après chaque coup joué
}

/** adversaire machine ; absent/null = partie entre deux joueurs */
export interface ChessAiConfig {
  level: 1 | 2 | 3;
}

/**
 * Siège tenu par la machine. Aucun `game_players` n'est créé pour elle : ce
 * playerId n'existe qu'ici, donc aucun token ne peut correspondre et personne
 * ne peut jouer à sa place via l'API.
 */
export const AI_PLAYER_ID = 'ai';
export const AI_DEVICE = 'AI';

export interface ChessConfig {
  /** null = partie sans pendule */
  clock: ChessClockConfig | null;
  /**
   * Couleur du créateur, RÉSOLUE à la création (un choix "aléatoire" est tiré
   * une fois pour toutes). Permet au join de connaître le siège libre même
   * dans la fenêtre où le siège du créateur n'est pas encore posé.
   */
  creatorColor: ChessColor;
  /** identifiant de thème visuel, interprété uniquement côté client */
  theme: string;
  /** pseudo du créateur (affichage lobby avant le join adverse) */
  creatorPseudo: string;
  /**
   * Partie solo contre la machine. OPTIONNEL : les sessions déjà en base n'ont
   * pas ce champ, elles doivent rester lisibles.
   */
  ai?: ChessAiConfig | null;
}

export interface ChessSeat {
  playerId: string;
  pseudo: string;
  device: string;
}

export interface ChessMoveEntry {
  san: string;
  uci: string; // ex: 'e2e4', 'e7e8q'
  /** temps de réflexion consommé sur ce coup (ms), null sans pendule */
  ms: number | null;
}

export type ChessEndReason =
  | 'checkmate'
  | 'stalemate'
  | 'repetition'
  | 'fifty_moves'
  | 'insufficient_material'
  | 'timeout'
  /** drapeau tombé mais l'adversaire ne peut pas mater : nulle (règle FIDE) */
  | 'timeout_vs_insufficient'
  | 'resign'
  | 'draw_agreed'
  | 'lobby_expired'
  | 'cancelled'
  | 'inactivity'
  | 'terminated';

export interface ChessResult {
  winner: ChessColor | null;
  reason: ChessEndReason;
}

export interface ChessClocksRuntime {
  /** restants au repère lastMoveAt ; le camp au trait consomme depuis ce repère */
  wMs: number;
  bMs: number;
  lastMoveAt: string; // ISO
}

export interface ChessRematch {
  offers: Partial<Record<ChessColor, boolean>>;
  /** posé quand les deux joueurs ont demandé : la nouvelle partie existe */
  sessionId: string | null;
  /**
   * player_token de la NOUVELLE partie, indexés par couleur DANS la nouvelle
   * partie. Délivrés uniquement via la vue privée `you` (jamais en vue
   * publique : le topic realtime est lisible par les spectateurs).
   */
  tokens?: Record<ChessColor, string>;
}

/** contenu de game_sessions.runtime.chess */
export interface ChessState {
  seats: Partial<Record<ChessColor, ChessSeat>>;
  moves: ChessMoveEntry[];
  /** cache dérivé de moves (rendu client) ; la vérité est l'historique */
  fen: string;
  turn: ChessColor;
  clocks: ChessClocksRuntime | null;
  drawOffer: { by: ChessColor; atPly: number } | null;
  rematch: ChessRematch | null;
  result: ChessResult | null;
  /** dernière invitation générale envoyée au bar (anti-spam) */
  inviteAt?: number;
}

export function chessStateOf(session: SessionRow): ChessState {
  const state = (session.runtime as { chess?: ChessState }).chess;
  if (!state) {
    throw Object.assign(new Error('Session sans état échecs'), { httpStatus: 500 });
  }
  return state;
}

export function seatColorOf(state: ChessState, playerId: string): ChessColor | null {
  if (state.seats.w?.playerId === playerId) return 'w';
  if (state.seats.b?.playerId === playerId) return 'b';
  return null;
}

export function opponentOf(color: ChessColor): ChessColor {
  return color === 'w' ? 'b' : 'w';
}

/** partie en attente d'adversaire : annulée automatiquement au bout de 15 min */
export const CHESS_LOBBY_TTL_MS = 15 * 60_000;
/** partie sans pendule : terminée automatiquement après 2 h sans coup */
export const CHESS_NOCLOCK_IDLE_MS = 2 * 60 * 60_000;
/** topic realtime du lobby (signal "relis la liste", sans donnée) */
export const CHESS_LOBBY_TOPIC = 'chess:lobby';
export const CHESS_THEME_MAX_LEN = 32;
