/**
 * Jet de particules emanant de derriere un bouton de la home, vers l'exterieur.
 *
 *   - direction 'left'  : les particules sortent par la gauche du bouton.
 *   - direction 'right' : par la droite.
 *   - `color` : teinte des particules (alignee sur la couleur du bouton).
 *
 * Le canvas est place DERRIERE le fond opaque du bouton : les particules
 * "naissent" cachees sous le bouton et n'apparaissent qu'en sortant.
 *
 * Perf (kiosk) : ~18 particules, DPR plafonne, trainee = 1 segment, math simple,
 * zero alloc/frame. Une seule boucle rAF. Respecte le mode perf reduit.
 */

import { useEffect, useRef } from 'react';
import { usePerfMode } from '../../hooks/usePerfMode';

interface P {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
}

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [150, 120, 255];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

interface Props {
  direction: 'left' | 'right';
  color: string;
  className?: string;
}

export default function ButtonParticles({ direction, color, className }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const perf = usePerfMode();
  const reduced = perf.reduced;

  useEffect(() => {
    const cvRaw = canvasRef.current;
    if (!cvRaw) return;
    const ctxRaw = cvRaw.getContext('2d');
    if (!ctxRaw) return;
    const el: HTMLCanvasElement = cvRaw;
    const c: CanvasRenderingContext2D = ctxRaw;

    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const [r, g, b] = hexToRgb(color);
    const COUNT = reduced ? 9 : 18;
    let W = 0;
    let H = 0;

    function resize() {
      W = el.clientWidth;
      H = el.clientHeight;
      el.width = Math.max(1, Math.floor(W * dpr));
      el.height = Math.max(1, Math.floor(H * dpr));
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function spawn(p: P) {
      const speed = 0.5 + Math.random() * 1.3;
      const vSpread = (Math.random() - 0.5) * 0.7;
      if (direction === 'left') {
        p.x = W - Math.random() * 12;
        p.vx = -speed;
      } else {
        p.x = Math.random() * 12;
        p.vx = speed;
      }
      p.y = H / 2 + (Math.random() - 0.5) * H * 0.72;
      p.vy = vSpread;
      p.maxLife = 60 + Math.random() * 60;
      p.life = p.maxLife;
      p.size = 1.2 + Math.random() * 2;
    }

    resize();
    const particles: P[] = [];
    for (let i = 0; i < COUNT; i++) {
      const p: P = { x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1, size: 1 };
      spawn(p);
      // vie initiale aleatoire pour desynchroniser
      p.life = Math.random() * p.maxLife;
      particles.push(p);
    }

    let raf = 0;
    const step = () => {
      c.clearRect(0, 0, W, H);
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.vx *= 0.992;
        p.life -= 1;
        if (p.life <= 0 || p.x < -8 || p.x > W + 8) {
          spawn(p);
          continue;
        }
        const a = Math.min(1, p.life / p.maxLife) * 0.85;
        // trainee (1 segment, vers l'arriere du mouvement)
        c.strokeStyle = `rgba(${r},${g},${b},${a * 0.5})`;
        c.lineWidth = p.size;
        c.beginPath();
        c.moveTo(p.x - p.vx * 5, p.y - p.vy * 5);
        c.lineTo(p.x, p.y);
        c.stroke();
        // tete
        c.fillStyle = `rgba(${r},${g},${b},${a})`;
        c.beginPath();
        c.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        c.fill();
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);

    window.addEventListener('resize', resize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, [direction, color, reduced]);

  return (
    <canvas ref={canvasRef} aria-hidden className={['pointer-events-none h-full w-full', className ?? ''].join(' ')} />
  );
}
