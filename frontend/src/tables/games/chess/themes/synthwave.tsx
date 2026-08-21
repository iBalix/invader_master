/**
 * Thème SYNTHWAVE / GALAXIE : dégradés vaporwave, étoiles statiques (zéro
 * animation au repos), cadre en bordure dégradée magenta-cyan, pièces en
 * dégradés lumineux. Capture 'warp' : clone étiré aspiré vers les prises.
 * Ambiance : étoile filante one-shot toutes les 12-18 s.
 */

import { useEffect, useMemo, useState } from 'react';
import { PieceGlyph } from './pieces/StandardPieceSet';
import type { ChessTheme, PieceStyle } from './types';

const WHITE: PieceStyle = {
  body: '#7DF3FF',
  gradient: { from: '#8FF6FF', to: '#3AA7FF' },
  stroke: '#EAF9FF',
  strokeWidth: 1.5,
  detail: '#EAF9FF',
  glow: 'drop-shadow(0 0 4px rgba(125,243,255,0.5))',
};

const BLACK: PieceStyle = {
  body: '#B14BE8',
  gradient: { from: '#FF7BE0', to: '#7A2BD6' },
  stroke: '#FFD9F6',
  strokeWidth: 1.5,
  detail: '#FFD9F6',
  glow: 'drop-shadow(0 0 4px rgba(255,123,224,0.5))',
};

interface Star {
  x: number;
  y: number;
  r: number;
  opacity: number;
}

function SynthwaveAmbient({ boardSize }: { boardSize: number }) {
  // étoiles STATIQUES (générées une fois, aucune animation)
  const stars = useMemo<Star[]>(
    () =>
      Array.from({ length: 46 }, () => ({
        x: Math.random() * 100,
        y: Math.random() * 100,
        r: 0.6 + Math.random() * 1.1,
        opacity: 0.25 + Math.random() * 0.55,
      })),
    [],
  );
  const [shooting, setShooting] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    let timer: number;
    const schedule = () => {
      timer = window.setTimeout(() => {
        if (!alive) return;
        if (document.visibilityState === 'visible') setShooting(Date.now());
        schedule();
      }, 12000 + Math.random() * 6000);
    };
    schedule();
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, []);

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
        {stars.map((s, i) => (
          <circle key={i} cx={s.x} cy={s.y} r={s.r * 0.24} fill="#EAF9FF" opacity={s.opacity} />
        ))}
      </svg>
      {shooting !== null && (
        <div
          key={shooting}
          className="chess-shooting-star absolute"
          style={{
            top: `${8 + Math.random() * 30}%`,
            left: -60,
            ['--fly-dist' as string]: `${boardSize + 140}px`,
          }}
          onAnimationEnd={() => setShooting(null)}
        />
      )}
    </div>
  );
}

export const synthwaveTheme: ChessTheme = {
  id: 'synthwave',
  labelKey: 'table.chess.theme.synthwave',
  pageBg: 'linear-gradient(180deg, #12082E 0%, #2A0F4E 55%, #4A1A5E 100%)',
  boardFrameClass: 'rounded-2xl p-[3px]',
  boardFrameStyle: { background: 'linear-gradient(90deg, #FF2BD6, #33E2FF)' },
  lightSquare: '#3A2260',
  darkSquare: '#241243',
  coordColor: 'rgba(234,249,255,0.45)',
  selectedOutline: '#8FF6FF',
  legalDot: 'rgba(143,246,255,0.55)',
  captureRing: 'rgba(255,123,224,0.9)',
  lastMoveTint: 'rgba(255,123,224,0.2)',
  checkTint: 'rgba(255,59,92,0.45)',
  hudAccent: '#FF7BE0',
  clockDanger: '#FF3B5C',
  markerShape: 'round',
  pieceStyle: (c) => (c === 'w' ? WHITE : BLACK),
  renderPiece: (type, color, size) => (
    <PieceGlyph type={type} color={color} style={color === 'w' ? WHITE : BLACK} size={size} />
  ),
  moveMs: 240,
  moveEasing: 'cubic-bezier(0.32, 0.72, 0, 1)',
  captureFx: 'warp',
  captureMs: 480,
  particleColor: (c) => (c === 'w' ? '#8FF6FF' : '#FF7BE0'),
  Ambient: SynthwaveAmbient,
};
