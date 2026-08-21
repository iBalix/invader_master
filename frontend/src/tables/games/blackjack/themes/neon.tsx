/**
 * Thème NÉON INVADER : la DA du bar. Feutre bleu nuit, marquages cyan,
 * cartes sombres à contours lumineux, enseignes cyan/magenta. Distribution
 * en traînée lumineuse, dépassement en désintégration, victoire en halo.
 */

import type { BjTheme, ChipStyle } from './types';
import { tierOf } from './types';

const CHIPS: ChipStyle[] = [
  { base: '#1B2340', edge: '#7FD4FF', text: '#D5F4FF' },
  { base: '#301B4A', edge: '#C77FFF', text: '#EBD5FF' },
  { base: '#0E3A4A', edge: '#33E2FF', text: '#CFF6FF' },
  { base: '#3A0E33', edge: '#FF2BD6', text: '#FFD5F4' },
];

export const neonTheme: BjTheme = {
  id: 'neon',
  labelKey: 'table.bj.theme.neon',

  pageBg: 'radial-gradient(120% 100% at 50% 0%, #141B36 0%, #0B0E1F 55%, #070912 100%)',
  feltBg: 'radial-gradient(85% 120% at 50% 8%, #131A38 0%, #0C1026 52%, #080B1A 100%)',
  feltLine: 'rgba(51,226,255,0.5)',
  feltText: 'rgba(51,226,255,0.75)',

  cardFace: '#11162B',
  cardBorder: '#33E2FF',
  cardRed: '#FF5BD6',
  cardBlack: '#4AE8FF',
  cardGlow: 'drop-shadow(0 0 5px rgba(51,226,255,0.45))',
  renderBack: () => (
    <g>
      <rect x="8" y="8" width="84" height="124" rx="6" fill="#0C1026" stroke="rgba(51,226,255,0.65)" strokeWidth="1.6" />
      {[24, 40, 56, 72, 88, 104, 120].map((y) => (
        <line key={y} x1="10" y1={y} x2="90" y2={y} stroke="rgba(51,226,255,0.22)" strokeWidth="1" />
      ))}
      {[24, 40, 56, 72].map((x) => (
        <line key={x} x1={x + 2} y1="10" x2={x + 2} y2="130" stroke="rgba(255,43,214,0.18)" strokeWidth="1" />
      ))}
      <path d="M50 52 L66 70 L50 88 L34 70 Z" fill="none" stroke="#FF2BD6" strokeWidth="2.4" />
      <circle cx="50" cy="70" r="5" fill="#33E2FF" />
    </g>
  ),

  chipStyle: (value) => CHIPS[tierOf(value)],

  seatBg: 'rgba(13,18,40,0.92)',
  seatBorder: 'rgba(51,226,255,0.28)',
  hudAccent: '#33E2FF',
  danger: '#FF3B6B',
  gold: '#FFD34D',

  dealFx: 'trail',
  bustFx: 'dissolve',
  winFx: 'halo',
  dealMs: 420,
  flipMs: 300,
};
