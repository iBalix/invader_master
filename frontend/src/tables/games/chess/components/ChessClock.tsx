/**
 * Affichage d'une pendule : gros chiffres tabulaires, pulsation sous 30 s
 * puis sous 10 s (statique en perf reduced), dixièmes sous 10 s.
 */

import { useChessClock, type ClockBaseline } from '../hooks/useChessClock';
import type { ChessColor } from '../lib/chessTypes';
import type { ChessTheme } from '../themes/types';

interface Props {
  baseline: ClockBaseline | null;
  side: ChessColor;
  turn: ChessColor;
  running: boolean;
  theme: ChessTheme;
  reduced: boolean;
  onFlag?: () => void;
}

export default function ChessClock({ baseline, side, turn, running, theme, reduced, onFlag }: Props) {
  const clock = useChessClock(baseline, side, turn, running, onFlag);
  if (!clock) return null;

  const color =
    clock.level === 'danger' ? theme.clockDanger : clock.active ? theme.hudAccent : undefined;
  const pulseClass = reduced
    ? ''
    : clock.active && clock.level === 'danger'
      ? 'chess-clock-danger'
      : clock.active && clock.level === 'warn'
        ? 'chess-clock-warn'
        : '';

  return (
    <div
      className={[
        'rounded-2xl border px-5 py-2.5 text-center font-display text-5xl tabular-nums tracking-wide',
        clock.active ? 'border-white/25 bg-black/45' : 'border-white/10 bg-black/25 opacity-70',
        pulseClass,
      ].join(' ')}
      style={{ color: color ?? '#F5F2FF' }}
    >
      {clock.text}
    </div>
  );
}
