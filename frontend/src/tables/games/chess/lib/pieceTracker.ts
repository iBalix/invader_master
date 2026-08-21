/**
 * Identité des pièces : rejoue l'historique UCI et produit des pièces à ids
 * STABLES ('wP-e2' = case initiale). Conséquences directes :
 *   - React keys stables => les transitions CSS de déplacement se déclenchent
 *     toutes seules entre deux états ;
 *   - roque (la tour bouge avec son id), en passant (victime sur une case
 *     différente de l'arrivée) et promotion (même id, type modifié) gérés ;
 *   - zones des prises ordonnées chronologiquement, gratuites.
 *
 * Rejeu complet O(n) à chaque état (< 300 coups) : trivial, zéro dérive.
 */

import { Chess } from 'chess.js';
import { uciToMoveInput } from './chessRules';
import type { ChessColor, PieceType } from './chessTypes';
import type { Square } from './geometry';

export interface TrackedPiece {
  /** stable toute la partie : couleur + type initial + case initiale */
  id: string;
  /** type courant (change sur promotion, id conservé) */
  type: PieceType;
  color: ChessColor;
  /** null = capturée */
  square: Square | null;
  /** ordre d'arrivée dans la zone des prises de son bourreau */
  capturedIndex: number | null;
}

export interface TrackResult {
  pieces: TrackedPiece[];
  /** pièces NOIRES prises par les blancs, ordre chronologique */
  capturedByWhite: TrackedPiece[];
  /** pièces BLANCHES prises par les noirs, ordre chronologique */
  capturedByBlack: TrackedPiece[];
  /** victime du DERNIER coup (déclencheur du FX de capture), avec sa case */
  lastCapture: { piece: TrackedPiece; square: Square } | null;
  /** avantage matériel : > 0 = blancs devant (valeurs standard) */
  materialDiff: number;
}

const PIECE_VALUE: Record<PieceType, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

const BACK_RANK: PieceType[] = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];
const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

function initialPieces(): { pieces: TrackedPiece[]; bySquare: Map<Square, TrackedPiece> } {
  const pieces: TrackedPiece[] = [];
  const bySquare = new Map<Square, TrackedPiece>();
  const add = (type: PieceType, color: ChessColor, square: Square): void => {
    const piece: TrackedPiece = {
      id: `${color}${type.toUpperCase()}-${square}`,
      type,
      color,
      square,
      capturedIndex: null,
    };
    pieces.push(piece);
    bySquare.set(square, piece);
  };
  for (let f = 0; f < 8; f++) {
    add(BACK_RANK[f], 'w', `${FILES[f]}1`);
    add('p', 'w', `${FILES[f]}2`);
    add('p', 'b', `${FILES[f]}7`);
    add(BACK_RANK[f], 'b', `${FILES[f]}8`);
  }
  return { pieces, bySquare };
}

export function trackPieces(uciMoves: string[]): TrackResult {
  const { pieces, bySquare } = initialPieces();
  const capturedByWhite: TrackedPiece[] = [];
  const capturedByBlack: TrackedPiece[] = [];
  let lastCapture: TrackResult['lastCapture'] = null;
  const chess = new Chess();

  const moveOnBoard = (from: Square, to: Square): void => {
    const piece = bySquare.get(from);
    if (!piece) return;
    bySquare.delete(from);
    piece.square = to;
    bySquare.set(to, piece);
  };

  for (const uci of uciMoves) {
    let mv;
    try {
      mv = chess.move(uciToMoveInput(uci));
    } catch {
      break; // état serveur prioritaire, on n'affiche que ce qui se rejoue
    }
    lastCapture = null;

    // 1) victime éventuelle (en passant : la victime n'est pas sur mv.to)
    if (mv.captured) {
      const victimSquare: Square = mv.flags.includes('e') ? `${mv.to[0]}${mv.from[1]}` : mv.to;
      const victim = bySquare.get(victimSquare);
      if (victim) {
        bySquare.delete(victimSquare);
        victim.square = null;
        const tray = mv.color === 'w' ? capturedByWhite : capturedByBlack;
        victim.capturedIndex = tray.length;
        tray.push(victim);
        lastCapture = { piece: victim, square: victimSquare };
      }
    }

    // 2) déplacement du moteur du coup
    moveOnBoard(mv.from, mv.to);

    // 3) promotion : même id, nouveau type
    if (mv.promotion) {
      const promoted = bySquare.get(mv.to);
      if (promoted) promoted.type = mv.promotion as PieceType;
    }

    // 4) roque : la tour suit
    if (mv.flags.includes('k')) {
      const rank = mv.color === 'w' ? '1' : '8';
      moveOnBoard(`h${rank}`, `f${rank}`);
    } else if (mv.flags.includes('q')) {
      const rank = mv.color === 'w' ? '1' : '8';
      moveOnBoard(`a${rank}`, `d${rank}`);
    }
  }

  let materialDiff = 0;
  for (const piece of pieces) {
    if (piece.square === null) continue;
    materialDiff += (piece.color === 'w' ? 1 : -1) * PIECE_VALUE[piece.type];
  }

  return { pieces, capturedByWhite, capturedByBlack, lastCapture, materialDiff };
}
