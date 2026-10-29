/**
 * Commandes tactiles façon borne : un pavé de déplacement à deux grosses
 * flèches (colonne de gauche) et un gros bouton FEU (colonne de droite).
 *
 * Multi-doigts : chaque doigt est suivi par son pointerId et capturé ; sur
 * le pavé, c'est la MOITIÉ sous le doigt qui décide du sens, on peut donc
 * glisser d'une flèche à l'autre sans relever le doigt. Les zones sont plus
 * grandes que les dessins : on joue sans regarder ses mains, dalle vue de
 * biais.
 */

import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { InvControls } from '../engine/controls';

type Side = 'left' | 'right';

function Arrow({ dir }: { dir: Side }) {
  // flèche en pixels, comme la police de la borne
  const rows = ['...#....', '..##....', '.#######', '########', '########', '.#######', '..##....', '...#....'];
  return (
    <svg viewBox="0 0 8 8" width={96} height={96} style={{ transform: dir === 'right' ? 'scaleX(-1)' : undefined }} shapeRendering="crispEdges">
      {rows.map((row, y) =>
        row.split('').map((c, x) => (c === '#' ? <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill="currentColor" /> : null)),
      )}
    </svg>
  );
}

interface PadProps {
  controls: InvControls;
  color: string;
  disabled?: boolean;
}

export function MovePad({ controls, color, disabled = false }: PadProps) {
  const ref = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, Side>());
  const [down, setDown] = useState<{ left: boolean; right: boolean }>({ left: false, right: false });

  const refresh = () => {
    let left = false;
    let right = false;
    for (const side of pointers.current.values()) {
      if (side === 'left') left = true;
      else right = true;
    }
    setDown({ left, right });
  };

  const sideOf = (e: ReactPointerEvent): Side => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return 'left';
    return e.clientX < rect.left + rect.width / 2 ? 'left' : 'right';
  };

  const press = (e: ReactPointerEvent) => {
    if (disabled) return;
    e.preventDefault();
    ref.current?.setPointerCapture(e.pointerId);
    const side = sideOf(e);
    pointers.current.set(e.pointerId, side);
    controls.setTouch(e.pointerId, side);
    refresh();
  };
  const move = (e: ReactPointerEvent) => {
    const current = pointers.current.get(e.pointerId);
    if (!current) return;
    const side = sideOf(e);
    if (side === current) return;
    pointers.current.set(e.pointerId, side);
    controls.setTouch(e.pointerId, side);
    refresh();
  };
  const release = (e: ReactPointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.delete(e.pointerId);
    controls.setTouch(e.pointerId, null);
    refresh();
  };

  const key = (side: Side) => {
    const on = side === 'left' ? down.left : down.right;
    return (
      <div
        data-down={on}
        className="inv-key flex h-[220px] w-[200px] items-center justify-center rounded-[28px] border-[3px]"
        style={{
          color: on ? '#04020a' : color,
          borderColor: color,
          background: on ? color : 'rgba(10,6,22,0.85)',
          boxShadow: on ? `0 0 34px ${color}` : `0 0 14px ${color}55, inset 0 0 18px ${color}22`,
          opacity: disabled ? 0.35 : 1,
        }}
      >
        <Arrow dir={side} />
      </div>
    );
  };

  return (
    <div
      ref={ref}
      data-inv-ui
      className="inv-pad flex items-center justify-center gap-6 px-4 py-6"
      onPointerDown={press}
      onPointerMove={move}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={release}
    >
      {key('left')}
      {key('right')}
    </div>
  );
}

interface FireProps {
  controls: InvControls;
  color: string;
  label: string;
  disabled?: boolean;
}

export function FireButton({ controls, color, label, disabled = false }: FireProps) {
  const pointers = useRef(new Set<number>());
  const [down, setDown] = useState(false);

  const press = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.add(e.pointerId);
    controls.fire();
    setDown(true);
  };
  const release = (e: ReactPointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size === 0) setDown(false);
  };

  return (
    <div
      data-inv-ui
      className="inv-pad flex items-center justify-center px-4 py-6"
      onPointerDown={press}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={release}
    >
      <div
        data-down={down}
        className="inv-key flex h-[260px] w-[260px] items-center justify-center rounded-full border-[4px] font-retro text-[34px]"
        style={{
          color: down ? '#04020a' : color,
          borderColor: color,
          background: down ? color : `radial-gradient(circle at 50% 35%, ${color}33, rgba(10,6,22,0.92) 70%)`,
          boxShadow: down ? `0 0 46px ${color}` : `0 0 22px ${color}66, inset 0 0 26px ${color}33`,
          opacity: disabled ? 0.35 : 1,
        }}
      >
        {label}
      </div>
    </div>
  );
}
