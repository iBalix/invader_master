/**
 * Thème Aurore : nuit polaire. Rubans d'aurore verts et violets cuits dans
 * le ciel, montagnes enneigées, sapins en silhouette, sol de neige. Les
 * tuyaux sont des piliers de glace, l'oiseau une chouette des neiges.
 */

import type { FlapTheme } from './types';
import { BIRD_TEX_H, BIRD_TEX_W, FRAME, GROUND_H, GROUND_W, PIPE_BODY_H, PIPE_BODY_W, PIPE_CAP_H, PIPE_CAP_W, WORLD_H, WORLD_W } from './types';
import { bakedHalo, circle, ellipse, fillRoundedRect, hGradient, noiseDots, rgba, rng, roundedRect, starField, triangle, vGradient, wavyBand, withGlow, wrapX } from './draw';

const NIGHT = '#0a1230';
const HORIZON = '#1a2a50';
const GREEN = '#6dff9e';
const VIOLET = '#b57bff';
const ICE = '#c8e8ff';
const ICE_D = '#7fb8ff';
const ICE_EDGE = '#7fd8ff';
const OWL = '#f4f4ff';
const OWL_G = '#c8ccd8';
const EYE = '#ffd23f';
const PINE = '#0a1424';
const MOUNT = '#c8d8f0';
const MOUNT_D = '#6a7fa8';
const MOUNT_BACK = '#3a4a78';
const SNOW = '#e8f0ff';
const SNOW_D = '#b8c8e8';

function drawOwl(ctx: CanvasRenderingContext2D, wing: number): void {
  const cx = 64;
  const cy = 50;
  bakedHalo(ctx, cx, cy, 30, rgba('#ffffff', 0.25), 20);
  // aigrettes
  triangle(ctx, cx - 22, cy - 22, cx - 30, cy - 44, cx - 8, cy - 30, OWL_G);
  triangle(ctx, cx + 22, cy - 22, cx + 30, cy - 44, cx + 8, cy - 30, OWL_G);
  // aile
  const wy = [cy - 14, cy + 2, cy + 18][wing];
  const rot = [-0.6, -0.2, 0.3][wing];
  ellipse(ctx, cx - 26, wy, 22, 11, OWL_G, rot);
  ellipse(ctx, cx - 38, wy + 4, 8, 5, '#9aa0b4', rot);
  // corps
  const g = ctx.createRadialGradient(cx - 8, cy - 10, 6, cx, cy, 34);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(1, '#d8dce8');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, 34, 0, Math.PI * 2);
  ctx.fill();
  noiseDots(ctx, cx - 20, cy + 6, 40, 24, 22, 'rgba(120,128,150,0.35)', 5, 3);
  // yeux
  for (const ex of [cx + 4, cx + 24]) {
    circle(ctx, ex, cy - 8, 12, '#ffffff');
    circle(ctx, ex, cy - 8, 8, EYE);
    circle(ctx, ex + 1, cy - 8, 4, '#101020');
    circle(ctx, ex - 2, cy - 11, 1.5, '#ffffff');
  }
  // bec
  triangle(ctx, cx + 10, cy + 2, cx + 18, cy + 2, cx + 14, cy + 12, '#3a3a48');
}

function mountainRange(ctx: CanvasRenderingContext2D, w: number, baseY: number, seed: number, minH: number, maxH: number, segments: number, fill: string | CanvasGradient): void {
  const r = rng(seed);
  const heights: number[] = [];
  for (let i = 0; i < segments; i += 1) heights.push(minH + r() * (maxH - minH));
  heights.push(heights[0]);
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(0, baseY);
  for (let i = 0; i <= segments; i += 1) {
    ctx.lineTo((i * w) / segments, baseY - heights[i]);
  }
  ctx.lineTo(w, baseY);
  ctx.closePath();
  ctx.fill();
}

function pine(ctx: CanvasRenderingContext2D, x: number, base: number, height: number): void {
  const half = height * 0.3;
  ctx.fillStyle = PINE;
  ctx.fillRect(x - 4, base - height * 0.2, 8, height * 0.2 + 12);
  for (let k = 0; k < 3; k += 1) {
    const top = base - height + k * height * 0.28;
    const bottom = top + height * 0.42;
    const hw = half * (0.55 + k * 0.25);
    triangle(ctx, x, top, x - hw, bottom, x + hw, bottom, PINE);
  }
}

export const auroraTheme: FlapTheme = {
  id: 'aurora',
  label: 'Aurore',
  palette: {
    sky: NIGHT,
    skyBottom: HORIZON,
    accent: GREEN,
    accent2: VIOLET,
    pipe: ICE,
    pipeEdge: ICE_EDGE,
    bird: OWL,
    text: '#ffffff',
    hudBg: 'rgba(8,14,40,0.72)',
  },
  pixel: false,
  layers: [
    { key: 'far', speed: 0.03, y: 100, height: 400 },
    { key: 'mid', speed: 0.15, y: 560, height: 400 },
    { key: 'near', speed: 0.45, y: 800, height: 160 },
  ],
  ambient: { kind: 'snow', count: 40, tint: '#ffffff' },
  trail: { count: 16, tint: '#ffffff' },
  milestoneTints: ['#e2ffe9', '#d6f2ff', '#e6dcff', '#ffe4f0'],

  drawAtlas(b) {
    for (let i = 0; i < 3; i += 1) {
      b.frame(FRAME.bird[i], BIRD_TEX_W, BIRD_TEX_H, (ctx) => drawOwl(ctx, i));
    }
    b.frame(FRAME.pipeBody, PIPE_BODY_W, PIPE_BODY_H, (ctx, w, h) => {
      hGradient(ctx, 0, -40, w, h + 80, [
        [0, ICE_D],
        [0.15, ICE],
        [0.4, '#f4faff'],
        [0.6, ICE],
        [0.85, ICE_D],
        [1, '#5a90d8'],
      ]);
      ctx.fillStyle = rgba('#ffffff', 0.55);
      ctx.fillRect(30, -40, 6, h + 80);
      withGlow(ctx, ICE_EDGE, 12, () => {
        ctx.fillStyle = ICE_EDGE;
        ctx.fillRect(0, -40, 3, h + 80);
        ctx.fillRect(w - 3, -40, 3, h + 80);
      });
    });
    b.frame(FRAME.pipeCap, PIPE_CAP_W, PIPE_CAP_H, (ctx, w, h) => {
      fillRoundedRect(ctx, 0, 0, w, h, 10, ICE);
      vGradient(ctx, 2, 2, w - 4, 16, [
        [0, rgba('#ffffff', 0.75)],
        [1, rgba('#ffffff', 0)],
      ]);
      triangle(ctx, 14, h - 6, 30, 10, 42, h - 6, rgba('#ffffff', 0.35));
      triangle(ctx, 56, h - 6, 66, 14, 84, h - 6, rgba('#ffffff', 0.25));
      withGlow(ctx, ICE_EDGE, 10, () => {
        roundedRect(ctx, 1, 1, w - 2, h - 2, 10);
        ctx.strokeStyle = rgba(ICE_EDGE, 0.85);
        ctx.lineWidth = 2;
        ctx.stroke();
      });
    });
  },

  drawBackdrops(d) {
    d.sky((ctx) => {
      vGradient(ctx, 0, 0, WORLD_W, WORLD_H, [
        [0, NIGHT],
        [0.65, '#101a44'],
        [1, HORIZON],
      ]);
      starField(ctx, WORLD_W, 820, 150, 21, ['#ffffff', '#dfe8ff'], 1.4);
      withGlow(ctx, rgba(GREEN, 0.9), 50, () => wavyBand(ctx, -50, WORLD_W + 50, 320, 60, 900, 90, 0.5, rgba(GREEN, 0.35)));
      withGlow(ctx, rgba(VIOLET, 0.9), 50, () => wavyBand(ctx, -50, WORLD_W + 50, 250, 40, 700, 60, 2.1, rgba(VIOLET, 0.3)));
      withGlow(ctx, rgba(GREEN, 0.8), 40, () => wavyBand(ctx, -50, WORLD_W + 50, 180, 30, 1100, 40, 4, rgba(GREEN, 0.22)));
      bakedHalo(ctx, 1500, 220, 58, 'rgba(255,255,255,0.95)', 40);
      circle(ctx, 1480, 205, 9, 'rgba(0,0,0,0.07)');
      circle(ctx, 1515, 240, 12, 'rgba(0,0,0,0.07)');
    });
    d.layer('far', 400, (ctx, w) => {
      withGlow(ctx, rgba(GREEN, 0.7), 40, () => wavyBand(ctx, 0, w, 200, 50, w / 2, 70, 0, rgba(GREEN, 0.18)));
    });
    d.layer('mid', 400, (ctx, w, h) => {
      mountainRange(ctx, w, h, 41, 120, 330, 10, MOUNT_BACK);
      const g = ctx.createLinearGradient(0, h - 330, 0, h);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.25, MOUNT);
      g.addColorStop(1, MOUNT_D);
      mountainRange(ctx, w, h, 42, 60, 280, 8, g);
    });
    d.layer('near', 160, (ctx, w, h) => {
      wrapX(ctx, w, () => {
        const r = rng(6);
        for (let i = 0; i < 22; i += 1) {
          pine(ctx, r() * w, h + 6, 60 + r() * 90);
        }
      });
    });
    d.ground((ctx) => {
      vGradient(ctx, 0, 0, GROUND_W, GROUND_H, [
        [0, SNOW],
        [0.25, '#d8e4f8'],
        [1, SNOW_D],
      ]);
      noiseDots(ctx, 0, 6, GROUND_W, 60, 40, 'rgba(255,255,255,0.85)', 12, 2);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, GROUND_W, 3);
    });
  },
};
