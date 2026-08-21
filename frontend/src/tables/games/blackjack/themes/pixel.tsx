/**
 * Thème RÉTRO PIXEL : tapis et cartes en pixel art, coins carrés, rendu
 * crispEdges. Les cartes avancent par à-coups, tout explose en pixels.
 */

import type { BjTheme, ChipStyle } from './types';
import { tierOf } from './types';

const CHIPS: ChipStyle[] = [
  { base: '#E8E4D0', edge: '#3B3B54', text: '#23233A' },
  { base: '#E33B4E', edge: '#F7F3E2', text: '#FFF4EE' },
  { base: '#3F6FE0', edge: '#F7F3E2', text: '#EAF2FF' },
  { base: '#23233A', edge: '#FFC94D', text: '#FFE9B3' },
];

export const pixelTheme: BjTheme = {
  id: 'pixel',
  labelKey: 'table.bj.theme.pixel',

  pageBg: 'linear-gradient(180deg, #221A44 0%, #171232 60%, #100C24 100%)',
  feltBg: 'repeating-conic-gradient(#1E1740 0% 25%, #191338 0% 50%) 0 0 / 56px 56px',
  feltLine: 'rgba(255,201,77,0.55)',
  feltText: 'rgba(255,201,77,0.85)',

  cardFace: '#F2EFDF',
  cardBorder: '#3B3B54',
  cardRed: '#E33B4E',
  cardBlack: '#23233A',
  pixel: true,
  renderBack: () => (
    <g shapeRendering="crispEdges">
      <rect x="8" y="8" width="84" height="124" fill="#3F2E78" />
      {Array.from({ length: 7 }, (_, r) =>
        Array.from({ length: 5 }, (_, c) => (
          <rect
            key={`${r}-${c}`}
            x={12 + c * 16 + (r % 2 === 0 ? 0 : 8)}
            y={12 + r * 17}
            width="8"
            height="8"
            fill={(r + c) % 2 === 0 ? '#6C51C9' : '#2A1E56'}
          />
        )),
      )}
      <rect x="38" y="58" width="24" height="8" fill="#FFC94D" />
      <rect x="46" y="50" width="8" height="24" fill="#FFC94D" />
    </g>
  ),

  chipStyle: (value) => CHIPS[tierOf(value)],

  seatBg: 'rgba(20,16,40,0.94)',
  seatBorder: 'rgba(255,201,77,0.3)',
  hudAccent: '#FFC94D',
  danger: '#FF4D6A',
  gold: '#FFC94D',

  dealFx: 'step',
  bustFx: 'burst',
  winFx: 'burst',
  dealMs: 380,
  flipMs: 240,

  fontClass: 'bj-font-pixel',
};
