/**
 * Résolution de manche (phase payout, ~9 s), en deux blocs :
 *   - à gauche, MA manche : ma mise, ce que j'ai gagné ou perdu en jetons,
 *     la prime si je l'ai raflée, le joker gagné, et mon bilan net ;
 *   - à droite, LA TABLE : le croupier, qui prend la prime, et les jokers
 *     gagnés par les autres.
 * Un spectateur (ou un siège sans main) ne voit que le bloc table.
 */

import { useEffect, useState } from 'react';
import { Sparkles, Trophy } from 'lucide-react';
import ChipGlyph from '../themes/ChipGlyph';
import type { BjPublicState } from '../lib/bjTypes';
import type { BjTheme } from '../themes/types';
import type { TFunction } from '../../../i18n/useT';

interface Props {
  state: BjPublicState;
  theme: BjTheme;
  /** joueur local (null = spectateur) */
  myId: string | null;
  t: TFunction;
}

const OUTCOME_LABEL: Record<string, string> = {
  blackjack: 'table.bj.outcome.blackjack',
  win: 'table.bj.outcome.win',
  push: 'table.bj.outcome.push',
  lose: 'table.bj.outcome.lose',
  bust: 'table.bj.outcome.bust',
};

function JokerCardIcon({ theme }: { theme: BjTheme }) {
  return (
    <span
      className="flex h-[30px] w-[21px] shrink-0 items-center justify-center rounded-[4px] border-2 font-display text-sm font-black"
      style={{ background: theme.seatBg, borderColor: theme.hudAccent, color: theme.hudAccent }}
    >
      ?
    </span>
  );
}

export default function RoundResultOverlay({ state, theme, myId, t }: Props) {
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

  const winners = Array.from(
    new Set(round.hands.filter((h) => round.primeWinners.includes(h.playerId)).map((h) => h.pseudo)),
  );
  const primeShare = Math.floor(round.primeAmount / Math.max(1, round.primeWinners.length));

  // ma manche : mains encore présentes sur mon siège (mise + delta + issue)
  const mySeat = myId ? state.seats.find((s) => s.playerId === myId) ?? null : null;
  const myHands = mySeat?.hands.filter((h) => h.outcome !== null && h.outcome !== undefined) ?? [];
  const iWonPrime = myId !== null && round.primeWinners.includes(myId);
  const myAwards = myId ? round.jokerAwards.filter((a) => a.playerId === myId) : [];
  const othersAwards = round.jokerAwards.filter((a) => a.playerId !== myId).slice(0, 4);
  const myNet = myHands.reduce((sum, h) => sum + (h.delta ?? 0), 0) + (iWonPrime ? primeShare : 0);
  const showMine = mySeat !== null && myHands.length > 0;

  const lineText = 'flex items-center gap-3 text-xl text-white/90';

  return (
    <div className="pointer-events-none absolute left-1/2 top-[27%] z-20 -translate-x-1/2">
      <div className="bj-pop flex items-stretch gap-5">
        {/* ma manche */}
        {showMine && (
          <div
            className="flex min-w-[380px] flex-col gap-2.5 rounded-3xl border-2 px-8 py-5"
            style={{ background: 'rgba(4,6,14,0.88)', borderColor: `${theme.hudAccent}66` }}
          >
            <div className="font-display text-lg font-bold uppercase tracking-[0.18em]" style={{ color: theme.hudAccent }}>
              {t('table.bj.result.mine')}
            </div>
            {myHands.map((hand, i) => (
              <div key={i} className={lineText}>
                <ChipGlyph value={hand.bet} theme={theme} size={30} />
                <span className="text-white/60">
                  {t('table.bj.result.bet')} {hand.bet}
                </span>
                <span className="ml-auto font-display text-2xl font-extrabold" style={{ color: hand.outcome === 'push' ? '#CBD2E0' : (hand.delta ?? 0) > 0 ? theme.gold : theme.danger }}>
                  {t(OUTCOME_LABEL[hand.outcome ?? 'push'])}
                  {hand.delta ? ` ${hand.delta > 0 ? '+' : ''}${hand.delta}` : ''}
                </span>
              </div>
            ))}
            {iWonPrime && (
              <div className={lineText}>
                <Sparkles className="h-7 w-7" style={{ color: theme.gold }} />
                <span>{t('table.bj.result.minePrime')}</span>
                <span className="ml-auto font-display text-2xl font-extrabold" style={{ color: theme.gold }}>
                  +{primeShare}
                </span>
              </div>
            )}
            {myAwards.map((award, i) => (
              <div key={`aw-${i}`} className={lineText}>
                {award.toChips ? <ChipGlyph value={25} theme={theme} size={30} /> : <JokerCardIcon theme={theme} />}
                <span>{award.toChips ? t('table.bj.result.jokerChips') : t('table.bj.result.mineJoker')}</span>
                <span className="ml-auto text-base text-white/50">{t(`table.bj.award.${award.reason}`)}</span>
              </div>
            ))}
            <div className="mt-1 flex items-center justify-between border-t border-white/12 pt-2.5">
              <span className="font-display text-lg font-bold uppercase tracking-wide text-white/60">
                {t('table.bj.result.net')}
              </span>
              <span className="font-display text-4xl font-black" style={{ color: myNet > 0 ? theme.gold : myNet < 0 ? theme.danger : '#CBD2E0' }}>
                {myNet > 0 ? '+' : ''}
                {myNet}
              </span>
            </div>
          </div>
        )}

        {/* la table */}
        <div
          className="flex min-w-[400px] flex-col gap-2.5 rounded-3xl border px-8 py-5"
          style={{ background: 'rgba(4,6,14,0.86)', borderColor: theme.seatBorder }}
        >
          <div className="font-display text-lg font-bold uppercase tracking-[0.18em] text-white/50">
            {t('table.bj.result.table')}
          </div>
          <div className={lineText}>
            <span className="text-white/60">{t('table.bj.result.dealer')}</span>
            <span className="ml-auto font-display text-2xl font-extrabold" style={{ color: round.dealerBust ? theme.danger : '#EDF0F7' }}>
              {round.dealerTotal}
              {round.dealerBust ? ` · ${t('table.bj.dealer.bust')}` : ''}
            </span>
          </div>
          <div className={lineText}>
            <Sparkles className="h-7 w-7" style={{ color: theme.gold }} />
            {winners.length > 0 ? (
              <>
                <span style={{ color: theme.gold }} className="font-display font-bold">
                  {winners.join(' + ')}
                </span>
                <span className="ml-auto font-display text-2xl font-extrabold" style={{ color: theme.gold }}>
                  <Trophy className="mr-1 inline h-5 w-5" />+{primeShare}
                </span>
              </>
            ) : (
              <span className="text-white/55">{t('table.bj.result.noPrime')}</span>
            )}
          </div>
          {othersAwards.map((award, i) => (
            <div key={i} className={lineText}>
              {award.toChips ? <ChipGlyph value={25} theme={theme} size={30} /> : <JokerCardIcon theme={theme} />}
              <span>
                <span className="font-display font-bold" style={{ color: theme.hudAccent }}>
                  {award.pseudo}
                </span>{' '}
                {award.toChips ? t('table.bj.result.jokerChips') : t('table.bj.result.jokerGain')}
              </span>
              <span className="ml-auto text-base text-white/50">{t(`table.bj.award.${award.reason}`)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
