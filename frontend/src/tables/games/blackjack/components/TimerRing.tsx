/**
 * Anneau de compte à rebours du joueur actif, synchronisé sur l'horloge
 * serveur. Rouge clignotant sur les 3 dernières secondes : c'est le "bip"
 * que les dalles muettes ne peuvent pas jouer, visible sur tous les écrans.
 */

import { useEffect, useRef, useState } from 'react';
import { serverNow } from '../../../lib/clockSync';

interface Props {
  endsAt: number;
  totalMs: number;
  color: string;
  dangerColor: string;
  size: number;
  reduced?: boolean;
}

export default function TimerRing({ endsAt, totalMs, color, dangerColor, size, reduced }: Props) {
  const [remaining, setRemaining] = useState(() => Math.max(0, endsAt - serverNow()));
  const rafRef = useRef(0);
  const lastPaint = useRef(0);

  useEffect(() => {
    const tick = (now: number) => {
      // ~8 rafraîchissements par seconde suffisent pour un anneau
      if (now - lastPaint.current > 120) {
        lastPaint.current = now;
        setRemaining(Math.max(0, endsAt - serverNow()));
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [endsAt]);

  const ratio = totalMs > 0 ? Math.min(1, remaining / totalMs) : 0;
  const danger = remaining <= 3_000;
  const ringColor = danger ? dangerColor : color;
  const seconds = Math.min(99, Math.ceil(remaining / 1000));
  const deg = Math.round(ratio * 360);

  return (
    <div
      className={`relative flex items-center justify-center rounded-full ${danger && !reduced ? 'bj-timer-danger' : ''}`}
      style={{
        width: size,
        height: size,
        background: `conic-gradient(${ringColor} ${deg}deg, rgba(255,255,255,0.12) ${deg}deg)`,
      }}
    >
      <div
        className="flex items-center justify-center rounded-full bg-black/70 font-display font-bold"
        style={{ width: size - 8, height: size - 8, color: ringColor, fontSize: size * 0.42 }}
      >
        {seconds}
      </div>
    </div>
  );
}
