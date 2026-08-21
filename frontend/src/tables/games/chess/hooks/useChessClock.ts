/**
 * Pendule interpolée côté client : le serveur envoie les restants décomptés à
 * serverNow, le client fait tourner le camp au trait via l'horloge serveur
 * estimée. Le RÉSULTAT (drapeau) vient toujours du serveur : à 0 local on
 * déclenche juste un refresh pour qu'il le constate.
 */

import { useEffect, useRef, useState } from 'react';
import { serverNow } from '../lib/clockSync';
import type { ChessColor } from '../lib/chessTypes';

export interface ClockBaseline {
  wMs: number;
  bMs: number;
  /** serverNow au moment de la photo (state.serverNow) */
  at: number;
}

export interface ClockDisplay {
  ms: number;
  text: string;
  level: 'normal' | 'warn' | 'danger';
  active: boolean;
}

export function formatClock(ms: number): string {
  if (ms < 10_000) {
    return (Math.max(0, ms) / 1000).toFixed(1);
  }
  const totalSec = Math.ceil(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function useChessClock(
  baseline: ClockBaseline | null,
  side: ChessColor,
  turn: ChessColor,
  running: boolean,
  onFlag?: () => void,
): ClockDisplay | null {
  const active = baseline !== null && running && turn === side;
  const compute = (): number => {
    if (!baseline) return 0;
    const base = side === 'w' ? baseline.wMs : baseline.bMs;
    if (!active) return Math.max(0, base);
    return Math.max(0, base - (serverNow() - baseline.at));
  };

  const [ms, setMs] = useState<number>(compute);
  const flaggedRef = useRef(false);
  const onFlagRef = useRef(onFlag);
  onFlagRef.current = onFlag;

  useEffect(() => {
    flaggedRef.current = false;
    setMs(compute());
    if (!baseline || !active) return;
    let interval = window.setInterval(tick, 250);
    let fast = false;
    function tick() {
      const value = compute();
      setMs(value);
      if (value < 10_000 && !fast) {
        fast = true;
        window.clearInterval(interval);
        interval = window.setInterval(tick, 100);
      }
      if (value <= 0 && !flaggedRef.current) {
        flaggedRef.current = true;
        onFlagRef.current?.();
      }
    }
    return () => window.clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseline, active, side, turn]);

  if (!baseline) return null;
  return {
    ms,
    text: formatClock(ms),
    level: ms < 10_000 ? 'danger' : ms < 30_000 ? 'warn' : 'normal',
    active,
  };
}
