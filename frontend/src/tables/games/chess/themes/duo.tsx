/**
 * Thème DUO COULEUR : flat minimaliste, teinte choisie parmi 6 variantes
 * précalculées (hex en dur : pas de color-mix, prudence vieux Chrome mini-PC).
 * Capture 'fade' sobre. Le thème le plus léger : recommandé en ?perf=lite.
 *
 * Valeur de config : 'duo:violet' | 'duo:magenta' | 'duo:cyan' | 'duo:mint'
 * | 'duo:yellow' | 'duo:red'.
 */

import { PieceGlyph } from './pieces/StandardPieceSet';
import type { ChessTheme, PieceStyle } from './types';

export type DuoTint = 'violet' | 'magenta' | 'cyan' | 'mint' | 'yellow' | 'red';

interface DuoPalette {
  light: string;
  dark: string;
  accent: string;
  deep: string; // corps des pièces noires
}

export const DUO_TINTS: Record<DuoTint, DuoPalette> = {
  violet: { light: '#EAE3F8', dark: '#40306B', accent: '#A664FF', deep: '#241A3E' },
  magenta: { light: '#F8E3F3', dark: '#5E2350', accent: '#FF2BD6', deep: '#38142F' },
  cyan: { light: '#E1F4F9', dark: '#1E4B5E', accent: '#33E2FF', deep: '#102B36' },
  mint: { light: '#E2EFE8', dark: '#2E4A3D', accent: '#5ED9A1', deep: '#1A2B23' },
  yellow: { light: '#F7F1DC', dark: '#57502A', accent: '#FFE955', deep: '#332F18' },
  red: { light: '#F8E3E6', dark: '#5E2733', accent: '#FF3B5C', deep: '#38171E' },
};

export function parseDuoTint(themeString: string): DuoTint {
  const tint = themeString.split(':')[1] as DuoTint | undefined;
  return tint && tint in DUO_TINTS ? tint : 'violet';
}

const themeCache = new Map<DuoTint, ChessTheme>();

export function duoTheme(tint: DuoTint): ChessTheme {
  const cached = themeCache.get(tint);
  if (cached) return cached;
  const p = DUO_TINTS[tint];

  const white: PieceStyle = { body: '#FDFDFF', stroke: '#20242E', strokeWidth: 1.6 };
  const black: PieceStyle = { body: p.deep, stroke: '#F4F2FA', strokeWidth: 1.6, detail: '#F4F2FA' };

  const theme: ChessTheme = {
    id: `duo:${tint}`,
    labelKey: 'table.chess.theme.duo',
    pageBg: 'linear-gradient(180deg, #14101F 0%, #0B0813 100%)',
    boardFrameClass: 'rounded-2xl border-2 border-white/12 shadow-[0_16px_44px_rgba(0,0,0,0.5)]',
    lightSquare: p.light,
    darkSquare: p.dark,
    selectedOutline: p.accent,
    legalDot: (c) => (c === 'w' ? 'rgba(253,253,255,0.92)' : 'rgba(18,18,26,0.55)'),
    captureRing: '#FF3B5C',
    lastMoveTint: `${p.accent}42`,
    checkTint: 'rgba(255,59,92,0.5)',
    hudAccent: p.accent,
    clockDanger: '#FF3B5C',
    markerShape: 'round',
    pieceStyle: (c) => (c === 'w' ? white : black),
    renderPiece: (type, color, size) => (
      <PieceGlyph type={type} color={color} style={color === 'w' ? white : black} size={size} />
    ),
    moveMs: 180,
    moveEasing: 'cubic-bezier(0.25, 1, 0.5, 1)',
    captureFx: 'fade',
    captureMs: 220,
  };
  themeCache.set(tint, theme);
  return theme;
}
