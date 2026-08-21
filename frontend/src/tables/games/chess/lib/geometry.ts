/**
 * Géométrie du plateau : projection case <-> coordonnées de vue.
 *
 * On ne fait JAMAIS de rotation CSS du plateau (les pièces seraient à
 * l'envers) : seule la projection change selon l'orientation.
 * Joueur = sa couleur en bas ; spectateur = blancs en bas.
 */

export type Square = string; // 'a1'..'h8'
export type Orientation = 'white' | 'black';

export const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;

export function fileIndexOf(square: Square): number {
  return square.charCodeAt(0) - 97; // 'a' -> 0
}

export function rankIndexOf(square: Square): number {
  return Number(square[1]) - 1; // '1' -> 0
}

export function squareAt(fileIdx: number, rankIdx: number): Square {
  return `${FILES[fileIdx]}${rankIdx + 1}`;
}

/** a1 est une case FONCÉE (standard : h1 en bas à droite est claire) */
export function isDarkSquare(square: Square): boolean {
  return (fileIndexOf(square) + rankIndexOf(square)) % 2 === 0;
}

/** coordonnées de vue : vx = colonne 0..7 (gauche -> droite), vy = ligne 0..7 (haut -> bas) */
export function viewCoords(square: Square, orientation: Orientation): { vx: number; vy: number } {
  const file = fileIndexOf(square);
  const rank = rankIndexOf(square);
  if (orientation === 'white') return { vx: file, vy: 7 - rank };
  return { vx: 7 - file, vy: rank };
}

export function squareFromView(vx: number, vy: number, orientation: Orientation): Square {
  if (orientation === 'white') return squareAt(vx, 7 - vy);
  return squareAt(7 - vx, vy);
}

/** les 64 cases dans l'ordre DOM (ligne par ligne, de haut en bas) */
export function viewGridSquares(orientation: Orientation): Square[] {
  const squares: Square[] = [];
  for (let vy = 0; vy < 8; vy++) {
    for (let vx = 0; vx < 8; vx++) {
      squares.push(squareFromView(vx, vy, orientation));
    }
  }
  return squares;
}

/** rect écran d'une case (pour les FX volants), depuis le rect du plateau */
export function squareScreenRect(
  boardRect: DOMRect,
  square: Square,
  orientation: Orientation,
): { x: number; y: number; size: number } {
  const { vx, vy } = viewCoords(square, orientation);
  const size = boardRect.width / 8;
  return { x: boardRect.left + vx * size, y: boardRect.top + vy * size, size };
}
