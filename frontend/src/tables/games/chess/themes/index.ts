/**
 * Registre des thèmes d'échecs. Le thème d'une partie est un simple string
 * dans la config de session ('classic', 'neon', 'electric', 'pixel',
 * 'duo:<teinte>', 'synthwave') ; toute valeur inconnue retombe sur classic.
 */

import { classicTheme } from './classic';
import { duoTheme, parseDuoTint, DUO_TINTS, type DuoTint } from './duo';
import { electricTheme } from './electric';
import { neonTheme } from './neon';
import { pixelTheme } from './pixel';
import { synthwaveTheme } from './synthwave';
import type { ChessTheme } from './types';

const REGISTRY: Record<string, ChessTheme> = {
  classic: classicTheme,
  neon: neonTheme,
  electric: electricTheme,
  pixel: pixelTheme,
  synthwave: synthwaveTheme,
};

export function getTheme(themeString: string | undefined | null): ChessTheme {
  if (!themeString) return classicTheme;
  if (themeString.startsWith('duo')) return duoTheme(parseDuoTint(themeString));
  return REGISTRY[themeString] ?? classicTheme;
}

/** choix affichés dans la modale de création (duo déplie ses teintes) */
export interface ThemeChoice {
  /** valeur de base ('duo' pour la tuile duo, la teinte est choisie à part) */
  value: string;
  labelKey: string;
  theme: ChessTheme;
  hasTints?: boolean;
}

export const THEME_CHOICES: ThemeChoice[] = [
  { value: 'neon', labelKey: neonTheme.labelKey, theme: neonTheme },
  { value: 'classic', labelKey: classicTheme.labelKey, theme: classicTheme },
  { value: 'electric', labelKey: electricTheme.labelKey, theme: electricTheme },
  { value: 'pixel', labelKey: pixelTheme.labelKey, theme: pixelTheme },
  { value: 'duo', labelKey: 'table.chess.theme.duo', theme: duoTheme('violet'), hasTints: true },
  { value: 'synthwave', labelKey: synthwaveTheme.labelKey, theme: synthwaveTheme },
];

export const DUO_TINT_LIST = Object.keys(DUO_TINTS) as DuoTint[];
export { DUO_TINTS, duoTheme };
export type { ChessTheme, DuoTint };
