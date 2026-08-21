/**
 * Le plateau : 3 couches superposées dans un conteneur carré.
 *   1. BoardSquares : cases + marqueurs (cibles tactiles)
 *   2. PieceLayer   : pièces en transform translate (transitions CSS)
 *   3. Ambiance du thème (jamais montée en perf reduced) + PromotionPicker
 *
 * Un seul handler pointerdown délégué (zéro latence de click, garde
 * anti multi-touch), touch-action none (aucun scroll/zoom généré ici).
 */

import { type PointerEvent, type RefObject } from 'react';
import BoardSquares from './BoardSquares';
import PieceLayer from './PieceLayer';
import PromotionPicker from './PromotionPicker';
import type { LegalTarget } from '../lib/chessRules';
import type { Orientation, Square } from '../lib/geometry';
import type { TrackedPiece } from '../lib/pieceTracker';
import type { ChessColor, PromotionPiece } from '../lib/chessTypes';
import type { ChessTheme } from '../themes/types';

interface Props {
  boardRef: RefObject<HTMLDivElement>;
  boardSize: number;
  orientation: Orientation;
  theme: ChessTheme;
  reduced: boolean;
  pieces: TrackedPiece[];
  selection: { square: Square; targets: Map<Square, LegalTarget> } | null;
  lastMove: { from: string; to: string } | null;
  checkSquare: Square | null;
  shakeSquare: Square | null;
  suppressAnim: boolean;
  promotion: { color: ChessColor } | null;
  onPromotionPick: (piece: PromotionPiece | null) => void;
  onSquareTap: (square: Square) => void;
}

export default function ChessBoard({
  boardRef,
  boardSize,
  orientation,
  theme,
  reduced,
  pieces,
  selection,
  lastMove,
  checkSquare,
  shakeSquare,
  suppressAnim,
  promotion,
  onPromotionPick,
  onSquareTap,
}: Props) {
  const Ambient = theme.Ambient;

  function handlePointerDown(e: PointerEvent<HTMLDivElement>) {
    if (!e.isPrimary) return;
    const target = (e.target as HTMLElement).closest('[data-square]');
    const square = target instanceof HTMLElement ? target.dataset.square : undefined;
    if (square) onSquareTap(square);
  }

  return (
    <div className={theme.boardFrameClass} style={theme.boardFrameStyle}>
      <div
        ref={boardRef}
        className={['relative select-none overflow-hidden rounded-lg', reduced ? 'chess-reduced' : ''].join(' ')}
        style={{
          width: boardSize,
          height: boardSize,
          background: theme.boardBg ?? '#0B0813',
          touchAction: 'none',
        }}
        onPointerDown={handlePointerDown}
        onContextMenu={(e) => e.preventDefault()}
      >
        <BoardSquares
          orientation={orientation}
          theme={theme}
          selection={selection}
          lastMove={lastMove}
          checkSquare={checkSquare}
        />
        <PieceLayer
          pieces={pieces}
          orientation={orientation}
          theme={theme}
          suppress={suppressAnim}
          raisedSquare={lastMove?.to ?? null}
          selectedSquare={selection?.square ?? null}
          shakeSquare={shakeSquare}
        />
        {!reduced && Ambient && <Ambient boardSize={boardSize} />}
        {promotion && (
          <PromotionPicker color={promotion.color} theme={theme} onPick={onPromotionPick} />
        )}
      </div>
    </div>
  );
}
