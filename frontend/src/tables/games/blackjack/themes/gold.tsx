/**
 * Thème OR ET VELOURS : rouge sombre et dorures, très lisible. Gestes
 * feutrés du casino, accents dorés sur tous les temps forts.
 */

import type { BjTheme, ChipStyle } from './types';
import { tierOf } from './types';

const CHIPS: ChipStyle[] = [
  { base: '#F4E9D4', edge: '#7A1C2C', text: '#4A2B18' },
  { base: '#7A1C2C', edge: '#E8C267', text: '#F9EBD3' },
  { base: '#37246B', edge: '#E8C267', text: '#EDE4FF' },
  { base: '#241A12', edge: '#E8C267', text: '#F5E7C9' },
];

export const goldTheme: BjTheme = {
  id: 'gold',
  labelKey: 'table.bj.theme.gold',

  pageBg: 'radial-gradient(120% 100% at 50% 0%, #45101E 0%, #2E0A14 60%, #1E060D 100%)',
  feltBg: 'radial-gradient(85% 120% at 50% 10%, #571526 0%, #43101E 55%, #300A15 100%)',
  feltLine: 'rgba(232,194,103,0.6)',
  feltText: 'rgba(232,194,103,0.85)',

  cardFace: '#F9F4E6',
  cardBorder: '#C8A968',
  cardRed: '#A3122F',
  cardBlack: '#2B2118',
  renderBack: () => (
    <g>
      <rect x="8" y="8" width="84" height="124" rx="6" fill="#3A0D19" stroke="#E8C267" strokeWidth="2" />
      <rect x="16" y="16" width="68" height="108" rx="4" fill="none" stroke="rgba(232,194,103,0.55)" strokeWidth="1.4" />
      <path d="M50 34 L62 54 L50 74 L38 54 Z" fill="none" stroke="#E8C267" strokeWidth="1.8" />
      <path d="M50 66 L62 86 L50 106 L38 86 Z" fill="none" stroke="#E8C267" strokeWidth="1.8" />
      <circle cx="50" cy="70" r="6" fill="#E8C267" />
    </g>
  ),

  chipStyle: (value) => CHIPS[tierOf(value)],

  seatBg: 'rgba(30,7,14,0.93)',
  seatBorder: 'rgba(232,194,103,0.35)',
  hudAccent: '#E8C267',
  danger: '#E5484D',
  gold: '#F2D488',

  dealFx: 'slide',
  bustFx: 'sag',
  winFx: 'stack',
  dealMs: 480,
  flipMs: 360,
};
