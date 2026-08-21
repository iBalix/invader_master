/**
 * Jetons qui voyagent : un jeton ne change jamais de place instantanément.
 * Au paiement, des jetons volent du siège vers la banque (perte) ou de la
 * banque vers le siège (gain), en cascade. Sprites en position fixe,
 * détruits à la fin de leur trajet.
 */

import { useEffect, useState } from 'react';
import ChipGlyph from '../themes/ChipGlyph';
import type { BjTheme } from '../themes/types';

export interface ChipFlight {
  key: string;
  value: number;
  from: { x: number; y: number };
  to: { x: number; y: number };
  delayMs: number;
}

interface Props {
  flights: ChipFlight[];
  theme: BjTheme;
  reduced?: boolean;
  onDone?: () => void;
}

const FLY_MS = 620;
const CHIP = 30;

export default function ChipFlyLayer({ flights, theme, reduced, onDone }: Props) {
  const [visible, setVisible] = useState(flights);

  useEffect(() => {
    setVisible(flights);
    if (flights.length === 0) return;
    const maxDelay = Math.max(...flights.map((f) => f.delayMs));
    const timer = window.setTimeout(() => {
      setVisible([]);
      onDone?.();
    }, maxDelay + FLY_MS + 80);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flights]);

  if (reduced || visible.length === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-40">
      {visible.map((f) => (
        <div
          key={f.key}
          className="bj-chip-fly"
          style={{
            ['--fx' as string]: `${f.from.x - CHIP / 2}px`,
            ['--fy' as string]: `${f.from.y - CHIP / 2}px`,
            ['--tx' as string]: `${f.to.x - CHIP / 2}px`,
            ['--ty' as string]: `${f.to.y - CHIP / 2}px`,
            ['--bj-chip-ms' as string]: `${FLY_MS}ms`,
            ['--bj-chip-delay' as string]: `${f.delayMs}ms`,
          }}
        >
          <ChipGlyph value={f.value} theme={theme} size={CHIP} />
        </div>
      ))}
    </div>
  );
}
