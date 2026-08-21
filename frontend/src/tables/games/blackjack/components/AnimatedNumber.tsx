/**
 * Compteur qui grimpe : la valeur défile jusqu'à sa nouvelle valeur au lieu
 * de sauter (rAF, ~400 ms). Un des quatre gestes de base du jeu.
 */

import { useEffect, useRef, useState } from 'react';

interface Props {
  value: number;
  durationMs?: number;
  className?: string;
  style?: React.CSSProperties;
}

export default function AnimatedNumber({ value, durationMs = 420, className, style }: Props) {
  const [shown, setShown] = useState(value);
  const fromRef = useRef(value);
  const rafRef = useRef(0);

  useEffect(() => {
    const from = fromRef.current;
    if (from === value) return;
    const start = performance.now();
    cancelAnimationFrame(rafRef.current);
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - (1 - t) * (1 - t);
      const current = Math.round(from + (value - from) * eased);
      setShown(current);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = value;
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [value, durationMs]);

  return (
    <span className={className} style={style}>
      {shown}
    </span>
  );
}
