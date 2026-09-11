/**
 * Police bitmap "rétro" générée au boot : une planche de glyphes Bebas Neue
 * dessinée sur un canvas, parsée par Phaser.GameObjects.RetroFont, puis
 * rendue proportionnelle (avance mesurée par glyphe). Sert aux étiquettes des
 * fantômes et aux pops de score : aucun Text DOM/canvas par frame.
 */

import Phaser from 'phaser';

export const FLAP_FONT = 'flap-font';
const SHEET_KEY = 'flap-font-sheet';
const CHARS =
  ' !"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~ÀÂÇÉÈÊÎÔÙÛàâçéèêîôùû';
const PER_ROW = 16;

interface RetroEntry {
  data: { chars: Record<number, { xAdvance: number }> };
}

export function buildRetroFont(scene: Phaser.Scene, family: string, size: number, pixel: boolean): boolean {
  const probe = document.createElement('canvas').getContext('2d');
  if (!probe) return false;
  const font = `${size}px ${family}`;
  probe.font = font;
  const advances: number[] = [];
  let maxW = 0;
  for (let i = 0; i < CHARS.length; i += 1) {
    const w = probe.measureText(CHARS[i]).width;
    advances.push(w);
    if (w > maxW) maxW = w;
  }
  const cellW = Math.ceil(maxW) + 6;
  const cellH = Math.ceil(size * 1.3);
  const rows = Math.ceil(CHARS.length / PER_ROW);

  const tex = scene.textures.createCanvas(SHEET_KEY, cellW * PER_ROW, cellH * rows);
  if (!tex) return false;
  const ctx = tex.getContext();
  ctx.font = font;
  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  for (let i = 0; i < CHARS.length; i += 1) {
    const col = i % PER_ROW;
    const row = Math.floor(i / PER_ROW);
    ctx.fillText(CHARS[i], col * cellW + 3, row * cellH + cellH / 2);
  }
  tex.refresh();
  if (pixel) tex.setFilter(Phaser.Textures.FilterMode.NEAREST);

  // le typage annonce BitmapFontData, le runtime renvoie l'entrée de cache { data, texture, frame }
  const entry = Phaser.GameObjects.RetroFont.Parse(scene, {
    image: SHEET_KEY,
    width: cellW,
    height: cellH,
    chars: CHARS,
    charsPerRow: PER_ROW,
    'offset.x': 0,
    'offset.y': 0,
    'spacing.x': 0,
    'spacing.y': 0,
    lineSpacing: 0,
  }) as unknown as RetroEntry;
  for (let i = 0; i < CHARS.length; i += 1) {
    const glyph = entry.data.chars[CHARS.charCodeAt(i)];
    if (glyph) glyph.xAdvance = Math.round(advances[i]) + 3;
  }
  scene.cache.bitmapFont.add(FLAP_FONT, entry);
  return true;
}
