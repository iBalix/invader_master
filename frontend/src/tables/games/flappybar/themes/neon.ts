/**
 * Thème Néon (défaut) : hommage au "Flappy Neon" historique du bar. Nuit
 * violette étoilée, soleil synthwave strié, skyline pixel aux fenêtres
 * allumées, sol violet quadrillé cyan. Tuyaux sombres au cœur cyan, oiseau
 * rose à l'œil cyan.
 */

import type { FlapTheme } from './types';
import { BIRD_TEX_H, BIRD_TEX_W, FRAME, GROUND_H, GROUND_W, PIPE_BODY_H, PIPE_BODY_W, PIPE_CAP_H, PIPE_CAP_W, WORLD_H, WORLD_W } from './types';
import { bakedHalo, circle, ellipse, fillRoundedRect, hGradient, pixelGrid, radialGlow, rgba, rng, skylineSilhouette, starField, stripedSun, triangle, vGradient, withGlow, wrapX } from './draw';

const SKY = '#2a0e4a';
const SKY_BOTTOM = '#0b0520';
const CYAN = '#00e5ff';
const MAGENTA = '#ff3ea5';
const ORANGE = '#ff8a3d';
const PINK = '#ff5fb0';
const YELLOW = '#ffd23f';
const PIPE = '#1a0b33';
const SKYLINE = '#3a1466';
const BUSH = '#1b0838';

function drawBird(ctx: CanvasRenderingContext2D, wing: number): void {
  const cx = 62;
  const cy = 50;
  const r = 34;
  bakedHalo(ctx, cx, cy, r - 2, rgba(PINK, 0.35), 22);
  // queue
  triangle(ctx, cx - r + 6, cy - 4, cx - r - 22, cy - 20, cx - r - 8, cy + 4, MAGENTA);
  triangle(ctx, cx - r + 6, cy + 6, cx - r - 20, cy + 16, cx - r - 4, cy + 16, MAGENTA);
  // corps
  const g = ctx.createRadialGradient(cx - 10, cy - 12, 6, cx, cy, r);
  g.addColorStop(0, '#ff9ad0');
  g.addColorStop(1, PINK);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ellipse(ctx, cx + 4, cy + 12, 20, 13, rgba('#ffffff', 0.18));
  // aile (3 positions)
  const wy = [cy - 16, cy + 2, cy + 18][wing];
  const rot = [-0.55, -0.15, 0.35][wing];
  withGlow(ctx, rgba(MAGENTA, 0.8), 10, () => ellipse(ctx, cx - 10, wy, 22, 11, MAGENTA, rot));
  ellipse(ctx, cx - 12, wy - 2, 13, 5, rgba('#ffffff', 0.25), rot);
  // œil cerclé de cyan
  withGlow(ctx, rgba(CYAN, 0.9), 8, () => circle(ctx, cx + 14, cy - 10, 11, CYAN));
  circle(ctx, cx + 14, cy - 10, 8, '#ffffff');
  circle(ctx, cx + 17, cy - 10, 4, PIPE);
  // bec
  triangle(ctx, cx + 24, cy + 2, cx + 48, cy + 9, cx + 24, cy + 17, YELLOW);
  ctx.fillStyle = rgba('#000000', 0.25);
  ctx.fillRect(cx + 26, cy + 9, 18, 2);
}

export const neonTheme: FlapTheme = {
  id: 'neon',
  label: 'Néon',
  palette: {
    sky: SKY,
    skyBottom: SKY_BOTTOM,
    accent: CYAN,
    accent2: MAGENTA,
    pipe: PIPE,
    pipeEdge: CYAN,
    bird: PINK,
    text: '#ffffff',
    hudBg: 'rgba(12,5,36,0.72)',
  },
  pixel: false,
  layers: [
    { key: 'far', speed: 0.08, y: 300, height: 320 },
    { key: 'mid', speed: 0.15, y: 560, height: 400 },
    { key: 'near', speed: 0.45, y: 860, height: 100 },
  ],
  ambient: { kind: 'sparks', count: 24, tint: MAGENTA },
  trail: { count: 30, tint: MAGENTA },
  milestoneTints: ['#eadcff', '#d6c4ff', '#c2acff', '#ae94ff'],

  drawAtlas(b) {
    for (let i = 0; i < 3; i += 1) {
      b.frame(FRAME.bird[i], BIRD_TEX_W, BIRD_TEX_H, (ctx) => drawBird(ctx, i));
    }
    b.frame(FRAME.pipeBody, PIPE_BODY_W, PIPE_BODY_H, (ctx, w, h) => {
      hGradient(ctx, 0, -40, w, h + 80, [
        [0, '#100622'],
        [0.18, '#2a1550'],
        [0.3, '#33185e'],
        [0.55, PIPE],
        [1, '#0c0418'],
      ]);
      withGlow(ctx, CYAN, 14, () => {
        ctx.fillStyle = rgba(CYAN, 0.9);
        ctx.fillRect(24, -40, 6, h + 80);
      });
      withGlow(ctx, CYAN, 8, () => {
        ctx.fillStyle = rgba(CYAN, 0.7);
        ctx.fillRect(0, -40, 3, h + 80);
        ctx.fillRect(w - 3, -40, 3, h + 80);
      });
    });
    b.frame(FRAME.pipeCap, PIPE_CAP_W, PIPE_CAP_H, (ctx, w, h) => {
      withGlow(ctx, MAGENTA, 12, () => fillRoundedRect(ctx, 0, 0, w, h, 8, MAGENTA));
      ctx.fillStyle = '#c8207a';
      ctx.fillRect(6, 12, w - 12, h - 20);
      ctx.fillStyle = rgba('#ffffff', 0.35);
      ctx.fillRect(6, 4, w - 12, 4);
      ctx.fillStyle = rgba(CYAN, 0.8);
      ctx.fillRect(2, 6, 2, h - 12);
      ctx.fillRect(w - 4, 6, 2, h - 12);
    });
  },

  drawBackdrops(d) {
    d.sky((ctx) => {
      vGradient(ctx, 0, 0, WORLD_W, WORLD_H, [
        [0, SKY],
        [0.6, '#160a33'],
        [1, SKY_BOTTOM],
      ]);
      starField(ctx, WORLD_W, 720, 120, 7, ['#ffffff', '#ffd6f2', '#b8f6ff'], 1.5);
      bakedHalo(ctx, 1400, 300, 250, rgba(MAGENTA, 0.22), 90);
      stripedSun(ctx, 1400, 300, 260, ORANGE, MAGENTA, 6, rgba(SKY_BOTTOM, 0.9));
      radialGlow(ctx, 960, 1000, 900, rgba(MAGENTA, 0.26));
    });
    d.layer('far', 320, (ctx, w) => {
      wrapX(ctx, w, () => {
        const r = rng(11);
        for (let i = 0; i < 7; i += 1) {
          const x = r() * w;
          const y = 70 + r() * 190;
          withGlow(ctx, rgba(MAGENTA, 0.5), 30, () => {
            for (let k = 0; k < 4; k += 1) {
              ellipse(ctx, x + (k - 1.5) * 55, y + (k % 2) * 12, 60 + r() * 50, 20 + r() * 18, rgba('#ff7ac8', 0.26));
            }
          });
        }
      });
    });
    d.layer('mid', 400, (ctx, w, h) => {
      skylineSilhouette(ctx, w, h, 23, SKYLINE, [YELLOW, CYAN], {
        minW: 56,
        maxW: 170,
        minH: 110,
        maxH: 360,
        window: 8,
        density: 0.35,
      });
    });
    d.layer('near', 100, (ctx, w, h) => {
      wrapX(ctx, w, () => {
        const r = rng(5);
        for (let x = 0; x < w; x += 60 + r() * 40) {
          circle(ctx, x, h + 10, 36 + r() * 30, BUSH);
        }
      });
    });
    d.ground((ctx) => {
      vGradient(ctx, 0, 0, GROUND_W, GROUND_H, [
        [0, '#2a0e4a'],
        [1, '#12062a'],
      ]);
      pixelGrid(ctx, 0, 0, GROUND_W, GROUND_H, 64, [10, 26, 48, 78, 114], rgba(CYAN, 0.28), 2);
      withGlow(ctx, CYAN, 10, () => {
        ctx.fillStyle = CYAN;
        ctx.fillRect(0, 0, GROUND_W, 3);
      });
    });
  },
};

