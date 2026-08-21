/**
 * Wrapper chess.js côté client : prédiction locale (cases légales, promotion,
 * échec) pour une UI instantanée. Le serveur reste l'unique arbitre.
 */

import { Chess, type Square as ChessJsSquare } from 'chess.js';
import type { PromotionPiece } from './chessTypes';
import type { Square } from './geometry';

export interface MoveInput {
  from: Square;
  to: Square;
  promotion?: PromotionPiece;
}

export function uciToMoveInput(uci: string): MoveInput {
  return {
    from: uci.slice(0, 2),
    to: uci.slice(2, 4),
    promotion: (uci[4] as PromotionPiece | undefined) ?? undefined,
  };
}

/**
 * Rejoue un historique UCI. Un coup qui échoue arrête le replay (état serveur
 * toujours prioritaire, on ne throw pas côté affichage).
 */
export function buildChess(uciMoves: string[]): Chess {
  const chess = new Chess();
  for (const uci of uciMoves) {
    try {
      chess.move(uciToMoveInput(uci));
    } catch {
      break;
    }
  }
  return chess;
}

export interface LegalTarget {
  capture: boolean;
}

/** cases jouables depuis une case (Map vide si aucune pièce à soi) */
export function legalTargets(chess: Chess, square: Square): Map<Square, LegalTarget> {
  const targets = new Map<Square, LegalTarget>();
  try {
    const moves = chess.moves({ square: square as ChessJsSquare, verbose: true });
    for (const mv of moves) {
      // un coup de promotion apparaît 4 fois (q/r/b/n) : une seule cible
      targets.set(mv.to, { capture: mv.flags.includes('c') || mv.flags.includes('e') });
    }
  } catch {
    /* case vide ou position corrompue : aucune cible */
  }
  return targets;
}

/** le coup from->to est-il une promotion ? (pion qui atteint la dernière rangée) */
export function isPromotionMove(chess: Chess, from: Square, to: Square): boolean {
  const piece = chess.get(from as ChessJsSquare);
  if (!piece || piece.type !== 'p') return false;
  const targetRank = to[1];
  return (piece.color === 'w' && targetRank === '8') || (piece.color === 'b' && targetRank === '1');
}

/** case du roi d'une couleur (pour la pulsation d'échec) */
export function kingSquare(chess: Chess, color: 'w' | 'b'): Square | null {
  const board = chess.board();
  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const piece = board[rank][file];
      if (piece && piece.type === 'k' && piece.color === color) {
        return piece.square;
      }
    }
  }
  return null;
}
