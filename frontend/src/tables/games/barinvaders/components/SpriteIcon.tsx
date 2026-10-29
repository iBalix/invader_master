/**
 * Petit sprite de la borne (colonnes d'octets, bit 0 en bas) dessiné dans un
 * canvas et agrandi en CSS sans lissage, avec un halo néon. Sert aux
 * panneaux DOM : table des points, vies du panneau des joueurs, lobby.
 */

import { useEffect, useRef } from 'react';

interface Props {
  columns: readonly number[];
  color: string;
  /** agrandissement entier */
  scale: number;
  /** n'afficher que les colonnes utiles (rogne les colonnes vides des bords) */
  trim?: boolean;
  glow?: boolean;
  className?: string;
}

function trimmed(columns: readonly number[]): readonly number[] {
  let a = 0;
  let b = columns.length;
  while (a < b && columns[a] === 0) a += 1;
  while (b > a && columns[b - 1] === 0) b -= 1;
  return columns.slice(a, b);
}

export default function SpriteIcon({ columns, color, scale, trim = true, glow = true, className = '' }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const cols = trim ? trimmed(columns) : columns;
  const key = cols.join(',');

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = color;
    cols.forEach((v, x) => {
      for (let b = 0; b < 8; b += 1) if ((v >> b) & 1) ctx.fillRect(x, 7 - b, 1, 1);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, color]);

  return (
    <canvas
      ref={ref}
      width={Math.max(1, cols.length)}
      height={8}
      className={className}
      style={{
        width: Math.max(1, cols.length) * scale,
        height: 8 * scale,
        imageRendering: 'pixelated',
        filter: glow ? `drop-shadow(0 0 ${Math.max(2, scale)}px ${color})` : undefined,
      }}
    />
  );
}
