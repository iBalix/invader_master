/**
 * Thème CASINO CLASSIQUE : feutre vert profond, cartes ivoire
 * traditionnelles, jetons à créneaux. Les cartes glissent sur le feutre,
 * les mains perdues s'affaissent, les gains s'empilent proprement.
 */

import type { BjTheme, ChipStyle } from './types';
import { tierOf } from './types';

const CHIPS: ChipStyle[] = [
  { base: '#F2EFE6', edge: '#B23A48', text: '#31241C' },
  { base: '#B23A48', edge: '#F2EFE6', text: '#FFF4EE' },
  { base: '#1F5FA8', edge: '#F2EFE6', text: '#EAF4FF' },
  { base: '#20242B', edge: '#D9A441', text: '#F5E7C9' },
];

export const casinoTheme: BjTheme = {
  id: 'casino',
  labelKey: 'table.bj.theme.casino',

  pageBg: 'radial-gradient(120% 100% at 50% 0%, #143B27 0%, #0C2718 60%, #081C11 100%)',
  feltBg: 'radial-gradient(85% 120% at 50% 10%, #1F6A43 0%, #145030 55%, #0E3A22 100%)',
  feltLine: 'rgba(233,220,180,0.5)',
  feltText: 'rgba(233,220,180,0.8)',

  cardFace: '#FDFBF2',
  cardBorder: '#C9C2AC',
  cardRed: '#C8102E',
  cardBlack: '#20201E',
  renderBack: () => (
    <g>
      <rect x="8" y="8" width="84" height="124" rx="6" fill="#8E1F2F" stroke="#F2E8CE" strokeWidth="2" />
      {Array.from({ length: 6 }, (_, i) => (
        <line key={`a${i}`} x1={8 + i * 17} y1="8" x2={8 + i * 17 + 40} y2="132" stroke="rgba(242,232,206,0.4)" strokeWidth="1.4" />
      ))}
      {Array.from({ length: 6 }, (_, i) => (
        <line key={`b${i}`} x1={92 - i * 17} y1="8" x2={92 - i * 17 - 40} y2="132" stroke="rgba(242,232,206,0.4)" strokeWidth="1.4" />
      ))}
      <circle cx="50" cy="70" r="13" fill="#8E1F2F" stroke="#F2E8CE" strokeWidth="1.6" />
      <circle cx="50" cy="70" r="5" fill="#F2E8CE" />
    </g>
  ),

  chipStyle: (value) => CHIPS[tierOf(value)],

  seatBg: 'rgba(10,26,17,0.92)',
  seatBorder: 'rgba(233,220,180,0.25)',
  hudAccent: '#D9A441',
  danger: '#E5484D',
  gold: '#E8C267',

  dealFx: 'slide',
  bustFx: 'sag',
  winFx: 'stack',
  dealMs: 460,
  flipMs: 340,
};
