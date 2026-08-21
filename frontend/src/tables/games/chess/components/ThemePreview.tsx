/**
 * Mini plateau 4x4 dessiné par le thème lui-même (modale de création, cartes
 * du lobby). Aucune image : cases + 3 pièces rendues par le thème.
 */

import type { ChessTheme } from '../themes/types';
import type { ChessColor, PieceType } from '../lib/chessTypes';

const PREVIEW_PIECES: Array<{ type: PieceType; color: ChessColor; x: number; y: number }> = [
  { type: 'q', color: 'w', x: 1, y: 2 },
  { type: 'n', color: 'b', x: 2, y: 1 },
  { type: 'p', color: 'w', x: 3, y: 3 },
];

interface Props {
  theme: ChessTheme;
  size?: number;
}

export default function ThemePreview({ theme, size = 96 }: Props) {
  const cell = size / 4;
  const squares = [];
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) {
      squares.push(
        <div
          key={`${x}-${y}`}
          className="absolute"
          style={{
            left: x * cell,
            top: y * cell,
            width: cell,
            height: cell,
            background: (x + y) % 2 === 0 ? theme.lightSquare : theme.darkSquare,
            boxShadow: theme.squareBorder ? `inset 0 0 0 1px ${theme.squareBorder}` : undefined,
          }}
        />,
      );
    }
  }
  return (
    <div
      className="relative shrink-0 overflow-hidden rounded-lg border border-white/15"
      style={{ width: size, height: size, background: theme.boardBg ?? '#0B0813' }}
      aria-hidden
    >
      {squares}
      {PREVIEW_PIECES.map((p, i) => (
        <div
          key={i}
          className="absolute"
          style={{ left: p.x * cell + cell * 0.06, top: p.y * cell + cell * 0.06, width: cell * 0.88, height: cell * 0.88 }}
        >
          {theme.renderPiece(p.type, p.color, '100%')}
        </div>
      ))}
    </div>
  );
}
