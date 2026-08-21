/**
 * Machine à états du tap-tap :
 *   idle --tap pièce à moi--> selected (cases légales surlignées)
 *   selected --tap même case--> idle
 *   selected --tap autre pièce à moi--> resélection
 *   selected --tap cible légale--> envoi (ou picker de promotion)
 *   selected --tap illégal--> shake de la pièce sélectionnée
 * Spectateur ou pas son tour : taps inertes.
 * (Point d'extension drag : un seuil de pointermove sur la sélection.)
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Chess, Square as ChessJsSquare } from 'chess.js';
import { isPromotionMove, legalTargets, type LegalTarget } from '../lib/chessRules';
import type { ChessColor } from '../lib/chessTypes';
import type { Square } from '../lib/geometry';

export interface BoardSelection {
  square: Square;
  targets: Map<Square, LegalTarget>;
}

interface Options {
  chess: Chess;
  myColor: ChessColor | null;
  canPlay: boolean;
  locked: boolean;
  onSubmit: (from: Square, to: Square) => void;
  onNeedPromotion: (from: Square, to: Square) => void;
}

export function useBoardInteraction({
  chess,
  myColor,
  canPlay,
  locked,
  onSubmit,
  onNeedPromotion,
}: Options) {
  const [selection, setSelection] = useState<BoardSelection | null>(null);
  const [shakeSquare, setShakeSquare] = useState<Square | null>(null);
  const shakeTimer = useRef<number | null>(null);

  const clearSelection = useCallback(() => setSelection(null), []);

  // le trait change (coup adverse, resync) : la sélection n'a plus de sens
  useEffect(() => {
    if (!canPlay) setSelection(null);
  }, [canPlay]);

  useEffect(() => {
    return () => {
      if (shakeTimer.current) window.clearTimeout(shakeTimer.current);
    };
  }, []);

  const shake = useCallback((square: Square) => {
    setShakeSquare(null);
    // re-déclenche l'animation même sur la même case
    requestAnimationFrame(() => setShakeSquare(square));
    if (shakeTimer.current) window.clearTimeout(shakeTimer.current);
    shakeTimer.current = window.setTimeout(() => setShakeSquare(null), 260);
  }, []);

  const onSquareTap = useCallback(
    (square: Square) => {
      if (locked || !myColor || !canPlay) return;
      const piece = chess.get(square as ChessJsSquare);

      if (selection) {
        if (square === selection.square) {
          setSelection(null);
          return;
        }
        const target = selection.targets.get(square);
        if (target) {
          if (isPromotionMove(chess, selection.square, square)) {
            onNeedPromotion(selection.square, square);
          } else {
            onSubmit(selection.square, square);
          }
          setSelection(null);
          return;
        }
        if (piece && piece.color === myColor) {
          setSelection({ square, targets: legalTargets(chess, square) });
          return;
        }
        shake(selection.square);
        return;
      }

      if (piece && piece.color === myColor) {
        setSelection({ square, targets: legalTargets(chess, square) });
      }
    },
    [chess, myColor, canPlay, locked, selection, onSubmit, onNeedPromotion, shake],
  );

  return { selection, shakeSquare, onSquareTap, clearSelection };
}
