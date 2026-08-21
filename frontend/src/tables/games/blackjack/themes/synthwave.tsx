/**
 * Thème SYNTHWAVE : dégradés violets, horizon quadrillé, rose et bleu
 * électriques. Traînées lumineuses et désintégrations.
 */

import type { BjTheme, ChipStyle } from './types';
import { tierOf } from './types';

const CHIPS: ChipStyle[] = [
  { base: '#241448', edge: '#01CDFE', text: '#CFF4FF' },
  { base: '#3A1160', edge: '#FF71CE', text: '#FFDDF2' },
  { base: '#101E52', edge: '#05FFA1', text: '#D8FFEE' },
  { base: '#2E0A3E', edge: '#FFFB96', text: '#FFFDDD' },
];

export const synthwaveTheme: BjTheme = {
  id: 'synthwave',
  labelKey: 'table.bj.theme.synthwave',

  pageBg: 'linear-gradient(180deg, #1A0B38 0%, #2A1152 45%, #3A1663 100%)',
  feltBg:
    'linear-gradient(rgba(255,113,206,0.07) 1.5px, transparent 1.5px) 0 0 / 100% 44px, linear-gradient(90deg, rgba(1,205,254,0.07) 1.5px, transparent 1.5px) 0 0 / 44px 100%, radial-gradient(85% 120% at 50% 8%, #24104A 0%, #180A34 60%, #110726 100%)',
  feltLine: 'rgba(255,113,206,0.55)',
  feltText: 'rgba(255,113,206,0.85)',

  cardFace: '#160933',
  cardBorder: '#01CDFE',
  cardRed: '#FF71CE',
  cardBlack: '#01CDFE',
  cardGlow: 'drop-shadow(0 0 5px rgba(255,113,206,0.4))',
  renderBack: () => (
    <g>
      <rect x="8" y="8" width="84" height="124" rx="6" fill="#120728" stroke="#FF71CE" strokeWidth="1.8" />
      <circle cx="50" cy="52" r="20" fill="none" stroke="#FFFB96" strokeWidth="2" />
      <line x1="30" y1="52" x2="70" y2="52" stroke="#120728" strokeWidth="4" />
      <line x1="32" y1="60" x2="68" y2="60" stroke="#120728" strokeWidth="4" />
      {[78, 90, 102, 114].map((y, i) => (
        <line key={y} x1={26 - i * 4} y1={y} x2={74 + i * 4} y2={y} stroke="rgba(1,205,254,0.6)" strokeWidth="1.6" />
      ))}
    </g>
  ),

  chipStyle: (value) => CHIPS[tierOf(value)],

  seatBg: 'rgba(19,9,42,0.93)',
  seatBorder: 'rgba(1,205,254,0.3)',
  hudAccent: '#FF71CE',
  danger: '#FF3B6B',
  gold: '#FFFB96',

  dealFx: 'trail',
  bustFx: 'dissolve',
  winFx: 'halo',
  dealMs: 420,
  flipMs: 300,
};
