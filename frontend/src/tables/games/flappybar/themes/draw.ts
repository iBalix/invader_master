/**
 * Boîte à outils canvas 2D partagée par les thèmes : dégradés, halos cuits,
 * champs d'étoiles, silhouettes, pixel art. Tout est déterministe (PRNG à
 * graine) pour que les copies d'une tuile bouclée soient identiques.
 */

import type { AtlasBuilder } from './types';
import { FRAME } from './types';

type Ctx = CanvasRenderingContext2D;

/** mulberry32 décoratif (pas celui de la sim) */
export function rng(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function hexToInt(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  return (r << 16) | (g << 8) | b;
}

export function rgba(hex: string, a: number): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

/** mélange linéaire de deux couleurs hex, t dans [0,1] */
export function mix(a: string, b: string, t: number): string {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  const r = Math.round(ca.r + (cb.r - ca.r) * t);
  const g = Math.round(ca.g + (cb.g - ca.g) * t);
  const bl = Math.round(ca.b + (cb.b - ca.b) * t);
  return `rgb(${r},${g},${bl})`;
}

export function vGradient(ctx: Ctx, x: number, y: number, w: number, h: number, stops: Array<[number, string]>): void {
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  for (const [o, c] of stops) g.addColorStop(o, c);
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
}

export function hGradient(ctx: Ctx, x: number, y: number, w: number, h: number, stops: Array<[number, string]>): void {
  const g = ctx.createLinearGradient(x, 0, x + w, 0);
  for (const [o, c] of stops) g.addColorStop(o, c);
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
}

/** disque à dégradé radial (inner au centre, outer au bord) */
export function radialGlow(ctx: Ctx, x: number, y: number, r: number, inner: string, outer = 'rgba(0,0,0,0)', mid?: string): void {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, inner);
  if (mid) g.addColorStop(0.45, mid);
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

/** disque avec halo cuit (shadowBlur) */
export function bakedHalo(ctx: Ctx, x: number, y: number, r: number, color: string, blur: number): void {
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** exécute `draw` avec une ombre lumineuse (halo cuit sur n'importe quelle forme) */
export function withGlow(ctx: Ctx, color: string, blur: number, draw: () => void): void {
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
  draw();
  ctx.restore();
}

export function circle(ctx: Ctx, x: number, y: number, r: number, fill: string): void {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

export function ellipse(ctx: Ctx, x: number, y: number, rx: number, ry: number, fill: string, rotation = 0): void {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rotation, 0, Math.PI * 2);
  ctx.fill();
}

export function roundedRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}

export function fillRoundedRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number, fill: string): void {
  roundedRect(ctx, x, y, w, h, r);
  ctx.fillStyle = fill;
  ctx.fill();
}

export function triangle(ctx: Ctx, x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, fill: string): void {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.lineTo(x3, y3);
  ctx.closePath();
  ctx.fill();
}

export function starField(ctx: Ctx, w: number, h: number, count: number, seed: number, colors: string[], maxR = 1.6): void {
  const r = rng(seed);
  for (let i = 0; i < count; i += 1) {
    const x = r() * w;
    const y = r() * h;
    const rad = 0.5 + r() * maxR;
    const c = colors[Math.floor(r() * colors.length)];
    ctx.globalAlpha = 0.45 + r() * 0.55;
    circle(ctx, x, y, rad, c);
  }
  ctx.globalAlpha = 1;
}

export function noiseDots(ctx: Ctx, x: number, y: number, w: number, h: number, count: number, color: string, seed: number, size: number): void {
  const r = rng(seed);
  ctx.fillStyle = color;
  for (let i = 0; i < count; i += 1) {
    const s = size * (0.5 + r());
    ctx.fillRect(x + r() * w, y + r() * h, s, s);
  }
}

/** grille "rétro" : lignes horizontales aux ordonnées données, verticales tous les `cell` px */
export function pixelGrid(ctx: Ctx, x: number, y: number, w: number, h: number, cell: number, rows: number[], color: string, lineWidth = 2): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.beginPath();
  for (const ry of rows) {
    ctx.moveTo(x, y + ry);
    ctx.lineTo(x + w, y + ry);
  }
  for (let cx = x; cx <= x + w; cx += cell) {
    ctx.moveTo(cx, y);
    ctx.lineTo(cx, y + h);
  }
  ctx.stroke();
}

/** soleil synthwave : dégradé vertical coupé de bandes sombres */
export function stripedSun(ctx: Ctx, x: number, y: number, r: number, top: string, bottom: string, bands: number, bandColor: string): void {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.clip();
  vGradient(ctx, x - r, y - r, r * 2, r * 2, [
    [0, top],
    [1, bottom],
  ]);
  ctx.fillStyle = bandColor;
  for (let i = 0; i < bands; i += 1) {
    const t = 0.35 + (i / bands) * 0.65;
    const by = y - r + t * 2 * r;
    const bh = 4 + i * 4;
    ctx.fillRect(x - r, by, r * 2, bh);
  }
  ctx.restore();
}

export interface SkylineOptions {
  minW: number;
  maxW: number;
  minH: number;
  maxH: number;
  /** taille d'une fenêtre (px) */
  window: number;
  /** proportion de fenêtres allumées */
  density: number;
}

/** immeubles en silhouette avec fenêtres allumées ; boucle sur [0, w) */
export function skylineSilhouette(ctx: Ctx, w: number, baseY: number, seed: number, color: string, windows: string[], opts: SkylineOptions): void {
  const r = rng(seed);
  const buildings: Array<{ x: number; bw: number; bh: number; seed: number }> = [];
  let x = 0;
  while (x < w) {
    const bw = Math.round(opts.minW + r() * (opts.maxW - opts.minW));
    const bh = Math.round(opts.minH + r() * (opts.maxH - opts.minH));
    buildings.push({ x, bw, bh, seed: Math.floor(r() * 1e9) });
    x += bw + Math.round(r() * 10);
  }
  const drawBuilding = (bx: number, b: { bw: number; bh: number; seed: number }) => {
    const br = rng(b.seed);
    ctx.fillStyle = color;
    ctx.fillRect(bx, baseY - b.bh, b.bw, b.bh);
    if (br() < 0.3) ctx.fillRect(bx + b.bw / 2 - 2, baseY - b.bh - 34, 4, 34);
    const step = opts.window + 8;
    for (let wy = baseY - b.bh + 12; wy < baseY - 10; wy += step) {
      for (let wx = bx + 8; wx < bx + b.bw - opts.window - 4; wx += step) {
        if (br() < opts.density) {
          ctx.fillStyle = windows[Math.floor(br() * windows.length)];
          ctx.fillRect(wx, wy, opts.window, opts.window);
        }
      }
    }
  };
  for (const b of buildings) {
    drawBuilding(b.x, b);
    if (b.x + b.bw > w) drawBuilding(b.x - w, b);
  }
}

/** dessine trois fois (à -w, 0, +w) : les formes qui dépassent bouclent proprement */
export function wrapX(ctx: Ctx, w: number, draw: () => void): void {
  for (const dx of [-w, 0, w]) {
    ctx.save();
    ctx.translate(dx, 0);
    draw();
    ctx.restore();
  }
}

/** pixel art : dessine en basse résolution puis agrandit sans lissage */
export function pixelate(ctx: Ctx, w: number, h: number, factor: number, drawLow: (lc: Ctx, lw: number, lh: number) => void): void {
  const lw = Math.ceil(w / factor);
  const lh = Math.ceil(h / factor);
  const low = document.createElement('canvas');
  low.width = lw;
  low.height = lh;
  const lc = low.getContext('2d');
  if (!lc) return;
  drawLow(lc, lw, lh);
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(low, 0, 0, lw, lh, 0, 0, lw * factor, lh * factor);
  ctx.restore();
}

/** ellipse en pixels entiers (basse résolution), contour optionnel d'un pixel */
export function pixelEllipse(ctx: Ctx, cx: number, cy: number, rx: number, ry: number, fill: string, outline?: string): void {
  const inside = (x: number, y: number) => ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1;
  const x0 = Math.floor(cx - rx - 1);
  const x1 = Math.ceil(cx + rx + 1);
  const y0 = Math.floor(cy - ry - 1);
  const y1 = Math.ceil(cy + ry + 1);
  if (outline) {
    ctx.fillStyle = outline;
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        if (!inside(x, y) && (inside(x - 1, y) || inside(x + 1, y) || inside(x, y - 1) || inside(x, y + 1))) {
          ctx.fillRect(x, y, 1, 1);
        }
      }
    }
  }
  ctx.fillStyle = fill;
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      if (inside(x, y)) ctx.fillRect(x, y, 1, 1);
    }
  }
}

/** ruban ondulé (aurore, algue, nébuleuse) : bande épaisse le long d'une sinusoïde */
export function wavyBand(ctx: Ctx, x0: number, x1: number, yMid: number, amp: number, period: number, thickness: number, phase: number, fill: string): void {
  ctx.fillStyle = fill;
  ctx.beginPath();
  const step = 16;
  for (let x = x0; x <= x1; x += step) {
    const y = yMid + Math.sin((x / period) * Math.PI * 2 + phase) * amp;
    if (x === x0) ctx.moveTo(x, y - thickness / 2);
    else ctx.lineTo(x, y - thickness / 2);
  }
  for (let x = x1; x >= x0; x -= step) {
    const y = yMid + Math.sin((x / period) * Math.PI * 2 + phase) * amp;
    ctx.lineTo(x, y + thickness / 2);
  }
  ctx.closePath();
  ctx.fill();
}

/** particules blanches partagées (teintées à l'exécution) */
export function drawParticleFrames(b: AtlasBuilder): void {
  b.frame(FRAME.particle, 32, 32, (ctx) => {
    radialGlow(ctx, 16, 16, 16, 'rgba(255,255,255,1)', 'rgba(255,255,255,0)', 'rgba(255,255,255,0.6)');
  });
  b.frame(FRAME.spark, 16, 16, (ctx) => {
    radialGlow(ctx, 8, 8, 8, 'rgba(255,255,255,1)', 'rgba(255,255,255,0)');
    circle(ctx, 8, 8, 2.5, '#ffffff');
  });
  b.frame(FRAME.puff, 48, 48, (ctx) => {
    ctx.globalAlpha = 0.55;
    circle(ctx, 24, 24, 14, '#ffffff');
    circle(ctx, 14, 26, 10, '#ffffff');
    circle(ctx, 34, 26, 10, '#ffffff');
    circle(ctx, 22, 14, 9, '#ffffff');
    circle(ctx, 28, 34, 9, '#ffffff');
    ctx.globalAlpha = 1;
  });
}
