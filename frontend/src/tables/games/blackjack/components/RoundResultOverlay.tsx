/**
 * Bandeau de résolution de manche (phase payout, ~9 s) : total du croupier,
 * prime de manche, puis la LISTE des gains de jokers, un par ligne avec son
 * picto (carte face cachée = joker gagné, jeton = converti en jetons).
 * Les deltas par main flottent déjà sur les sièges ; ici, le collectif.
 */

import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import ChipGlyph from '../themes/ChipGlyph';
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
  const inPayout = state.status === 'payout';
  const roundIndex = round?.roundIndex ?? -1;
  const dealerBust = round?.dealerBust ?? false;
  // le récap attend son tour : quand le croupier saute, la bannière plein
  // écran joue d'abord (~2,6 s), sinon un court battement suffit
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!inPayout || roundIndex < 0) {
      setShown(false);
      return undefined;
    }
    setShown(false);
    const timer = window.setTimeout(() => setShown(true), dealerBust ? 2500 : 500);
    return () => window.clearTimeout(timer);
  }, [inPayout, roundIndex, dealerBust]);

  if (!round || !inPayout || !shown) return null;
  const winners = round.hands
    .filter((h) => round.primeWinners.includes(h.playerId))
    .map((h) => h.pseudo);
  const uniqueWinners = Array.from(new Set(winners));

  return (
    <div className="pointer-events-none absolute left-1/2 top-[30%] z-20 -translate-x-1/2">
      <div
        className="bj-pop flex flex-col items-center gap-3 rounded-3xl border-2 px-12 py-6"
        style={{ background: 'rgba(4,6,14,0.86)', borderColor: theme.seatBorder }}
      >
        <div className="font-display text-xl font-bold uppercase tracking-[0.18em] text-white/60">
          {t('table.bj.result.dealer')} {round.dealerTotal}
          {round.dealerBust ? ` · ${t('table.bj.dealer.bust')}` : ''}
        </div>
        {uniqueWinners.length > 0 ? (
          <div className="flex items-center gap-3 font-display text-4xl font-extrabold uppercase" style={{ color: theme.gold }}>
            <Sparkles className="h-9 w-9" />
            <span>
              {t('table.bj.result.prime')
                .replace('{pseudo}', uniqueWinners.join(' + '))
                .replace('{amount}', String(Math.floor(round.primeAmount / Math.max(1, round.primeWinners.length))))}
            </span>
            <Sparkles className="h-9 w-9" />
          </div>
        ) : (
          <div className="font-display text-3xl font-bold uppercase text-white/55">
            {t('table.bj.result.noPrime')}
          </div>
        )}

        {/* les gains de jokers : une ligne claire par gain */}
        {round.jokerAwards.length > 0 && (
          <div className="mt-1 flex flex-col items-start gap-2 border-t border-white/10 pt-3">
            {round.jokerAwards.slice(0, 5).map((award, i) => (
              <div
                key={i}
                className="bj-pop flex items-center gap-3 text-xl"
                style={{ animationDelay: `${300 + i * 220}ms` }}
              >
                {award.toChips ? (
                  <ChipGlyph value={25} theme={theme} size={30} />
                ) : (
                  <span
                    className="flex h-[30px] w-[21px] shrink-0 items-center justify-center rounded-[4px] border-2 font-display text-sm font-black"
                    style={{ background: theme.seatBg, borderColor: theme.hudAccent, color: theme.hudAccent }}
                  >
                    ?
                  </span>
                )}
                <span className="text-white/90">
                  <span className="font-display font-bold" style={{ color: theme.hudAccent }}>
                    {award.pseudo}
                  </span>{' '}
                  {award.toChips ? t('table.bj.result.jokerChips') : t('table.bj.result.jokerGain')}
                  <span className="text-white/55"> · {t(`table.bj.award.${award.reason}`)}</span>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
