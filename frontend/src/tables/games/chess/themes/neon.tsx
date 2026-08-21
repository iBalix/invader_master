/**
 * Thème NÉON INVADER : la DA du bar. Fond bleu nuit, grille néon cyan/magenta,
 * pièces en glyphes lumineux. Capture 'dissolve' : désintégration en
 * particules. Ambiance : impulsion lumineuse one-shot le long d'une ligne
 * de la grille toutes les 9-14 s (jamais montée en perf reduced).
 */

import { useEffect, useState } from 'react';
import { PieceGlyph } from './pieces/StandardPieceSet';
import type { ChessTheme, PieceStyle } from './types';

const WHITE: PieceStyle = {
  body: 'rgba(51,226,255,0.16)',
  stroke: '#33E2FF',
  strokeWidth: 1.7,
  detail: '#9FF0FF',
  glow: 'drop-shadow(0 0 5px rgba(51,226,255,0.75))',
};

const BLACK: PieceStyle = {
  body: 'rgba(255,43,214,0.14)',
  stroke: '#FF2BD6',
  strokeWidth: 1.7,
  detail: '#FFA1EC',
  glow: 'drop-shadow(0 0 5px rgba(255,43,214,0.75))',
};

function NeonAmbient({ boardSize }: { boardSize: number }) {
  const [pulse, setPulse] = useState<{ key: number; horizontal: boolean; index: number } | null>(
    null,
  );

  useEffect(() => {
    let alive = true;
    let timer: number;
    const schedule = () => {
      timer = window.setTimeout(() => {
        if (!alive) return;
        if (document.visibilityState === 'visible') {
          setPulse({
            key: Date.now(),
            horizontal: Math.random() < 0.5,
            index: Math.floor(Math.random() * 9),
          });
        }
        schedule();
      }, 9000 + Math.random() * 5000);
    };
    schedule();
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, []);

  if (!pulse) return null;
  const offset = Math.round((pulse.index * boardSize) / 8);
  const color = pulse.index % 2 === 0 ? '#33E2FF' : '#FF2BD6';
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div
        key={pulse.key}
        className="absolute"
        style={
          pulse.horizontal
            ? { top: offset - 1, left: 0, right: 0, height: 2 }
            : { left: offset - 1, top: 0, bottom: 0, width: 2 }
        }
      >
        <div
          className={pulse.horizontal ? 'chess-neon-pulse-h' : 'chess-neon-pulse-v'}
          style={{ color }}
          onAnimationEnd={() => setPulse(null)}
        />
      </div>
    </div>
  );
}

export const neonTheme: ChessTheme = {
  id: 'neon',
  labelKey: 'table.chess.theme.neon',
  pageBg:
    'radial-gradient(ellipse at 50% 0%, rgba(123,43,255,0.18), transparent 55%), linear-gradient(180deg, #0F0A24 0%, #070512 70%, #050310 100%)',
  boardFrameClass: 'rounded-xl border border-table-cyan/40 shadow-neon-cyan',
  boardBg: '#0A0618',
  // le damier doit rester LISIBLE : un joueur lit les diagonales avant de
  // lire les néons. D'où un écart de luminosité franc entre les deux cases,
  // le néon restant porté par la grille et les pièces.
  lightSquare: '#241A4A',
  darkSquare: '#120C2A',
  squareBorder: 'rgba(51,226,255,0.22)',
  coordColor: 'rgba(159,240,255,0.5)',
  selectedOutline: (c) => (c === 'w' ? '#33E2FF' : '#FF2BD6'),
  legalDot: (c) => (c === 'w' ? '#33E2FF' : '#FF2BD6'),
  // rouge et non magenta : le magenta est la couleur des noirs, l'anneau
  // serait invisible sur la pièce noire que les blancs veulent prendre
  captureRing: '#FF3B5C',
  lastMoveTint: 'rgba(255,233,85,0.16)',
  checkTint: 'rgba(255,59,92,0.4)',
  hudAccent: '#33E2FF',
  clockDanger: '#FF3B5C',
  markerShape: 'round',
  pieceStyle: (c) => (c === 'w' ? WHITE : BLACK),
  renderPiece: (type, color, size) => (
    <PieceGlyph type={type} color={color} style={color === 'w' ? WHITE : BLACK} size={size} />
  ),
  moveMs: 220,
  moveEasing: 'cubic-bezier(0.32, 0.72, 0, 1)',
  captureFx: 'dissolve',
  captureMs: 500,
  particleColor: (c) => (c === 'w' ? '#33E2FF' : '#FF2BD6'),
  Ambient: NeonAmbient,
};
