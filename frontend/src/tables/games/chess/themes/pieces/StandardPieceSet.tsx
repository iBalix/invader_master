/**
 * Set de pièces standard : 6 silhouettes dessinées à la main dans le code
 * (inspiration silhouettes classiques type Merida, style cartoon épuré),
 * viewBox 0 0 45 45. Aucun asset externe.
 *
 * Chaque pièce = un chemin CORPS (silhouette pleine, contour épais via
 * paintOrder:stroke -> le contour passe sous le remplissage, halo net) +
 * un chemin DÉTAILS (fentes, créneaux, yeux) dans la couleur du contour.
 *
 * Lisibilité invariante : pièces claires = contour sombre, pièces sombres =
 * contour clair. Le contraste vient du contour, pas du fond : lisible sur
 * cases claires ET foncées dans tous les thèmes.
 */

import type { PieceStyle } from '../types';
import type { ChessColor, PieceType } from '../../lib/chessTypes';

const BODY: Record<PieceType, string> = {
  p: 'M 22.5 9.5 C 19.4 9.5 16.9 12 16.9 15.1 C 16.9 16.9 17.7 18.5 19 19.5 C 17.6 20.3 16.6 21.8 16.6 23.5 C 16.6 25 17.4 26.3 18.6 27.1 C 16 29.2 14.3 32.2 14 35 L 13.5 38.5 L 31.5 38.5 L 31 35 C 30.7 32.2 29 29.2 26.4 27.1 C 27.6 26.3 28.4 25 28.4 23.5 C 28.4 21.8 27.4 20.3 26 19.5 C 27.3 18.5 28.1 16.9 28.1 15.1 C 28.1 12 25.6 9.5 22.5 9.5 Z',
  r: 'M 12.5 38.5 L 32.5 38.5 L 32.5 34.5 L 30 32 L 30 19 L 32 16.5 L 32 8.5 L 27.5 8.5 L 27.5 11.5 L 24.75 11.5 L 24.75 8.5 L 20.25 8.5 L 20.25 11.5 L 17.5 11.5 L 17.5 8.5 L 13 8.5 L 13 16.5 L 15 19 L 15 32 L 12.5 34.5 Z',
  n: 'M 12.5 38.5 C 12.7 34.6 14.6 31.6 16.1 28.7 C 17.7 25.5 18.6 22.7 18.1 20.6 C 16.6 21.6 14.9 22.1 13.4 21.8 C 12.1 21.5 11.1 20.6 10.6 19.4 C 10.2 18.4 10.5 17.8 11.1 17.1 C 11.8 16.3 12.6 15.6 13.2 14.7 C 14.4 13 15.6 11.2 17.4 10.1 L 17.1 7.2 L 19.6 9.2 C 20.3 9 21.1 8.9 21.9 9 L 24 6.3 L 24.7 9.7 C 28.9 12 31.9 16.6 32.9 22.6 C 33.7 27.1 33.7 33 33.6 38.5 Z',
  b: 'M 22.5 5.5 C 21.2 5.5 20.2 6.5 20.2 7.8 C 20.2 8.6 20.6 9.3 21.2 9.7 C 18 12 15.8 15.9 15.8 19.6 C 15.8 22.3 17 24.6 18.9 26 C 17.4 27.3 15.5 30.5 15 34.5 L 14.5 38.5 L 30.5 38.5 L 30 34.5 C 29.5 30.5 27.6 27.3 26.1 26 C 28 24.6 29.2 22.3 29.2 19.6 C 29.2 15.9 27 12 23.8 9.7 C 24.4 9.3 24.8 8.6 24.8 7.8 C 24.8 6.5 23.8 5.5 22.5 5.5 Z',
  q: 'M 14 20.5 L 11.3 10.2 L 16.2 17.3 L 16.8 8.2 L 20.5 16.4 L 22.5 7.2 L 24.5 16.4 L 28.2 8.2 L 28.8 17.3 L 33.7 10.2 L 31 20.5 C 32 23.5 31.8 26 30.8 28.2 C 32.1 30.8 32.6 34.2 32.8 38.5 L 12.2 38.5 C 12.4 34.2 12.9 30.8 14.2 28.2 C 13.2 26 13 23.5 14 20.5 Z',
  k: 'M 21.4 3.5 L 23.6 3.5 L 23.6 6.2 L 26.2 6.2 L 26.2 8.4 L 23.6 8.4 L 23.6 10.4 C 27.2 10.5 30.6 12.4 32 15.6 C 33.1 18.1 32.6 21 30.9 23.2 C 33.1 25.3 34.4 28.5 34.7 32.2 L 35.1 38.5 L 9.9 38.5 L 10.3 32.2 C 10.6 28.5 11.9 25.3 14.1 23.2 C 12.4 21 11.9 18.1 13 15.6 C 14.4 12.4 17.8 10.5 21.4 10.4 L 21.4 8.4 L 18.8 8.4 L 18.8 6.2 L 21.4 6.2 Z',
};

/** détails internes (remplis avec la couleur du contour) */
const DETAIL: Record<PieceType, string | null> = {
  p: null,
  r: 'M 16.8 20.2 L 28.2 20.2 L 28.2 22 L 16.8 22 Z M 16.8 29 L 28.2 29 L 28.2 30.8 L 16.8 30.8 Z',
  n: 'M 18.1 13.4 a 1.25 1.25 0 1 1 -0.01 2.5 a 1.25 1.25 0 1 1 0.01 -2.5 Z M 12.4 18.6 a 0.9 0.9 0 1 1 -0.01 1.8 a 0.9 0.9 0 1 1 0.01 -1.8 Z',
  b: 'M 21.55 13.6 L 23.45 13.6 L 23.45 17.5 L 26.2 17.5 L 26.2 19.4 L 23.45 19.4 L 23.45 22.4 L 21.55 22.4 L 21.55 19.4 L 18.8 19.4 L 18.8 17.5 L 21.55 17.5 Z',
  q: 'M 14.4 27.4 L 30.6 27.4 L 30.6 29.2 L 14.4 29.2 Z',
  k: 'M 11.2 30.6 L 33.8 30.6 L 33.8 32.4 L 11.2 32.4 Z M 19.2 15.2 L 25.8 15.2 L 25.8 17 L 19.2 17 Z',
};

/** points décoratifs de la couronne de la dame (au bout des pointes) */
const QUEEN_TIPS: Array<[number, number]> = [
  [11.3, 9.2],
  [16.8, 7.2],
  [22.5, 6.2],
  [28.2, 7.2],
  [33.7, 9.2],
];

interface PieceGlyphProps {
  type: PieceType;
  color: ChessColor;
  style: PieceStyle;
  size?: number | string;
}

export function PieceGlyph({ type, color, style, size = '100%' }: PieceGlyphProps) {
  // id déterministe par (couleur, dégradé) : des ids dupliqués entre SVG
  // identiques résolvent vers le même gradient, rendu identique et stable
  const gid = style.gradient
    ? `cpg-${color}-${style.gradient.from.replace('#', '')}-${style.gradient.to.replace('#', '')}`
    : null;
  const bodyFill = gid ? `url(#${gid})` : style.body;
  const detailFill = style.detail ?? style.stroke;
  return (
    <svg
      viewBox="0 0 45 45"
      width={size}
      height={size}
      aria-hidden
      style={style.glow ? { filter: style.glow, display: 'block' } : { display: 'block' }}
    >
      {gid && style.gradient && (
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={style.gradient.from} />
            <stop offset="100%" stopColor={style.gradient.to} />
          </linearGradient>
        </defs>
      )}
      <path
        d={BODY[type]}
        fill={bodyFill}
        stroke={style.stroke}
        strokeWidth={style.strokeWidth}
        strokeLinejoin="round"
        style={{ paintOrder: 'stroke' }}
      />
      {DETAIL[type] && <path d={DETAIL[type] as string} fill={detailFill} />}
      {type === 'q' &&
        QUEEN_TIPS.map(([cx, cy], i) => (
          <circle key={i} cx={cx} cy={cy} r={1.7} fill={bodyFill} stroke={style.stroke} strokeWidth={style.strokeWidth * 0.7} style={{ paintOrder: 'stroke' }} />
        ))}
    </svg>
  );
}
