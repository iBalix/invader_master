/**
 * Règles d'échecs pures (chess.js), sans I/O ni effet de bord.
 * Le serveur est l'unique arbitre : le client ne fait que prédire.
 */

import { Chess } from 'chess.js';
import type { ChessColor, ChessMoveEntry, ChessResult, PromotionPiece } from './types.js';

/**
 * Rejoue l'historique depuis la position initiale. La triple répétition exige
 * l'historique complet, la FEN seule ne suffit pas. ~200 coups < 5 ms.
 */
export function rebuild(moves: ChessMoveEntry[]): Chess {
  const chess = new Chess();
  for (const entry of moves) {
    try {
      chess.move(entry.san);
    } catch {
      // historique corrompu = bug serveur, jamais une erreur joueur
      throw Object.assign(new Error(`Historique de coups corrompu (${entry.san})`), {
        httpStatus: 500,
      });
    }
  }
  return chess;
}

/**
 * Applique un coup. Retourne null si illégal (chess.js v1 throw sur coup
 * illégal, y compris une promotion sans champ `promotion`).
 */
export function tryMove(
  chess: Chess,
  input: { from: string; to: string; promotion?: PromotionPiece },
): { san: string; uci: string } | null {
  try {
    const mv = chess.move({ from: input.from, to: input.to, promotion: input.promotion });
    return { san: mv.san, uci: `${mv.from}${mv.to}${mv.promotion ?? ''}` };
  } catch {
    return null;
  }
}

/** Fin naturelle après le coup joué (le camp au trait subit le résultat). */
export function naturalResult(chess: Chess): ChessResult | null {
  if (chess.isCheckmate()) {
    return { winner: opponent(chess.turn() as ChessColor), reason: 'checkmate' };
  }
  if (chess.isStalemate()) return { winner: null, reason: 'stalemate' };
  if (chess.isThreefoldRepetition()) return { winner: null, reason: 'repetition' };
  if (chess.isInsufficientMaterial()) {
    return { winner: null, reason: 'insufficient_material' };
  }
  // les autres cas de nulle sont éliminés ci-dessus : reste la règle des 50 coups
  if (chess.isDraw()) return { winner: null, reason: 'fifty_moves' };
  return null;
}

/**
 * Règle FIDE au drapeau : la couleur a-t-elle de quoi mater "par une suite de
 * coups légaux" ? Approximation standard en ligne (Lichess) : roi seul,
 * roi + fou seul ou roi + cavalier seul => non. Tout le reste => oui.
 */
export function hasMatingMaterial(chess: Chess, color: ChessColor): boolean {
  const others: string[] = [];
  for (const row of chess.board()) {
    for (const square of row) {
      if (square && square.color === color && square.type !== 'k') others.push(square.type);
    }
  }
  if (others.length === 0) return false;
  if (others.length === 1 && (others[0] === 'b' || others[0] === 'n')) return false;
  return true;
}

function opponent(color: ChessColor): ChessColor {
  return color === 'w' ? 'b' : 'w';
}
