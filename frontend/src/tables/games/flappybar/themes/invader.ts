/**
 * Thème Invader : espace. Ciel bleu-noir, planète annelée, pluie d'étoiles
 * lointaine, bandes de nébuleuse, astéroïdes en silhouette. Les tuyaux sont
 * des portes laser (émetteurs + faisceau translucide), l'oiseau un petit
 * vaisseau à la flamme animée.
 */

import type { FlapTheme } from './types';
import { BIRD_TEX_H, BIRD_TEX_W, FRAME, GROUND_H, GROUND_W, PIPE_BODY_H, PIPE_BODY_W, PIPE_CAP_H, PIPE_CAP_W, WORLD_H, WORLD_W } from './types';
import { circle, ellipse, fillRoundedRect, hGradient, radialGlow, rgba, rng, starField, triangle, vGradient, wavyBand, withGlow, wrapX } from './draw';

const SKY = '#02030f';
const SKY_BOT = '#0a1a3a';
const CYAN = '#33e2ff';
const RED = '#ff3b5c';
const HULL = '#c8f6ff';
const HULL_D = '#6f8fb8';
const METAL = '#1c2540';
const METAL_L = '#34456e';
const NEBULA_V = 'rgba(120,80,255,0.16)';
const NEBULA_R = 'rgba(255,60,120,0.10)';
const ROCK = '#0b1226';
const ROCK_L = '#182440';

function drawShip(ctx: CanvasRenderingContext2D, wing: number): void {
  const cy = 48;
  const flame = [26, 40, 32][wing];
  withGlow(ctx, rgba(CYAN, 0.9), 16, () => triangle(ctx, 32, cy - 9, 32 - flame, cy, 32, cy + 9, CYAN));
  triangle(ctx, 32, cy - 4, 32 - flame * 0.55, cy, 32, cy + 4, '#ffffff');
  // ailerons
  triangle(ctx, 40, cy - 12, 24, cy - 32, 62, cy - 12, RED);
  triangle(ctx, 40, cy + 12, 24, cy + 32, 62, cy + 12, RED);
  // coque
  const g = ctx.createLinearGradient(0, cy - 18, 0, cy + 18);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.45, HULL);
  g.addColorStop(1, HULL_D);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(122, cy);
  ctx.quadraticCurveTo(96, cy - 20, 36, cy - 17);
  ctx.lineTo(36, cy + 17);
  ctx.quadraticCurveTo(96, cy + 20, 122, cy);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = rgba('#ffffff', 0.35);
  ctx.lineWidth = 2;
  ctx.stroke();
  // bande rouge + cockpit
  ctx.fillStyle = rgba(RED, 0.85);
  ctx.fillRect(44, cy - 3, 46, 6);
  withGlow(ctx, rgba(CYAN, 0.9), 10, () => ellipse(ctx, 82, cy - 5, 15, 8, CYAN));
  ellipse(ctx, 86, cy - 7, 6, 3, rgba('#ffffff', 0.7));
}

function asteroid(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, r: () => number): void {
  const n = 7;
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < n; i += 1) {
    const a = (i / n) * Math.PI * 2;
    const rr = radius * (0.7 + r() * 0.35);
    pts.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr]);
  }
  ctx.fillStyle = ROCK;
  ctx.beginPath();
  pts.forEach(([px, py], i) => (i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)));
  ctx.closePath();
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.fillStyle = ROCK_L;
  ctx.beginPath();
  ctx.arc(x - radius * 0.35, y - radius * 0.4, radius * 0.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export const invaderTheme: FlapTheme = {
  id: 'invader',
  label: 'Invader',
  palette: {
    sky: SKY,
    skyBottom: SKY_BOT,
    accent: CYAN,
    accent2: RED,
    pipe: METAL,
    pipeEdge: RED,
    bird: HULL,
    text: '#ffffff',
    hudBg: 'rgba(4,8,24,0.72)',
  },
  pixel: false,
  layers: [
    { key: 'far', speed: 0.03, y: 0, height: 900 },
    { key: 'mid', speed: 0.15, y: 200, height: 500 },
    { key: 'near', speed: 0.45, y: 780, height: 180 },
  ],
  ambient: { kind: 'stars', count: 40, tint: '#ffffff' },
  trail: { count: 30, tint: CYAN },
  milestoneTints: ['#dcefff', '#bfe0ff', '#a2ccff', '#88b4ff'],

  drawAtlas(b) {
    for (let i = 0; i < 3; i += 1) {
      b.frame(FRAME.bird[i], BIRD_TEX_W, BIRD_TEX_H, (ctx) => drawShip(ctx, i));
    }
    b.frame(FRAME.pipeBody, PIPE_BODY_W, PIPE_BODY_H, (ctx, w, h) => {
      hGradient(ctx, 0, -40, w, h + 80, [
        [0, rgba(RED, 0.05)],
        [0.2, rgba(RED, 0.35)],
        [0.5, rgba(RED, 0.85)],
        [0.8, rgba(RED, 0.35)],
        [1, rgba(RED, 0.05)],
      ]);
      withGlow(ctx, RED, 18, () => {
        ctx.fillStyle = '#ffd0d8';
        ctx.fillRect(36, -40, 8, h + 80);
      });
      ctx.fillStyle = rgba('#ffffff', 0.25);
      ctx.fillRect(0, -40, 2, h + 80);
      ctx.fillRect(w - 2, -40, 2, h + 80);
    });
    b.frame(FRAME.pipeCap, PIPE_CAP_W, PIPE_CAP_H, (ctx, w, h) => {
      fillRoundedRect(ctx, 0, 0, w, h, 6, METAL);
      ctx.fillStyle = METAL_L;
      ctx.fillRect(4, h - 14, w - 8, 10);
      withGlow(ctx, RED, 14, () => {
        ctx.fillStyle = RED;
        ctx.fillRect(8, 2, w - 16, 7);
      });
      circle(ctx, 12, h - 9, 3, '#8aa0c8');
      circle(ctx, w - 12, h - 9, 3, '#8aa0c8');
      ctx.fillStyle = rgba('#ffffff', 0.12);
      ctx.fillRect(2, 12, w - 4, 3);
    });
  },

  drawBackdrops(d) {
    d.sky((ctx) => {
      vGradient(ctx, 0, 0, WORLD_W, WORLD_H, [
        [0, SKY],
        [0.7, '#061028'],
        [1, SKY_BOT],
      ]);
      radialGlow(ctx, 500, 320, 460, NEBULA_V);
      radialGlow(ctx, 1250, 760, 400, NEBULA_R);
      starField(ctx, WORLD_W, WORLD_H, 220, 3, ['#ffffff', '#cfe8ff', '#ffd8e8'], 1.3);
      // planète annelée
      const px = 1450;
      const py = 260;
      const pr = 130;
      const ring = (front: boolean) => {
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(-0.35);
        ctx.strokeStyle = rgba('#c8d8ff', 0.55);
        ctx.lineWidth = 26;
        ctx.beginPath();
        if (front) ctx.ellipse(0, 0, 235, 54, 0, 0, Math.PI);
        else ctx.ellipse(0, 0, 235, 54, 0, Math.PI, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      };
      ring(false);
      const g = ctx.createRadialGradient(px - 50, py - 50, 10, px, py, pr);
      g.addColorStop(0, '#8fdcff');
      g.addColorStop(0.55, '#1f4a94');
      g.addColorStop(1, '#060c22');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(px, py, pr, 0, Math.PI * 2);
      ctx.fill();
      ctx.save();
      ctx.beginPath();
      ctx.arc(px, py, pr, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fillRect(px - pr, py - 40, pr * 2, 18);
      ctx.fillRect(px - pr, py + 10, pr * 2, 26);
      ctx.fillRect(px - pr, py + 60, pr * 2, 12);
      ctx.restore();
      ring(true);
    });
    d.layer('far', 900, (ctx, w, h) => {
      wrapX(ctx, w, () => {
        const r = rng(31);
        ctx.strokeStyle = 'rgba(255,255,255,0.16)';
        ctx.lineWidth = 2;
        for (let i = 0; i < 40; i += 1) {
          const x = r() * w;
          const y = r() * h;
          const len = 20 + r() * 50;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + len, y);
          ctx.stroke();
        }
        starField(ctx, w, h, 90, 32, ['#ffffff', '#a8c8ff'], 1.1);
      });
    });
    d.layer('mid', 500, (ctx, w) => {
      withGlow(ctx, 'rgba(120,80,255,0.5)', 60, () => {
        wavyBand(ctx, 0, w, 220, 50, w / 2, 130, 0, NEBULA_V);
        wavyBand(ctx, 0, w, 330, 40, w / 2, 90, 2.4, NEBULA_R);
      });
    });
    d.layer('near', 180, (ctx, w, h) => {
      wrapX(ctx, w, () => {
        const r = rng(17);
        for (let i = 0; i < 9; i += 1) {
          asteroid(ctx, r() * w, h - 30 - r() * 60, 22 + r() * 40, r);
        }
      });
    });
    d.ground((ctx) => {
      vGradient(ctx, 0, 0, GROUND_W, GROUND_H, [
        [0, '#141f3a'],
        [0.1, '#0e162c'],
        [1, '#050914'],
      ]);
      ctx.fillStyle = '#2a3a60';
      ctx.fillRect(0, 0, GROUND_W, 4);
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      for (let x = 0; x < GROUND_W; x += 128) ctx.fillRect(x, 0, 2, GROUND_H);
      for (let x = 64; x < GROUND_W; x += 128) {
        withGlow(ctx, RED, 12, () => circle(ctx, x, 16, 4, RED));
      }
    });
  },
};
