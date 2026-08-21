/**
 * Grille des 64 cases : cibles tactiles + marqueurs (sélection, cases légales,
 * dernier coup, échec) + coordonnées a-h/1-8 (orientation-aware).
 * Les marqueurs sont pointer-events-none : le tap remonte toujours à la case.
 */

import { isDarkSquare, squareFromView, type Orientation, type Square } from '../lib/geometry';
import type { ChessTheme } from '../themes/types';
import type { LegalTarget } from '../lib/chessRules';

interface Props {
  orientation: Orientation;
  theme: ChessTheme;
  selection: { square: Square; targets: Map<Square, LegalTarget> } | null;
  lastMove: { from: string; to: string } | null;
  checkSquare: Square | null;
}

export default function BoardSquares({ orientation, theme, selection, lastMove, checkSquare }: Props) {
  const rows = [];
  for (let vy = 0; vy < 8; vy++) {
    for (let vx = 0; vx < 8; vx++) {
      const square = squareFromView(vx, vy, orientation);
      const dark = isDarkSquare(square);
      const target = selection?.targets.get(square) ?? null;
      const isSelected = selection?.square === square;
      const isLast = lastMove !== null && (lastMove.from === square || lastMove.to === square);
      const isCheck = checkSquare === square;
      const coordColor = theme.coordColor ?? (dark ? theme.lightSquare : theme.darkSquare);
      const roundMarker = theme.markerShape === 'round';

      rows.push(
        <div
          key={square}
          data-square={square}
          className="relative"
          style={{
            background: dark ? theme.darkSquare : theme.lightSquare,
            boxShadow: theme.squareBorder ? `inset 0 0 0 1px ${theme.squareBorder}` : undefined,
          }}
        >
          {isLast && (
            <div
              key={`last-${lastMove?.from}${lastMove?.to}`}
              aria-hidden
              className="chess-lastmove pointer-events-none absolute inset-0"
              style={{ background: theme.lastMoveTint }}
            />
          )}
          {isCheck && (
            <div
              aria-hidden
              className="chess-check pointer-events-none absolute inset-0"
              style={{ background: theme.checkTint }}
            />
          )}
          {isSelected && (
            <div
              aria-hidden
              className={['pointer-events-none absolute inset-0', theme.selectedClass ?? ''].join(' ')}
              style={{
                boxShadow: `inset 0 0 0 4px ${theme.selectedOutline}`,
                color: theme.selectedOutline,
              }}
            />
          )}
          {target && !target.capture && (
            // centrage par inset (et NON par -translate-x/y) : la keyframe
            // d'apparition anime `transform`, elle écraserait un translate de
            // centrage et la pastille naîtrait décalée avant de sauter en place
            <div
              aria-hidden
              className={[
                'chess-marker-in pointer-events-none absolute inset-[35%]',
                roundMarker ? 'rounded-full' : '',
              ].join(' ')}
              style={{ background: theme.legalDot }}
            />
          )}
          {target && target.capture && (
            <div
              aria-hidden
              className={[
                'chess-marker-in pointer-events-none absolute inset-[6%]',
                roundMarker ? 'rounded-full' : '',
              ].join(' ')}
              style={{ border: `5px solid ${theme.captureRing}` }}
            />
          )}
          {vx === 0 && (
            <span
              aria-hidden
              className="pointer-events-none absolute left-1 top-0.5 font-display text-[11px] leading-none opacity-70"
              style={{ color: coordColor }}
            >
              {square[1]}
            </span>
          )}
          {vy === 7 && (
            <span
              aria-hidden
              className="pointer-events-none absolute bottom-0.5 right-1 font-display text-[11px] leading-none opacity-70"
              style={{ color: coordColor }}
            >
              {square[0]}
            </span>
          )}
        </div>,
      );
    }
  }

  return <div className="absolute inset-0 grid grid-cols-8 grid-rows-8">{rows}</div>;
}
