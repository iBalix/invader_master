/**
 * Thème Abysses : fond marin. Eau profonde traversée de rais de lumière,
 * plancton, algues et rochers en silhouette. Les tuyaux sont des colonnes de
 * kelp aux bords bioluminescents, l'oiseau un poisson orange.
 */

import type { FlapTheme } from './types';
import { BIRD_TEX_H, BIRD_TEX_W, FRAME, GROUND_H, GROUND_W, PIPE_BODY_H, PIPE_BODY_W, PIPE_CAP_H, PIPE_CAP_W, WORLD_H, WORLD_W } from './types';
import { bakedHalo, circle, ellipse, fillRoundedRect, hGradient, noiseDots, rgba, rng, roundedRect, triangle, vGradient, withGlow, wrapX } from './draw';

const DEEP = '#06213a';
const ABYSS = '#010913';
const TEAL = '#2ee6c8';
const AQUA = '#7bf5ff';
const KELP = '#0a3a34';
const KELP_D = '#062a26';
const FISH = '#ffb347';
const FISH_D = '#ff8c42';
const FIN = '#ffd27a';
const ROCK = '#062230';
const WEED = '#031a28';
const WEED_FAR = 'rgba(3,40,50,0.85)';
const SAND = '#0a2030';
const SAND_D = '#04101c';

function drawFish(ctx: CanvasRenderingContext2D, wing: number): void {
  const cx = 66;
  const cy = 48;
  const sway = [-10, 0, 10][wing];
  bakedHalo(ctx, cx, cy, 30, rgba(AQUA, 0.18), 24);
  // queue
  triangle(ctx, 40, cy, 12, cy - 20 + sway, 12, cy + 20 + sway, FISH_D);
  // nageoires
  triangle(ctx, 52, cy - 16, 66, cy - 36, 86, cy - 14, FIN);
  ellipse(ctx, cx - 4, cy + 14, 13, 6, FIN, 0.6);
  // corps
  const g = ctx.createRadialGradient(cx + 8, cy - 8, 4, cx, cy, 36);
  g.addColorStop(0, '#ffd08a');
  g.addColorStop(0.5, FISH);
  g.addColorStop(1, FISH_D);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(cx + 2, cy, 34, 20, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.fillStyle = 'rgba(138,58,16,0.35)';
  ctx.fillRect(cx - 18, cy - 24, 7, 48);
  ctx.fillRect(cx - 2, cy - 24, 7, 48);
  ctx.fillRect(cx + 14, cy - 24, 6, 48);
  ctx.restore();
  // œil et bouche
  circle(ctx, cx + 22, cy - 6, 7, '#ffffff');
  circle(ctx, cx + 24, cy - 6, 3.5, '#10202a');
  ctx.strokeStyle = 'rgba(80,30,10,0.6)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx + 30, cy + 8, 5, 0.2, Math.PI - 0.2);
  ctx.stroke();
}

function weed(ctx: CanvasRenderingContext2D, x: number, base: number, height: number, width: number, color: string, leaves: boolean, r: () => number): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x, base + 10);
  const bend = (r() - 0.5) * 80;
  ctx.bezierCurveTo(x + bend, base - height * 0.4, x - bend, base - height * 0.7, x + bend * 0.5, base - height);
  ctx.stroke();
  if (leaves) {
    for (let k = 0; k < 4; k += 1) {
      const t = 0.3 + k * 0.18;
      const ly = base - height * t;
      ellipse(ctx, x + (k % 2 ? 14 : -14), ly, 16, 6, color, k % 2 ? 0.5 : -0.5);
    }
  }
}

export const abyssTheme: FlapTheme = {
  id: 'abyss',
  label: 'Abysses',
  palette: {
    sky: DEEP,
    skyBottom: ABYSS,
    accent: TEAL,
    accent2: AQUA,
    pipe: KELP,
    pipeEdge: TEAL,
    bird: FISH,
    text: '#e8fbff',
    hudBg: 'rgba(2,12,24,0.72)',
  },
  pixel: false,
  layers: [
    { key: 'far', speed: 0.03, y: 500, height: 460 },
    { key: 'mid', speed: 0.15, y: 700, height: 260 },
    { key: 'near', speed: 0.45, y: 780, height: 180 },
  ],
  ambient: { kind: 'bubbles', count: 30, tint: AQUA },
  trail: { count: 20, tint: AQUA },
  milestoneTints: ['#d6ecff', '#b0d0f0', '#8ab4dc', '#6a96c4'],

  drawAtlas(b) {
    for (let i = 0; i < 3; i += 1) {
      b.frame(FRAME.bird[i], BIRD_TEX_W, BIRD_TEX_H, (ctx) => drawFish(ctx, i));
    }
    b.frame(FRAME.pipeBody, PIPE_BODY_W, PIPE_BODY_H, (ctx, w, h) => {
      hGradient(ctx, 0, -40, w, h + 80, [
        [0, KELP_D],
        [0.15, KELP],
        [0.5, '#0e4a40'],
        [0.85, KELP],
        [1, KELP_D],
      ]);
      ctx.fillStyle = rgba(TEAL, 0.18);
      for (const x of [20, 40, 60]) ctx.fillRect(x, -40, 1, h + 80);
      withGlow(ctx, TEAL, 14, () => {
        ctx.fillStyle = TEAL;
        ctx.fillRect(2, -40, 3, h + 80);
        ctx.fillRect(w - 5, -40, 3, h + 80);
      });
    });
    b.frame(FRAME.pipeCap, PIPE_CAP_W, PIPE_CAP_H, (ctx, w, h) => {
      fillRoundedRect(ctx, 0, 0, w, h, 16, KELP);
      withGlow(ctx, TEAL, 12, () => {
        roundedRect(ctx, 4, 2, w - 8, 10, 6);
        ctx.fillStyle = rgba(TEAL, 0.85);
        ctx.fill();
      });
      for (const x of [24, 48, 72]) {
        withGlow(ctx, AQUA, 8, () => circle(ctx, x, 26, 3.5, AQUA));
      }
    });
  },

  drawBackdrops(d) {
    d.sky((ctx) => {
      vGradient(ctx, 0, 0, WORLD_W, WORLD_H, [
        [0, DEEP],
        [0.5, '#03162a'],
        [1, ABYSS],
      ]);
      const shaft = ctx.createLinearGradient(0, 0, 0, WORLD_H);
      shaft.addColorStop(0, 'rgba(140,230,255,0.16)');
      shaft.addColorStop(1, 'rgba(140,230,255,0)');
      ctx.fillStyle = shaft;
      for (let i = 0; i < 5; i += 1) {
        const x = 120 + i * 360;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x + 90, 0);
        ctx.lineTo(x + 460, WORLD_H);
        ctx.lineTo(x + 200, WORLD_H);
        ctx.closePath();
        ctx.fill();
      }
      noiseDots(ctx, 0, 0, WORLD_W, WORLD_H, 220, 'rgba(200,255,240,0.35)', 9, 2.2);
    });
    d.layer('far', 460, (ctx, w, h) => {
      wrapX(ctx, w, () => {
        const r = rng(4);
        for (let i = 0; i < 14; i += 1) {
          weed(ctx, r() * w, h, 180 + r() * 240, 10 + r() * 12, WEED_FAR, false, r);
        }
      });
    });
    d.layer('mid', 260, (ctx, w, h) => {
      wrapX(ctx, w, () => {
        const r = rng(14);
        for (let i = 0; i < 8; i += 1) {
          const x = r() * w;
          const rx = 60 + r() * 80;
          const ry = 40 + r() * 50;
          ellipse(ctx, x, h + 10, rx, ry, ROCK);
          ellipse(ctx, x - rx * 0.2, h + 10 - ry * 0.55, rx * 0.5, ry * 0.3, 'rgba(40,90,110,0.35)');
        }
      });
    });
    d.layer('near', 180, (ctx, w, h) => {
      wrapX(ctx, w, () => {
        const r = rng(19);
        for (let i = 0; i < 10; i += 1) {
          weed(ctx, r() * w, h, 90 + r() * 90, 8 + r() * 8, WEED, true, r);
        }
      });
    });
    d.ground((ctx) => {
      vGradient(ctx, 0, 0, GROUND_W, GROUND_H, [
        [0, '#0f2a3c'],
        [0.08, SAND],
        [1, SAND_D],
      ]);
      const r = rng(8);
      for (let i = 0; i < 18; i += 1) {
        const x = r() * GROUND_W;
        const y = 12 + r() * 96;
        const rx = 6 + r() * 10;
        const ry = 3 + r() * 4;
        const c = r() < 0.5 ? '#0d2a3a' : '#123244';
        ellipse(ctx, x, y, rx, ry, c);
        if (x + rx > GROUND_W) ellipse(ctx, x - GROUND_W, y, rx, ry, c);
        if (x - rx < 0) ellipse(ctx, x + GROUND_W, y, rx, ry, c);
      }
      ctx.fillStyle = rgba(TEAL, 0.25);
      ctx.fillRect(0, 0, GROUND_W, 2);
    });
  },
};
