/**
 * Particules neon flottantes (canvas, optimise pour mini-PC).
 *
 * Optimisations :
 *   - PAS de shadowBlur (re-blur GPU a chaque frame = catastrophique).
 *     A la place on dessine un sprite cache (gradient radial pre-rendu)
 *     une fois par couleur, puis drawImage() = ultra rapide.
 *   - PAS de globalCompositeOperation = 'lighter' (blend mode coûteux).
 *   - Throttle a ~30 FPS au lieu de 60 (suffit largement, 50% CPU economise).
 *   - Pause quand l'onglet/page n'est pas visible (visibilitychange).
 *   - Auto-disable si usePerfMode().reduced (low-end device ou
 *     prefers-reduced-motion ou ?perf=lite).
 *   - Nombre de particules reduit (default 35 au lieu de 90).
 *   - DPR plafonne a 1 (les particules n'ont pas besoin de retina).
 */

import { useEffect, useRef } from 'react';
import { usePerfMode } from '../../hooks/usePerfMode';

type Particle = {
  x: number;
  y: number;
  r: number;
  vx: number;
  vy: number;
  spriteIdx: number;
  baseOpacity: number;
  twinkleOffset: number;
  twinkleSpeed: number;
};

const COLORS = [
  '#A664FF', // violet soft
  '#FF2BD6', // magenta
  '#33E2FF', // cyan
  '#FFFFFF', // blanc
];

/** taille du sprite radial cache (px) - plus grand = plus de halo, plus lourd */
const SPRITE_SIZE = 32;
/** ~30 FPS */
const FRAME_INTERVAL = 1000 / 30;

interface ParticlesBackgroundProps {
  count?: number;
  className?: string;
}

/** Pre-cache un canvas off-screen par couleur (gradient radial blanc->transparent). */
function makeSprites(): HTMLCanvasElement[] {
  return COLORS.map((color) => {
    const c = document.createElement('canvas');
    c.width = SPRITE_SIZE;
    c.height = SPRITE_SIZE;
    const ctx = c.getContext('2d')!;
    const center = SPRITE_SIZE / 2;
    const grad = ctx.createRadialGradient(center, center, 0, center, center, center);
    grad.addColorStop(0, color);
    grad.addColorStop(0.4, `${color}80`);
    grad.addColorStop(1, `${color}00`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, SPRITE_SIZE, SPRITE_SIZE);
    return c;
  });
}

export default function ParticlesBackground({
  count = 35,
  className = '',
}: ParticlesBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const perf = usePerfMode();

  useEffect(() => {
    if (perf.reduced) return; // skip total
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    let width = 0;
    let height = 0;
    const dpr = 1;
    let particles: Particle[] = [];
    let rafId = 0;
    let lastFrame = 0;
    let running = true;
    const startTime = performance.now();

    const sprites = makeSprites();

    function resize() {
      const parent = canvas!.parentElement;
      if (!parent) return;
      width = parent.clientWidth;
      height = parent.clientHeight;
      canvas!.width = Math.floor(width * dpr);
      canvas!.height = Math.floor(height * dpr);
      canvas!.style.width = `${width}px`;
      canvas!.style.height = `${height}px`;
    }

    function pickSprite(): number {
      const r = Math.random();
      if (r < 0.15) return 3; // blanc
      if (r < 0.45) return 2; // cyan
      if (r < 0.7) return 1; // magenta
      return 0; // violet
    }

    function spawn(initial = false): Particle {
      const radius = 4 + Math.random() * 10; // taille du sprite a dessiner
      return {
        x: Math.random() * width,
        y: initial ? Math.random() * height : height + Math.random() * 40,
        r: radius,
        vx: (Math.random() - 0.5) * 0.1,
        vy: -(0.06 + Math.random() * 0.25),
        spriteIdx: pickSprite(),
        baseOpacity: 0.35 + Math.random() * 0.45,
        twinkleOffset: Math.random() * Math.PI * 2,
        twinkleSpeed: 0.5 + Math.random() * 1.4,
      };
    }

    function init() {
      resize();
      particles = Array.from({ length: count }, () => spawn(true));
    }

    function step(now: number) {
      if (!running) return;
      // throttle ~30 fps
      if (now - lastFrame < FRAME_INTERVAL) {
        rafId = requestAnimationFrame(step);
        return;
      }
      lastFrame = now;

      const elapsed = (now - startTime) / 1000;
      ctx!.clearRect(0, 0, width, height);

      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;

        if (p.y < -SPRITE_SIZE) {
          Object.assign(p, spawn(false));
        }
        if (p.x < -SPRITE_SIZE) p.x = width + SPRITE_SIZE;
        if (p.x > width + SPRITE_SIZE) p.x = -SPRITE_SIZE;

        const twinkle =
          0.55 + 0.45 * Math.sin(elapsed * p.twinkleSpeed + p.twinkleOffset);
        const opacity = Math.max(0.1, Math.min(1, p.baseOpacity * twinkle));

        ctx!.globalAlpha = opacity;
        const size = p.r * 2;
        ctx!.drawImage(sprites[p.spriteIdx], p.x - p.r, p.y - p.r, size, size);
      }
      ctx!.globalAlpha = 1;

      rafId = requestAnimationFrame(step);
    }

    function onVisibility() {
      if (document.hidden) {
        running = false;
        cancelAnimationFrame(rafId);
      } else if (!running) {
        running = true;
        lastFrame = performance.now();
        rafId = requestAnimationFrame(step);
      }
    }

    init();
    rafId = requestAnimationFrame(step);

    const onResize = () => init();
    window.addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      running = false;
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [count, perf.reduced]);

  if (perf.reduced) return null;

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className={`pointer-events-none absolute inset-0 ${className}`}
    />
  );
}
