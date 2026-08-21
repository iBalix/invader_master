/**
 * Thème RÉTRO PIXEL ARCADE : damier 8-bit, pièces pixelisées (set dédié),
 * déplacements par à-coups steps(), marqueurs CARRÉS (pas de rond en 8-bit).
 * Capture 'pixel-burst' : la pièce explose en rectangles (clin d'oeil Space
 * Invaders). Ambiance : un invader traverse le haut du plateau ~toutes les 20 s.
 */

import { useEffect, useState } from 'react';
import { PixelGlyph, type PixelPieceColors } from './pieces/PixelPieceSet';
import type { ChessTheme, PieceStyle } from './types';

const WHITE_COLORS: PixelPieceColors = { fill: '#F5F2FF', shadow: 'rgba(51,226,255,0.55)' };
const BLACK_COLORS: PixelPieceColors = { fill: '#FF2BD6', shadow: 'rgba(59,10,153,0.8)' };

// pieceStyle sert aux FX (particules, clones) même si le rendu passe par PixelGlyph
const WHITE: PieceStyle = { body: '#F5F2FF', stroke: '#33E2FF', strokeWidth: 0 };
const BLACK: PieceStyle = { body: '#FF2BD6', stroke: '#3B0A99', strokeWidth: 0 };

// invader 11x8 (frames du RetroLoader, redessinées ici pour rester autonome)
const INVADER: string[] = [
  '..#.....#..',
  '...#...#...',
  '..#######..',
  '.##.###.##.',
  '###########',
  '#.#######.#',
  '#.#.....#.#',
  '...##.##...',
];

function PixelInvader({ size, color }: { size: number; color: string }) {
  const rects: Array<[number, number]> = [];
  INVADER.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) if (row[x] === '#') rects.push([x, y]);
  });
  return (
    <svg viewBox="0 0 11 8" width={size} height={(size * 8) / 11} shapeRendering="crispEdges" aria-hidden style={{ display: 'block' }}>
      {rects.map(([x, y], i) => (
        <rect key={i} x={x} y={y} width={1} height={1} fill={color} />
      ))}
    </svg>
  );
}

function PixelAmbient({ boardSize }: { boardSize: number }) {
  const [fly, setFly] = useState<{ key: number; color: string } | null>(null);

  useEffect(() => {
    let alive = true;
    let timer: number;
    const schedule = () => {
      timer = window.setTimeout(() => {
        if (!alive) return;
        if (document.visibilityState === 'visible') {
          setFly({ key: Date.now(), color: Math.random() < 0.5 ? '#33E2FF' : '#FF2BD6' });
        }
        schedule();
      }, 16000 + Math.random() * 9000);
    };
    schedule();
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, []);

  if (!fly) return null;
  return (
    <div aria-hidden className="pointer-events-none absolute inset-x-0 -top-9 h-8 overflow-visible">
      <div
        key={fly.key}
        className="chess-invader-fly absolute left-0 top-0"
        style={{ '--fly-dist': `${boardSize + 80}px` } as React.CSSProperties}
        onAnimationEnd={() => setFly(null)}
      >
        <PixelInvader size={34} color={fly.color} />
      </div>
    </div>
  );
}

export const pixelTheme: ChessTheme = {
  id: 'pixel',
  labelKey: 'table.chess.theme.pixel',
  pageBg: 'linear-gradient(180deg, #10142E 0%, #090B1C 100%)',
  boardFrameClass: 'border-4 border-black shadow-[0_0_0_3px_#33E2FF,0_16px_44px_rgba(0,0,0,0.6)]',
  lightSquare: '#262B4A',
  darkSquare: '#171B33',
  coordColor: 'rgba(245,242,255,0.45)',
  selectedOutline: '#FFE955',
  selectedClass: 'chess-selected-pixel',
  legalDot: (c) => (c === 'w' ? '#F5F2FF' : '#FF2BD6'),
  captureRing: '#FF3B5C',
  lastMoveTint: 'rgba(255,233,85,0.16)',
  checkTint: 'rgba(255,59,92,0.45)',
  hudAccent: '#33E2FF',
  clockDanger: '#FF3B5C',
  markerShape: 'square',
  pieceStyle: (c) => (c === 'w' ? WHITE : BLACK),
  renderPiece: (type, color, size) => (
    <PixelGlyph type={type} color={color} colors={color === 'w' ? WHITE_COLORS : BLACK_COLORS} size={size} />
  ),
  moveMs: 220,
  moveEasing: 'steps(5, end)',
  captureFx: 'pixel-burst',
  captureMs: 450,
  particleColor: (c) => (c === 'w' ? '#F5F2FF' : '#FF2BD6'),
  Ambient: PixelAmbient,
};
