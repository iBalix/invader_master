/**
 * Aperçu 16:9 d'un thème, peint avec les générateurs du thème lui-même
 * (ciel, décor, sol, une paire de tuyaux, l'oiseau) : ce que le lobby montre
 * est exactement ce que la scène dessinera. Rendu une fois en pleine
 * résolution puis réduit et mis en cache par thème (module).
 */

import { useEffect, useRef } from 'react';
import { SIM } from '../sim/flapSim';
import { getFlapTheme } from '../themes';
import type { DrawFn, LayerKey } from '../themes/types';
import {
  BIRD_TEX_H,
  BIRD_TEX_W,
  FRAME,
  GROUND_H,
  GROUND_W,
  GROUND_Y,
  PIPE_BODY_H,
  PIPE_BODY_W,
  PIPE_CAP_H,
  PIPE_CAP_W,
  TILE_W,
  WORLD_H,
  WORLD_W,
} from '../themes/types';

const CACHE_W = 480;
const CACHE_H = 270;
const cache = new Map<string, HTMLCanvasElement>();

interface Frame {
  w: number;
  h: number;
  draw: DrawFn;
}

function renderTheme(themeId: string): HTMLCanvasElement | null {
  const theme = getFlapTheme(themeId);
  const cached = cache.get(theme.id);
  if (cached) return cached;

  const frames = new Map<string, Frame>();
  theme.drawAtlas({
    frame: (name, w, h, draw) => {
      frames.set(name, { w, h, draw });
    },
  });
  let sky: DrawFn | null = null;
  let ground: DrawFn | null = null;
  const layers = new Map<LayerKey, { height: number; draw: DrawFn }>();
  theme.drawBackdrops({
    sky: (draw) => {
      sky = draw;
    },
    layer: (key, height, draw) => {
      layers.set(key, { height, draw });
    },
    ground: (draw) => {
      ground = draw;
    },
  });

  const full = document.createElement('canvas');
  full.width = WORLD_W;
  full.height = WORLD_H;
  const ctx = full.getContext('2d');
  if (!ctx) return null;
  const paint = (x: number, y: number, w: number, h: number, draw: DrawFn, sx = 1, sy = 1) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(sx, sy);
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    ctx.clip();
    draw(ctx, w, h);
    ctx.restore();
  };

  const skyDraw: DrawFn | null = sky;
  if (skyDraw) paint(0, 0, WORLD_W, WORLD_H, skyDraw);
  for (const layer of theme.layers) {
    const entry = layers.get(layer.key);
    if (!entry) continue;
    for (let x = 0; x < WORLD_W; x += TILE_W) paint(x, layer.y, TILE_W, entry.height, entry.draw);
  }
  const groundDraw: DrawFn | null = ground;
  if (groundDraw) {
    for (let x = 0; x < WORLD_W; x += GROUND_W) paint(x, GROUND_Y, GROUND_W, GROUND_H, groundDraw);
  }

  const body = frames.get(FRAME.pipeBody);
  const cap = frames.get(FRAME.pipeCap);
  if (body && cap) {
    const px = 1180;
    const gapTop = 430;
    const gapBottom = 690;
    const overhang = (PIPE_CAP_W - PIPE_BODY_W) / 2;
    paint(px, 0, PIPE_BODY_W, PIPE_BODY_H, body.draw, 1, (gapTop - PIPE_CAP_H) / PIPE_BODY_H);
    paint(px - overhang, gapTop, PIPE_CAP_W, PIPE_CAP_H, cap.draw, 1, -1);
    paint(px - overhang, gapBottom, PIPE_CAP_W, PIPE_CAP_H, cap.draw);
    paint(px, gapBottom + PIPE_CAP_H, PIPE_BODY_W, PIPE_BODY_H, body.draw, 1, (WORLD_H - gapBottom - PIPE_CAP_H) / PIPE_BODY_H);
  }
  const bird = frames.get(FRAME.bird[1]);
  if (bird) {
    paint(
      SIM.BIRD_X - SIM.BIRD_W / 2,
      SIM.BIRD_START_Y - SIM.BIRD_H / 2,
      BIRD_TEX_W,
      BIRD_TEX_H,
      bird.draw,
      SIM.BIRD_W / BIRD_TEX_W,
      SIM.BIRD_H / BIRD_TEX_H,
    );
  }

  const small = document.createElement('canvas');
  small.width = CACHE_W;
  small.height = CACHE_H;
  const sctx = small.getContext('2d');
  if (!sctx) return null;
  sctx.imageSmoothingEnabled = true;
  sctx.imageSmoothingQuality = 'high';
  sctx.drawImage(full, 0, 0, WORLD_W, WORLD_H, 0, 0, CACHE_W, CACHE_H);
  cache.set(theme.id, small);
  return small;
}

interface Props {
  themeId: string;
  width?: number;
  height?: number;
  selected?: boolean;
  className?: string;
}

export default function FlapThemePreview({ themeId, width = 176, height = 99, selected = false, className = '' }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const theme = getFlapTheme(themeId);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const source = renderTheme(themeId);
    if (!source) return;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(source, 0, 0, source.width, source.height, 0, 0, canvas.width, canvas.height);
  }, [themeId, width, height]);

  return (
    <div
      className={`relative overflow-hidden rounded-2xl ${className}`}
      style={{
        width,
        height,
        background: theme.palette.skyBottom,
        boxShadow: selected ? `0 0 0 3px ${theme.palette.accent}` : 'inset 0 0 0 1px rgba(255,255,255,0.14)',
      }}
    >
      <canvas ref={ref} width={width * 2} height={height * 2} style={{ width, height, display: 'block' }} />
    </div>
  );
}
