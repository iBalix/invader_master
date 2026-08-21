/**
 * Face de carte dessinée en code : 4 enseignes (chemins SVG), rangs en
 * typographie, disposition de symboles pour les cartes numérotées, trois
 * figures géométriques simplifiées (V/D/R). Un jeu de 52 cartes ne demande
 * pas 52 dessins.
 *
 * ViewBox 100 x 140. Le thème fournit couleurs, dos et style (pixel...).
 */

import type { ReactNode } from 'react';
import { parseCard } from '../lib/cards';
import type { Card } from '../lib/bjTypes';
import type { BjTheme } from './types';

/** enseignes dans un viewBox 24x24, centrées */
const SUIT_PATHS: Record<string, ReactNode> = {
  h: (
    <path d="M12 21 C7 16.4 2 12.8 2 8.4 A4.9 4.9 0 0 1 12 6.6 A4.9 4.9 0 0 1 22 8.4 C22 12.8 17 16.4 12 21 Z" />
  ),
  d: <path d="M12 1.5 L20.5 12 L12 22.5 L3.5 12 Z" />,
  s: (
    <path d="M12 2 C16 7 22 10.6 22 15 A4.7 4.7 0 0 1 13.6 17.9 C13.9 19.9 14.6 21.3 16 22 L8 22 C9.4 21.3 10.1 19.9 10.4 17.9 A4.7 4.7 0 0 1 2 15 C2 10.6 8 7 12 2 Z" />
  ),
  c: (
    <>
      <circle cx="12" cy="7.6" r="4.6" />
      <circle cx="6.4" cy="14.2" r="4.6" />
      <circle cx="17.6" cy="14.2" r="4.6" />
      <path d="M10.4 15.5 C10.7 18.8 9.9 21 8.4 22 L15.6 22 C14.1 21 13.3 18.8 13.6 15.5 Z" />
    </>
  ),
};

function SuitGlyph({ suit, x, y, size, flip }: { suit: string; x: number; y: number; size: number; flip?: boolean }) {
  const transform = `translate(${x - size / 2} ${y - size / 2}) scale(${size / 24})${
    flip ? ` rotate(180 12 12)` : ''
  }`;
  return <g transform={transform}>{SUIT_PATHS[suit]}</g>;
}

/** dispositions des symboles pour 2..10 ([x, y] dans le viewBox 100x140) */
const PIP_LAYOUTS: Record<string, Array<[number, number]>> = {
  '2': [[50, 44], [50, 104]],
  '3': [[50, 42], [50, 74], [50, 106]],
  '4': [[34, 44], [66, 44], [34, 104], [66, 104]],
  '5': [[34, 44], [66, 44], [50, 74], [34, 104], [66, 104]],
  '6': [[34, 44], [66, 44], [34, 74], [66, 74], [34, 104], [66, 104]],
  '7': [[34, 44], [66, 44], [50, 58], [34, 74], [66, 74], [34, 104], [66, 104]],
  '8': [[34, 44], [66, 44], [50, 58], [34, 74], [66, 74], [50, 90], [34, 104], [66, 104]],
  '9': [[34, 42], [66, 42], [34, 64], [66, 64], [50, 53], [34, 86], [66, 86], [34, 108], [66, 108]],
  T: [[34, 42], [66, 42], [50, 53], [34, 64], [66, 64], [34, 86], [66, 86], [50, 97], [34, 108], [66, 108]],
};

/** figures géométriques (24x24) : valet = fanion, dame = diadème, roi = couronne */
const FIGURE_PATHS: Record<string, ReactNode> = {
  J: (
    <>
      <rect x="10.9" y="3" width="2.2" height="18" rx="1" />
      <path d="M13.1 4.5 L21.5 7.8 L13.1 11 Z" />
      <rect x="8" y="20" width="8" height="2" rx="1" />
    </>
  ),
  Q: (
    <>
      <path d="M4.5 19.5 L6 10.5 L12 14.5 L18 10.5 L19.5 19.5 Z" />
      <circle cx="5.5" cy="8" r="2" />
      <circle cx="12" cy="5" r="2" />
      <circle cx="18.5" cy="8" r="2" />
    </>
  ),
  K: (
    <>
      <path d="M4.5 19.5 L4.5 8.5 L9 12.5 L12 5 L15 12.5 L19.5 8.5 L19.5 19.5 Z" />
      <rect x="4.5" y="19" width="15" height="2.6" rx="1" />
    </>
  ),
};

interface Props {
  card: Card | 'back';
  theme: BjTheme;
  /** largeur px ; la hauteur suit le ratio 1:1.4 */
  width: number;
  className?: string;
  style?: React.CSSProperties;
}

export default function CardGlyph({ card, theme, width, className, style }: Props) {
  const height = width * 1.4;
  const pixel = theme.pixel === true;
  const radius = pixel ? 3 : 10;

  const common = {
    width,
    height,
    viewBox: '0 0 100 140',
    className,
    style,
    shapeRendering: pixel ? ('crispEdges' as const) : ('auto' as const),
  };

  if (card === 'back') {
    return (
      <svg {...common} aria-hidden>
        <rect x="1.5" y="1.5" width="97" height="137" rx={radius} fill={theme.cardFace} stroke={theme.cardBorder} strokeWidth="3" />
        {theme.renderBack()}
      </svg>
    );
  }

  const parsed = parseCard(card);
  if (parsed.hidden) {
    return (
      <svg {...common} aria-hidden>
        <rect x="1.5" y="1.5" width="97" height="137" rx={radius} fill={theme.cardFace} stroke={theme.cardBorder} strokeWidth="3" />
        {theme.renderBack()}
      </svg>
    );
  }

  const ink = parsed.red ? theme.cardRed : theme.cardBlack;
  const { rank, suit, label } = parsed;
  const isFigure = rank === 'J' || rank === 'Q' || rank === 'K';
  const pips = PIP_LAYOUTS[rank];
  const fontFamily = pixel ? "'Press Start 2P', 'Courier New', monospace" : 'inherit';
  const indexSize = pixel ? 15 : 19;

  return (
    <svg {...common} aria-hidden>
      <rect x="1.5" y="1.5" width="97" height="137" rx={radius} fill={theme.cardFace} stroke={theme.cardBorder} strokeWidth="3" />
      {/* index coin haut-gauche + bas-droite (retourné) */}
      <g fill={ink}>
        <text x="13" y="22" fontSize={indexSize} fontWeight="800" textAnchor="middle" fontFamily={fontFamily}>
          {label}
        </text>
        <SuitGlyph suit={suit} x={13} y={33} size={13} />
        <g transform="rotate(180 50 70)">
          <text x="13" y="22" fontSize={indexSize} fontWeight="800" textAnchor="middle" fontFamily={fontFamily}>
            {label}
          </text>
          <SuitGlyph suit={suit} x={13} y={33} size={13} />
        </g>
      </g>

      {/* centre */}
      <g fill={ink}>
        {rank === 'A' && <SuitGlyph suit={suit} x={50} y={70} size={44} />}
        {pips &&
          pips.map(([x, y], i) => (
            <SuitGlyph key={i} suit={suit} x={x} y={y} size={17} flip={y > 74} />
          ))}
        {isFigure && (
          <>
            <rect x="24" y="34" width="52" height="72" rx={pixel ? 2 : 6} fill="none" stroke={ink} strokeWidth="2" opacity="0.55" />
            <g transform="translate(38 40) scale(1)">
              <g transform="scale(1)">{FIGURE_PATHS[rank]}</g>
            </g>
            <g transform="rotate(180 50 70)">
              <g transform="translate(38 40)">{FIGURE_PATHS[rank]}</g>
            </g>
            <SuitGlyph suit={suit} x={50} y={70} size={14} />
          </>
        )}
      </g>
    </svg>
  );
}
