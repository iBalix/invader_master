/**
 * Registre des thèmes de Flappy Bar. Le thème d'une partie est un string de
 * la config de session ; toute valeur inconnue retombe sur néon.
 */

import { abyssTheme } from './abyss';
import { auroraTheme } from './aurora';
import { invaderTheme } from './invader';
import { neonTheme } from './neon';
import { pixelTheme } from './pixel';
import type { FlapTheme } from './types';

export const FLAP_THEMES: FlapTheme[] = [neonTheme, pixelTheme, invaderTheme, abyssTheme, auroraTheme];

const BY_ID: Record<string, FlapTheme> = Object.fromEntries(FLAP_THEMES.map((theme) => [theme.id, theme]));

export function getFlapTheme(id: string | null | undefined): FlapTheme {
  return (id ? BY_ID[id] : undefined) ?? neonTheme;
}

export type { FlapTheme } from './types';
