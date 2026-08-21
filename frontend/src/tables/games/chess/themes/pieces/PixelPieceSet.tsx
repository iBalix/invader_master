/**
 * Set de pièces pixel art 10x12 pour le thème rétro arcade.
 * Matrices dessinées à la main, rendues en <rect> 1x1 crispEdges
 * (même technique que RetroLoader). Une ombre décalée d'un pixel
 * donne le relief 8-bit.
 */

import type { ChessColor, PieceType } from '../../lib/chessTypes';

export interface PixelPieceColors {
  fill: string;
  shadow: string;
}

/**
 * Silhouettes voulues nettement distinctes d'un coup d'oeil : le pion est le
 * plus BAS (il ne commence qu'à la 5e ligne), le fou porte une mitre pointue
 * fendue, le cavalier une tête de profil avec museau et crinière, la tour des
 * créneaux, la dame une couronne à pointes, le roi une croix haute.
 */
const SPRITES: Record<PieceType, string[]> = {
  p: [
    '..........',
    '..........',
    '..........',
    '..........',
    '...####...',
    '..######..',
    '...####...',
    '....##....',
    '...####...',
    '..######..',
    '.########.',
    '..........',
  ],
  r: [
    '.##.##.##.',
    '.########.',
    '.########.',
    '..######..',
    '..######..',
    '..######..',
    '..######..',
    '..######..',
    '..######..',
    '.########.',
    '##########',
    '..........',
  ],
  n: [
    '..##......',
    '.####.....',
    '.######...',
    '.###.###..',
    '.#######..',
    '#.######..',
    '...#####..',
    '...#####..',
    '..######..',
    '.#######..',
    '.########.',
    '..........',
  ],
  b: [
    '....##....',
    '...####...',
    '..###.##..',
    '..##.###..',
    '..######..',
    '...####...',
    '....##....',
    '...####...',
    '..######..',
    '.########.',
    '.########.',
    '..........',
  ],
  q: [
    '#.#.##.#.#',
    '##########',
    '.########.',
    '..######..',
    '..######..',
    '...####...',
    '...####...',
    '..######..',
    '..######..',
    '.########.',
    '##########',
    '..........',
  ],
  k: [
    '....##....',
    '....##....',
    '..######..',
    '....##....',
    '...####...',
    '..######..',
    '..######..',
    '...####...',
    '..######..',
    '.########.',
    '##########',
    '..........',
  ],
};

function cells(sprite: string[]): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  sprite.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      if (row[x] === '#') out.push([x, y]);
    }
  });
  return out;
}

// précalcul des cellules par type (les sprites sont constants)
const CELLS: Record<PieceType, Array<[number, number]>> = {
  p: cells(SPRITES.p),
  r: cells(SPRITES.r),
  n: cells(SPRITES.n),
  b: cells(SPRITES.b),
  q: cells(SPRITES.q),
  k: cells(SPRITES.k),
};

interface PixelGlyphProps {
  type: PieceType;
  color: ChessColor;
  colors: PixelPieceColors;
  size?: number | string;
}

export function PixelGlyph({ type, color, colors, size = '100%' }: PixelGlyphProps) {
  const pts = CELLS[type];
  // les noirs regardent vers la droite : miroir horizontal du cavalier
  const mirror = color === 'b' && type === 'n';
  return (
    <svg viewBox="-1 -1 12 14" width={size} height={size} aria-hidden shapeRendering="crispEdges" style={{ display: 'block' }}>
      <g transform={mirror ? 'translate(10 0) scale(-1 1)' : undefined}>
        {pts.map(([x, y], i) => (
          <rect key={`s${i}`} x={x + 0.55} y={y + 0.55} width={1} height={1} fill={colors.shadow} />
        ))}
        {pts.map(([x, y], i) => (
          <rect key={i} x={x} y={y} width={1} height={1} fill={colors.fill} />
        ))}
      </g>
    </svg>
  );
}
