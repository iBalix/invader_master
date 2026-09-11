/**
 * Thème Pixel : hommage au Flappy classique. Ciel de jour, nuages blancs en
 * blocs, tuyaux verts cerclés de sombre, sol beige. Tout est dessiné à
 * basse résolution puis agrandi sans lissage (NEAREST côté Phaser). Le ciel
 * vire au crépuscule à chaque palier de 100 m.
 */

import type { FlapTheme } from './types';
import { BIRD_TEX_H, BIRD_TEX_W, FRAME, GROUND_H, GROUND_W, PIPE_BODY_H, PIPE_BODY_W, PIPE_CAP_H, PIPE_CAP_W, WORLD_H, WORLD_W } from './types';
import { pixelEllipse, pixelate, rng } from './draw';

const SKY_TOP = '#4ec0ca';
const SKY_BOT = '#ded895';
const GREEN = '#73bf2e';
const GREEN_L = '#9be04a';
const GREEN_D = '#4f8f1e';
const OUTLINE = '#2e5c0e';
const TAN = '#ded895';
const TAN_D = '#d0c880';
const YELLOW = '#f8e040';
const ORANGE = '#f0a020';
const RED = '#e0553a';
const INK = '#4a3520';
const TREE = '#9de35b';
const TREE_D = '#6fa83c';
const BUSH = '#5fb03a';

/** oiseau 17x12 en pixels (agrandi x8 dans une case 136x96) */
function drawBird(ctx: CanvasRenderingContext2D, wing: number): void {
  pixelate(ctx, BIRD_TEX_W, BIRD_TEX_H, 8, (lc) => {
    pixelEllipse(lc, 8.5, 6.5, 6.2, 4.6, YELLOW, INK);
    pixelEllipse(lc, 8.5, 8.6, 3.4, 1.4, '#fff0a0');
    const wy = [4.4, 6.5, 8.6][wing];
    pixelEllipse(lc, 4.6, wy, 3.1, 1.6, '#f4f4f4', INK);
    // œil
    lc.fillStyle = INK;
    lc.fillRect(9, 2, 5, 4);
    lc.fillStyle = '#ffffff';
    lc.fillRect(10, 3, 3, 2);
    lc.fillStyle = INK;
    lc.fillRect(12, 3, 1, 2);
    // bec
    lc.fillStyle = INK;
    lc.fillRect(12, 5, 5, 4);
    lc.fillStyle = ORANGE;
    lc.fillRect(13, 6, 3, 1);
    lc.fillStyle = RED;
    lc.fillRect(13, 7, 3, 1);
  });
}

export const pixelTheme: FlapTheme = {
  id: 'pixel',
  label: 'Pixel',
  palette: {
    sky: SKY_TOP,
    skyBottom: SKY_BOT,
    accent: '#ffffff',
    accent2: ORANGE,
    pipe: GREEN,
    pipeEdge: OUTLINE,
    bird: YELLOW,
    text: '#ffffff',
    hudBg: 'rgba(30,60,60,0.6)',
  },
  pixel: true,
  layers: [
    { key: 'far', speed: 0.08, y: 200, height: 300 },
    { key: 'mid', speed: 0.15, y: 760, height: 200 },
    { key: 'near', speed: 0.45, y: 900, height: 60 },
  ],
  ambient: { kind: 'none', count: 0, tint: '#ffffff' },
  trail: null,
  milestoneTints: ['#f2dcf6', '#e0c0ec', '#c8a2dc', '#a882c4', '#8a68ac'],

  drawAtlas(b) {
    for (let i = 0; i < 3; i += 1) {
      b.frame(FRAME.bird[i], BIRD_TEX_W, BIRD_TEX_H, (ctx) => drawBird(ctx, i));
    }
    b.frame(FRAME.pipeBody, PIPE_BODY_W, PIPE_BODY_H, (ctx, w, h) => {
      pixelate(ctx, w, h, 4, (lc, lw, lh) => {
        lc.fillStyle = GREEN;
        lc.fillRect(0, 0, lw, lh);
        lc.fillStyle = GREEN_L;
        lc.fillRect(2, 0, 3, lh);
        lc.fillStyle = GREEN_D;
        lc.fillRect(lw - 5, 0, 3, lh);
        lc.fillStyle = OUTLINE;
        lc.fillRect(0, 0, 1, lh);
        lc.fillRect(lw - 1, 0, 1, lh);
      });
    });
    b.frame(FRAME.pipeCap, PIPE_CAP_W, PIPE_CAP_H, (ctx, w, h) => {
      pixelate(ctx, w, h, 4, (lc, lw, lh) => {
        lc.fillStyle = OUTLINE;
        lc.fillRect(0, 0, lw, lh);
        lc.fillStyle = GREEN;
        lc.fillRect(1, 1, lw - 2, lh - 2);
        lc.fillStyle = GREEN_L;
        lc.fillRect(2, 1, 3, lh - 2);
        lc.fillStyle = GREEN_D;
        lc.fillRect(lw - 5, 1, 3, lh - 2);
      });
    });
  },

  drawBackdrops(d) {
    d.sky((ctx) => {
      pixelate(ctx, WORLD_W, WORLD_H, 4, (lc, lw, lh) => {
        const steps = 12;
        for (let i = 0; i < steps; i += 1) {
          const t = i / (steps - 1);
          const c0 = [0x4e, 0xc0, 0xca];
          const c1 = [0xde, 0xd8, 0x95];
          const r = Math.round(c0[0] + (c1[0] - c0[0]) * t);
          const g = Math.round(c0[1] + (c1[1] - c0[1]) * t);
          const bl = Math.round(c0[2] + (c1[2] - c0[2]) * t);
          lc.fillStyle = `rgb(${r},${g},${bl})`;
          lc.fillRect(0, Math.floor((i * lh) / steps), lw, Math.ceil(lh / steps) + 1);
        }
        pixelEllipse(lc, 380, 58, 22, 22, '#fff6b0', '#f8e890');
      });
    });
    d.layer('far', 300, (ctx, w, h) => {
      pixelate(ctx, w, h, 4, (lc, lw) => {
        const r = rng(3);
        for (let i = 0; i < 6; i += 1) {
          const x = r() * lw;
          const y = 12 + r() * 40;
          const size = 10 + r() * 14;
          for (const dx of [-lw, 0, lw]) {
            pixelEllipse(lc, x + dx, y + 4, size * 1.6, size * 0.55, '#ffffff', '#dfe8ea');
            pixelEllipse(lc, x + dx - size * 0.5, y, size * 0.7, size * 0.6, '#ffffff', '#dfe8ea');
            pixelEllipse(lc, x + dx + size * 0.5, y + 1, size * 0.6, size * 0.5, '#ffffff', '#dfe8ea');
            pixelEllipse(lc, x + dx, y + 5, size * 1.5, size * 0.45, '#ffffff');
          }
        }
      });
    });
    d.layer('mid', 200, (ctx, w, h) => {
      pixelate(ctx, w, h, 4, (lc, lw, lh) => {
        const r = rng(9);
        let x = 0;
        while (x < lw) {
          const bw = 6 + Math.floor(r() * 14);
          const bh = 8 + Math.floor(r() * 30);
          for (const dx of [0, -lw]) {
            lc.fillStyle = TREE;
            lc.fillRect(x + dx, lh - bh, bw, bh);
            lc.fillStyle = TREE_D;
            lc.fillRect(x + dx, lh - bh, bw, 1);
            lc.fillRect(x + dx + bw - 1, lh - bh, 1, bh);
          }
          x += bw + 1 + Math.floor(r() * 3);
          if (r() < 0.4) {
            const tr = 3 + Math.floor(r() * 4);
            for (const dx of [0, -lw]) pixelEllipse(lc, x + dx + tr, lh - tr - 2, tr, tr + 1, TREE, TREE_D);
            x += tr * 2 + 1;
          }
        }
      });
    });
    d.layer('near', 60, (ctx, w, h) => {
      pixelate(ctx, w, h, 4, (lc, lw, lh) => {
        const r = rng(2);
        for (let x = 0; x < lw; x += 10 + r() * 8) {
          const rr = 5 + r() * 6;
          for (const dx of [-lw, 0, lw]) pixelEllipse(lc, x + dx, lh + 1, rr, rr, BUSH, GREEN_D);
        }
      });
    });
    d.ground((ctx) => {
      pixelate(ctx, GROUND_W, GROUND_H, 4, (lc, lw, lh) => {
        lc.fillStyle = TAN;
        lc.fillRect(0, 0, lw, lh);
        lc.fillStyle = TAN_D;
        for (let y = 4; y < lh; y += 1) {
          for (let x = 0; x < lw; x += 1) {
            if ((x + y) % 8 < 3) lc.fillRect(x, y, 1, 1);
          }
        }
        lc.fillStyle = GREEN;
        lc.fillRect(0, 0, lw, 3);
        lc.fillStyle = OUTLINE;
        lc.fillRect(0, 3, lw, 1);
      });
    });
  },
};
