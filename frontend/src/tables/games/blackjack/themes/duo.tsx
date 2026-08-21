/**
 * Thème DUO : épuré, une seule teinte d'accent sur fond neutre. Le plus
 * léger : gestes courts, aucun halo, à privilégier sur les dalles lentes.
 */

import type { BjTheme, ChipStyle } from './types';
import { tierOf } from './types';

const ACCENT = '#3EE0C8';

const CHIPS: ChipStyle[] = [
  { base: '#22262B', edge: '#9AA3AD', text: '#E8ECF0' },
  { base: '#173B36', edge: ACCENT, text: '#D8FFF7' },
  { base: '#10262E', edge: '#6FC3E0', text: '#DCF4FF' },
  { base: '#2B2314', edge: '#E0C36F', text: '#FFF3D6' },
];

export const duoTheme: BjTheme = {
  id: 'duo',
  labelKey: 'table.bj.theme.duo',

  pageBg: 'linear-gradient(180deg, #16181C 0%, #101216 100%)',
  feltBg: 'radial-gradient(85% 120% at 50% 10%, #1B1F25 0%, #14171C 60%, #0F1115 100%)',
  feltLine: 'rgba(62,224,200,0.4)',
  feltText: 'rgba(62,224,200,0.7)',

  cardFace: '#F4F5F2',
  cardBorder: '#B9BFC2',
  cardRed: '#D8365B',
  cardBlack: '#22262B',
  renderBack: () => (
    <g>
      <rect x="8" y="8" width="84" height="124" rx="6" fill="#181C21" stroke={ACCENT} strokeWidth="1.8" />
      <rect x="20" y="24" width="60" height="92" rx="4" fill="none" stroke="rgba(62,224,200,0.4)" strokeWidth="1.4" />
      <circle cx="50" cy="70" r="12" fill="none" stroke={ACCENT} strokeWidth="2" />
    </g>
  ),

  chipStyle: (value) => CHIPS[tierOf(value)],

  seatBg: 'rgba(18,21,25,0.94)',
  seatBorder: 'rgba(62,224,200,0.25)',
  hudAccent: ACCENT,
  danger: '#F0566E',
  gold: '#E0C36F',

  dealFx: 'slide',
  bustFx: 'sag',
  winFx: 'halo',
  dealMs: 340,
  flipMs: 240,
};
