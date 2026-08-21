/**
 * Temps forts plein écran, diffusés au même instant sur toutes les dalles :
 * BLACKJACK, grosse mise annoncée, croupier qui saute, dernière manche,
 * nouveau sabot. Une bannière à la fois, file d'attente courte.
 */

import { useEffect, useRef, useState } from 'react';
import type { BjPublicState } from '../lib/bjTypes';
import type { BjTheme } from '../themes/types';
import type { TFunction } from '../../../i18n/useT';

interface Moment {
  key: string;
  text: string;
  sub?: string;
  color: string;
  shockwave: boolean;
  holdMs: number;
}

interface Props {
  state: BjPublicState;
  theme: BjTheme;
  reduced?: boolean;
  t: TFunction;
}

export default function BigMomentLayer({ state, theme, reduced, t }: Props) {
  const [current, setCurrent] = useState<Moment | null>(null);
  const queue = useRef<Moment[]>([]);
  const seen = useRef<Set<string>>(new Set());
  const prevStatus = useRef<string | null>(null);
  const prevDealerTotal = useRef<number | null>(null);
  const timer = useRef<number | null>(null);
  const firstPaint = useRef(true);

  function enqueue(moment: Moment) {
    if (seen.current.has(moment.key)) return;
    seen.current.add(moment.key);
    if (seen.current.size > 200) seen.current.clear();
    queue.current.push(moment);
  }

  function playNext() {
    if (timer.current !== null) return;
    const next = queue.current.shift();
    if (!next) return;
    setCurrent(next);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setCurrent(null);
      window.setTimeout(playNext, 120);
    }, next.holdMs + 700);
  }

  useEffect(() => {
    const status = state.status;
    const round = state.roundIndex;

    // premier rendu : on note l'état sans rejouer les moments passés
    if (firstPaint.current) {
      firstPaint.current = false;
      prevStatus.current = status;
      prevDealerTotal.current = state.dealer.total;
      return;
    }

    if (status !== prevStatus.current) {
      if (status === 'acting' && (prevStatus.current === 'dealing' || prevStatus.current === 'betting')) {
        // grosses mises annoncées (seuil 80 % du max), puis blackjacks
        const threshold = state.config.maxBet * 0.8;
        for (const seat of state.seats) {
          const bet = seat.hands[0]?.bet ?? 0;
          if (bet >= threshold && bet >= state.config.minBet * 2) {
            enqueue({
              key: `bigbet:${round}:${seat.playerId}`,
              text: t('table.bj.moment.bigbet').replace('{pseudo}', seat.pseudo).replace('{amount}', String(bet)),
              color: theme.hudAccent,
              shockwave: false,
              holdMs: 1400,
            });
          }
        }
        for (const seat of state.seats) {
          if (seat.hands.some((h) => h.blackjack)) {
            enqueue({
              key: `bj:${round}:${seat.playerId}`,
              text: 'BLACKJACK',
              sub: seat.pseudo,
              color: theme.gold,
              shockwave: true,
              holdMs: 2100,
            });
          }
        }
      }
      if (status === 'betting') {
        if (state.shoeRefilled) {
          enqueue({
            key: `shoe:${round}`,
            text: t('table.bj.moment.shoe'),
            color: theme.feltText,
            shockwave: false,
            holdMs: 1200,
          });
        }
        if (state.isLastRound) {
          enqueue({
            key: `last:${round}`,
            text: t('table.bj.moment.lastRound'),
            sub: t('table.bj.moment.lastRoundSub').replace('{prime}', String(state.config.prime * 2)),
            color: theme.gold,
            shockwave: !reduced,
            holdMs: 2400,
          });
        }
      }
      if (status === 'payout' && state.nextIsLast && !state.isLastRound && !state.endAfterRound) {
        enqueue({
          key: `nextlast:${round}`,
          text: t('table.bj.moment.nextLast'),
          color: theme.hudAccent,
          shockwave: false,
          holdMs: 1800,
        });
      }
      prevStatus.current = status;
    }

    // croupier qui saute : le total public dépasse 21 pendant sa séquence
    if (status === 'dealer' && state.dealer.total !== null) {
      if (state.dealer.total > 21 && (prevDealerTotal.current ?? 0) <= 21) {
        enqueue({
          key: `dbust:${round}`,
          text: t('table.bj.moment.dealerBust'),
          color: theme.danger,
          shockwave: !reduced,
          holdMs: 2000,
        });
      }
      prevDealerTotal.current = state.dealer.total;
    } else {
      prevDealerTotal.current = state.dealer.total;
    }

    playNext();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.v]);

  useEffect(() => () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
  }, []);

  if (!current) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-30 flex items-center justify-center">
      {current.shockwave && !reduced && (
        <div className="bj-shockwave" style={{ border: `3px solid ${current.color}`, background: `radial-gradient(circle, ${current.color}14 0%, transparent 65%)` }} />
      )}
      <div
        className="bj-banner flex flex-col items-center gap-1 rounded-3xl border-2 px-14 py-6"
        style={{
          background: 'rgba(4,6,14,0.88)',
          borderColor: current.color,
          boxShadow: reduced ? undefined : `0 0 42px ${current.color}55`,
          ['--bj-banner-hold' as string]: `${current.holdMs}ms`,
        }}
      >
        <span className="font-display text-6xl font-black uppercase tracking-wider" style={{ color: current.color, textShadow: reduced ? undefined : `0 0 22px ${current.color}88` }}>
          {current.text}
        </span>
        {current.sub && (
          <span className="font-display text-2xl font-bold uppercase tracking-wide text-white/90">{current.sub}</span>
        )}
      </div>
    </div>
  );
}
