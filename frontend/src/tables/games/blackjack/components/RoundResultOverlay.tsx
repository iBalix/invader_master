/**
 * Bandeau de résolution de manche (phase payout, ~9 s) : total du croupier,
 * prime de manche, jokers gagnés. Les deltas par main flottent déjà sur les
 * sièges ; ici, le collectif.
 */

import { Sparkles } from 'lucide-react';
import type { BjPublicState } from '../lib/bjTypes';
import type { BjTheme } from '../themes/types';
import type { TFunction } from '../../../i18n/useT';

interface Props {
  state: BjPublicState;
  theme: BjTheme;
  t: TFunction;
}

export default function RoundResultOverlay({ state, theme, t }: Props) {
  const round = state.lastRound;
  if (!round || state.status !== 'payout') return null;
  const winners = round.hands
    .filter((h) => round.primeWinners.includes(h.playerId))
    .map((h) => h.pseudo);
  const uniqueWinners = Array.from(new Set(winners));

  return (
    <div className="pointer-events-none absolute left-1/2 top-[30%] z-20 -translate-x-1/2">
      <div
        className="bj-pop flex flex-col items-center gap-2 rounded-3xl border px-8 py-4"
        style={{ background: 'rgba(4,6,14,0.82)', borderColor: theme.seatBorder }}
      >
        <div className="font-display text-sm font-bold uppercase tracking-[0.18em] text-white/60">
          {t('table.bj.result.dealer')} {round.dealerTotal}
          {round.dealerBust ? ` · ${t('table.bj.dealer.bust')}` : ''}
        </div>
        {uniqueWinners.length > 0 ? (
          <div className="flex items-center gap-2.5 font-display text-2xl font-extrabold uppercase" style={{ color: theme.gold }}>
            <Sparkles className="h-6 w-6" />
            <span>
              {t('table.bj.result.prime')
                .replace('{pseudo}', uniqueWinners.join(' + '))
                .replace('{amount}', String(Math.floor(round.primeAmount / Math.max(1, round.primeWinners.length))))}
            </span>
            <Sparkles className="h-6 w-6" />
          </div>
        ) : (
          <div className="font-display text-xl font-bold uppercase text-white/55">
            {t('table.bj.result.noPrime')}
          </div>
        )}
        {round.jokerAwards.length > 0 && (
          <div className="flex flex-wrap items-center justify-center gap-2">
            {round.jokerAwards.slice(0, 4).map((award, i) => (
              <span
                key={i}
                className="bj-pop rounded-full px-2.5 py-1 text-xs font-bold"
                style={{ background: `${theme.hudAccent}1C`, color: theme.hudAccent, animationDelay: `${300 + i * 220}ms` }}
              >
                {award.pseudo} {award.toChips ? t('table.bj.result.jokerChips') : t('table.bj.result.jokerGain')} ·{' '}
                {t(`table.bj.award.${award.reason}`)}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
