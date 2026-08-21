/**
 * Mise de la manche : paliers tactiles (min, -, +, x2, max), envoi
 * automatique avec un léger debounce (le dernier montant posé avant la fin
 * du chrono fait foi côté serveur). Qui ne touche à rien rejoue sa mise
 * précédente.
 */

import { useEffect, useRef, useState } from 'react';
import TimerRing from './TimerRing';
import ChipGlyph from '../themes/ChipGlyph';
import AnimatedNumber from './AnimatedNumber';
import type { BjPublicState } from '../lib/bjTypes';
import type { BjTheme } from '../themes/types';
import type { TFunction } from '../../../i18n/useT';

interface Props {
  state: BjPublicState;
  theme: BjTheme;
  myChips: number;
  /** mise déjà enregistrée côté serveur (betInput de mon siège) */
  serverBet: number | null;
  lastBet: number | null;
  onBet: (amount: number) => void;
  reduced?: boolean;
  t: TFunction;
}

const SEND_DEBOUNCE_MS = 550;

export default function BetPanel({ state, theme, myChips, serverBet, lastBet, onBet, reduced, t }: Props) {
  const { minBet, maxBet, betMs } = state.config;
  const ceiling = Math.max(minBet, Math.min(maxBet, myChips));
  const [amount, setAmount] = useState(() =>
    Math.min(ceiling, Math.max(minBet, serverBet ?? lastBet ?? minBet)),
  );
  const timer = useRef<number | null>(null);
  const sent = useRef<number | null>(serverBet);

  // nouvel affichage de manche : repartir de la mise connue
  const roundRef = useRef(state.roundIndex);
  useEffect(() => {
    if (roundRef.current !== state.roundIndex) {
      roundRef.current = state.roundIndex;
      sent.current = serverBet;
      setAmount(Math.min(ceiling, Math.max(minBet, serverBet ?? lastBet ?? minBet)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.roundIndex]);

  function push(next: number) {
    const clamped = Math.max(minBet, Math.min(ceiling, next));
    setAmount(clamped);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      if (sent.current !== clamped) {
        sent.current = clamped;
        onBet(clamped);
      }
    }, SEND_DEBOUNCE_MS);
  }

  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current);
  }, []);

  const confirmed = serverBet !== null && serverBet === amount;
  const step = minBet;

  const btn =
    'flex h-14 min-w-[64px] items-center justify-center rounded-xl border border-white/15 bg-black/45 px-3 font-display text-lg font-bold text-white active:scale-95';

  return (
    <div
      className="pointer-events-auto flex items-center gap-2.5 rounded-2xl border px-4 py-2.5"
      style={{ background: theme.seatBg, borderColor: theme.seatBorder }}
    >
      {state.phaseEndsAt && (
        <TimerRing
          endsAt={state.phaseEndsAt}
          totalMs={betMs}
          color={theme.hudAccent}
          dangerColor={theme.danger}
          size={46}
          reduced={reduced}
        />
      )}
      <span className="font-display text-sm font-bold uppercase tracking-wider" style={{ color: theme.feltText }}>
        {t('table.bj.bet.title')}
      </span>
      <button className={btn} onClick={() => push(minBet)}>
        {t('table.bj.bet.min')}
      </button>
      <button className={btn} onClick={() => push(amount - step)} disabled={amount <= minBet} style={{ opacity: amount <= minBet ? 0.4 : 1 }}>
        -{step}
      </button>
      <div className="flex min-w-[110px] items-center justify-center gap-2 rounded-xl px-3 py-1.5" style={{ background: `${theme.hudAccent}1A` }}>
        <ChipGlyph value={amount} theme={theme} size={30} />
        <AnimatedNumber value={amount} className="font-display text-2xl font-extrabold" style={{ color: theme.hudAccent }} />
      </div>
      <button className={btn} onClick={() => push(amount + step)} disabled={amount >= ceiling} style={{ opacity: amount >= ceiling ? 0.4 : 1 }}>
        +{step}
      </button>
      <button className={btn} onClick={() => push(amount * 2)} disabled={amount * 2 > ceiling} style={{ opacity: amount * 2 > ceiling ? 0.4 : 1 }}>
        x2
      </button>
      <button className={btn} onClick={() => push(ceiling)}>
        {t('table.bj.bet.max')}
      </button>
      <span
        className={`min-w-[74px] text-center text-xs font-bold uppercase ${confirmed ? 'bj-pop' : ''}`}
        style={{ color: confirmed ? theme.hudAccent : '#8B93A8' }}
      >
        {confirmed ? t('table.bj.bet.locked') : t('table.bj.bet.pending')}
      </span>
    </div>
  );
}
