/**
 * FX de capture, par-dessus tout (position fixed). Le rendu du plateau et du
 * tray découle toujours de l'état ; le FX est un pur décor superposé :
 *   - 'fly' / 'warp' : clone volant mesuré au pixel, de la case vers le slot
 *     du tray (repéré par [data-tray-slot="<pieceId>"]) ;
 *   - 'dissolve' / 'zap' / 'pixel-burst' / 'fade' : effet joué sur la case.
 * En perf reduced : tout devient 'fade' 150 ms.
 * Échec de mesure (ref nulle, slot absent) : repli silencieux en fade.
 */

import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { motion } from 'framer-motion';
import { squareScreenRect, type Orientation, type Square } from '../lib/geometry';
import type { ChessColor, PieceType } from '../lib/chessTypes';
import type { CaptureFxKind, ChessTheme } from '../themes/types';

export interface CaptureFxItem {
  key: number;
  pieceId: string;
  type: PieceType;
  color: ChessColor;
  square: Square;
}

interface Props {
  items: CaptureFxItem[];
  boardRef: RefObject<HTMLDivElement>;
  orientation: Orientation;
  theme: ChessTheme;
  reduced: boolean;
  onDone: (key: number) => void;
}

interface Rect {
  x: number;
  y: number;
  size: number;
}

export default function CaptureFxLayer({ items, boardRef, orientation, theme, reduced, onDone }: Props) {
  return (
    <>
      {items.map((item) => (
        <FxOne
          key={item.key}
          item={item}
          boardRef={boardRef}
          orientation={orientation}
          theme={theme}
          reduced={reduced}
          onDone={() => onDone(item.key)}
        />
      ))}
    </>
  );
}

function FxOne({
  item,
  boardRef,
  orientation,
  theme,
  reduced,
  onDone,
}: {
  item: CaptureFxItem;
  boardRef: RefObject<HTMLDivElement>;
  orientation: Orientation;
  theme: ChessTheme;
  reduced: boolean;
  onDone: () => void;
}) {
  const kind: CaptureFxKind = reduced ? 'fade' : theme.captureFx;
  const durationMs = reduced ? 150 : theme.captureMs;
  const [src, setSrc] = useState<Rect | null>(null);
  const [dst, setDst] = useState<Rect | null>(null);
  const doneRef = useRef(false);

  const finish = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    onDone();
  };

  // mesures après le commit React (le slot du tray vient d'être rendu)
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      const board = boardRef.current;
      if (!board) {
        finish();
        return;
      }
      setSrc(squareScreenRect(board.getBoundingClientRect(), item.square, orientation));
      if (kind === 'fly' || kind === 'warp') {
        const slot = document.querySelector(`[data-tray-slot="${item.pieceId}"]`);
        if (slot) {
          const r = slot.getBoundingClientRect();
          setDst({ x: r.left, y: r.top, size: r.width });
        }
      }
    });
    // filet : quoi qu'il arrive le fx se termine
    const timer = window.setTimeout(finish, durationMs + 400);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // particules précalculées (dissolve / pixel-burst)
  const particles = useMemo(() => {
    const count = kind === 'pixel-burst' ? 8 : 12;
    return Array.from({ length: count }, (_, i) => {
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.6;
      const dist = 26 + Math.random() * 44;
      return {
        px: Math.cos(angle) * dist,
        py: kind === 'pixel-burst' ? Math.abs(Math.sin(angle)) * dist + 24 : Math.sin(angle) * dist,
        size: kind === 'pixel-burst' ? 7 + Math.random() * 5 : 3 + Math.random() * 3,
        delay: Math.random() * 60,
      };
    });
  }, [kind]);

  if (!src) return null;
  const particleColor = theme.particleColor?.(item.color) ?? theme.hudAccent;
  const glyph = theme.renderPiece(item.type, item.color, '100%');

  // vol vers le tray (fly / warp)
  if ((kind === 'fly' || kind === 'warp') && dst) {
    const scale = dst.size / src.size;
    return (
      <motion.div
        className="chess-fx"
        style={{ width: src.size, height: src.size, transformOrigin: 'top left' }}
        initial={{ x: src.x, y: src.y, scaleX: 1, scaleY: 1, opacity: 1 }}
        animate={
          kind === 'warp'
            ? {
                x: [src.x, (src.x + dst.x) / 2, dst.x],
                y: [src.y, (src.y + dst.y) / 2, dst.y],
                scaleX: [1, scale * 0.55, scale],
                scaleY: [1, scale * 1.7, scale],
                opacity: [1, 0.9, 1],
              }
            : { x: dst.x, y: dst.y, scaleX: scale, scaleY: scale }
        }
        transition={{ duration: durationMs / 1000, ease: [0.32, 0.72, 0, 1] }}
        onAnimationComplete={finish}
      >
        {glyph}
      </motion.div>
    );
  }

  // effets sur place
  return (
    <div className="chess-fx" style={{ left: src.x, top: src.y, width: src.size, height: src.size }}>
      {(kind === 'fade' || (kind !== 'dissolve' && kind !== 'zap' && kind !== 'pixel-burst')) && (
        <div className="chess-fade-victim absolute inset-[5%]" style={{ ['--dur' as string]: `${durationMs}ms` }}>
          {glyph}
        </div>
      )}
      {kind === 'dissolve' && (
        <>
          <div className="chess-fade-victim absolute inset-[5%]" style={{ ['--dur' as string]: `${durationMs * 0.55}ms` }}>
            {glyph}
          </div>
          {particles.map((p, i) => (
            <div
              key={i}
              className="chess-particle left-1/2 top-1/2"
              style={{
                width: p.size,
                height: p.size,
                background: particleColor,
                animationDelay: `${p.delay}ms`,
                ['--px' as string]: `${p.px}px`,
                ['--py' as string]: `${p.py}px`,
                ['--dur' as string]: `${durationMs}ms`,
              }}
            />
          ))}
        </>
      )}
      {kind === 'zap' && (
        <>
          <div className="chess-zap-victim absolute inset-[5%]">{glyph}</div>
          <div className="chess-flash absolute inset-0" style={{ background: '#FFFFFF' }} />
          <svg className="chess-flash absolute inset-0" viewBox="0 0 100 100" aria-hidden>
            <polyline
              points="50,-5 42,28 58,36 40,62 56,70 47,105"
              fill="none"
              stroke={particleColor}
              strokeWidth={5}
              strokeLinejoin="round"
            />
          </svg>
        </>
      )}
      {kind === 'pixel-burst' &&
        particles.map((p, i) => (
          <div
            key={i}
            className="chess-chunk left-1/2 top-1/2"
            style={{
              width: p.size,
              height: p.size,
              background: particleColor,
              ['--px' as string]: `${p.px}px`,
              ['--py' as string]: `${p.py}px`,
              ['--dur' as string]: `${durationMs}ms`,
            }}
          />
        ))}
    </div>
  );
}
