/**
 * Registre des thèmes de blackjack. Néon Invader par défaut (DA du bar).
 */

import { neonTheme } from './neon';
import { casinoTheme } from './casino';
import { pixelTheme } from './pixel';
import { goldTheme } from './gold';
import { synthwaveTheme } from './synthwave';
import { duoTheme } from './duo';
import type { BjTheme } from './types';

export const BJ_THEMES: BjTheme[] = [
  neonTheme,
  casinoTheme,
  pixelTheme,
  goldTheme,
  synthwaveTheme,
  duoTheme,
];

export function getBjTheme(id: string | null | undefined): BjTheme {
  return BJ_THEMES.find((t) => t.id === id) ?? neonTheme;
}
