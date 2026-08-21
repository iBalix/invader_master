/**
 * Types du jeu d'échecs côté tables : miroir des vues backend
 * (backend/src/games/chess/chessViews.ts) + types d'entrée.
 */

export type ChessColor = 'w' | 'b';
export type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';
export type PromotionPiece = 'q' | 'r' | 'b' | 'n';

export interface ChessClockConfig {
  initialMs: number;
  incrementMs: number;
}

export type ChessEndReason =
  | 'checkmate'
  | 'stalemate'
  | 'repetition'
  | 'fifty_moves'
  | 'insufficient_material'
  | 'timeout'
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

export interface ChessSeatView {
  pseudo: string;
  device: string;
}

export interface ChessPublicState {
  id: string;
  joinCode: string;
  mode: 'chess';
  status: 'lobby' | 'playing' | 'end';
  v: number;
  serverNow: number;
  phaseStartedAt: number | null;
  phaseEndsAt: number | null;
  /** bornes de la partie (récap de fin) */
  startedAt: number | null;
  endedAt: number | null;
  config: { clock: ChessClockConfig | null; theme: string; creatorColor: ChessColor };
  seats: { w: ChessSeatView | null; b: ChessSeatView | null };
  fen: string;
  /** historique complet en UCI ('e2e4', 'e7e8q'), rejouable par chess.js */
  moves: string[];
  lastMove: { from: string; to: string } | null;
  turn: ChessColor;
  /** restants décomptés à serverNow */
  clocks: { wMs: number; bMs: number; running: boolean } | null;
  drawOffer: ChessColor | null;
  check: boolean;
  rematch: { offers: { w: boolean; b: boolean }; sessionId: string | null };
  result: ChessResult | null;
  ended: boolean;
}

export interface ChessYou {
  playerId: string;
  pseudo: string;
  color: ChessColor;
  canMove: boolean;
  drawOfferFromOpponent: boolean;
  rematch: { sessionId: string; playerToken: string; color: ChessColor } | null;
}

export interface ChessStateResponse {
  state: ChessPublicState;
  you: ChessYou | null;
}

export interface ChessLobbyItem {
  sessionId: string;
  joinCode: string;
  status: 'lobby' | 'playing';
  theme: string;
  clock: ChessClockConfig | null;
  creatorColor: ChessColor;
  seats: { w: string | null; b: string | null };
  moveCount: number;
  createdAt: string;
}

export interface CreateChessGameInput {
  pseudo: string;
  clock: { initialMinutes: number; incrementSeconds: number } | null;
  color: ChessColor | 'random';
  theme: string;
}

export function opponentOf(color: ChessColor): ChessColor {
  return color === 'w' ? 'b' : 'w';
}

/** libellé court d'une cadence : "5+3", "10", ou null (sans pendule) */
export function clockLabel(clock: ChessClockConfig | null): string | null {
  if (!clock) return null;
  const minutes = Math.round(clock.initialMs / 60_000);
  const inc = Math.round(clock.incrementMs / 1000);
  return inc > 0 ? `${minutes}+${inc}` : `${minutes}`;
}
