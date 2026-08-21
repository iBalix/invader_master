/**
 * Présentation avant la première mise (~66 s, 11 temps de 6 s), identique et
 * synchronisée sur toutes les dalles (horloge serveur).
 *
 * C'est une MANCHE À BLANC : une mini-table joue une manche automatisée sous
 * les yeux des joueurs (mises, donne en cascade, tirer ou rester, croupier,
 * paiement, prime, score), chaque étape étant expliquée d'une phrase. Deux
 * encarts pédagogiques (doubler, jokers) s'intercalent. Personnalisée avec
 * les pseudos réellement assis. « Passer » au vote unanime.
 *
 * L'échelonnement (cascade de cartes, badges) est piloté par le TEMPS écoulé
 * et non par des délais CSS : une dalle qui se réveille en cours d'intro
 * retombe toujours sur l'état exact du moment.
 */

import { useEffect, useState } from 'react';
import { FastForward, Sparkles } from 'lucide-react';
import CardGlyph from '../themes/CardGlyph';
import ChipGlyph from '../themes/ChipGlyph';
import JokerGlyph from './JokerGlyph';
import AnimatedNumber from './AnimatedNumber';
import { serverNow } from '../../../lib/clockSync';
import { JOKER_TYPES } from '../lib/bjTypes';
import type { BjPublicState, BjYou } from '../lib/bjTypes';
import type { BjTheme } from '../themes/types';
import type { TFunction } from '../../../i18n/useT';

interface Props {
  state: BjPublicState;
  you: BjYou | null;
  theme: BjTheme;
  busy: boolean;
  onSkipVote: () => void;
  t: TFunction;
}

const CHAPTER_MS = 6_000;
const CHAPTERS = 11;

/** carte de la manche à blanc, apparition dédiée (transform uniquement) */
function TutoCard({ card, theme, width }: { card: string; theme: BjTheme; width: number }) {
  return (
    <div className="bj-tuto-deal">
      <CardGlyph card={card} theme={theme} width={width} />
    </div>
  );
}

function TotalBadge({ label, color }: { label: string; color: string }) {
  return (
    <span className="bj-tuto-pop whitespace-nowrap rounded-full px-3.5 py-1 font-display text-2xl font-extrabold leading-none" style={{ background: 'rgba(0,0,0,0.6)', color }}>
      {label}
    </span>
  );
}

interface TimedCard {
  card: string;
  /** ms depuis le début de l'intro à partir desquelles la carte est posée */
  at: number;
}

interface TutoSeatProps {
  pseudo: string;
  theme: BjTheme;
  cards: TimedCard[];
  elapsed: number;
  totalLabel: string | null;
  totalColor: string;
  bet: boolean;
  /** bandeau de résultat (paiement) */
  result: { text: string; color: string } | null;
  prime: boolean;
  score: number | null;
  t: TFunction;
}

function TutoSeat({ pseudo, theme, cards, elapsed, totalLabel, totalColor, bet, result, prime, score, t }: TutoSeatProps) {
  const visible = cards.filter((c) => elapsed >= c.at);
  const overlap = 30;
  return (
    <div
      className="relative flex min-h-[248px] w-[350px] flex-col items-center justify-start gap-2 rounded-3xl border-2 px-5 pb-4 pt-3"
      style={{ background: theme.seatBg, borderColor: prime ? theme.gold : theme.seatBorder }}
    >
      <span className="font-display text-2xl font-bold uppercase tracking-wide text-white/95">{pseudo}</span>
      <div className="flex min-h-[112px] items-center" style={{ paddingLeft: overlap / 2 }}>
        {visible.map(({ card }, i) => (
          <div key={`${i}-${card}`} style={{ marginLeft: i === 0 ? 0 : -overlap, zIndex: i }}>
            <TutoCard card={card} theme={theme} width={78} />
          </div>
        ))}
      </div>
      <div className="flex min-h-[40px] items-center gap-2">
        {totalLabel && visible.length > 0 && <TotalBadge label={totalLabel} color={totalColor} />}
        {bet && (
          <span className="bj-tuto-pop flex items-center gap-1.5">
            <ChipGlyph value={20} theme={theme} size={34} />
            <span className="font-display text-xl font-bold text-white/85">20</span>
          </span>
        )}
      </div>
      {score !== null && (
        <span className="bj-tuto-pop flex items-center gap-1.5 rounded-full px-4 py-1.5 font-display text-2xl font-extrabold" style={{ background: `${theme.hudAccent}1E`, color: theme.hudAccent }}>
          <AnimatedNumber value={score} />
        </span>
      )}
      {result && (
        <span className="bj-tuto-pop absolute -top-5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full px-4 py-1.5 font-display text-xl font-extrabold" style={{ background: 'rgba(0,0,0,0.85)', color: result.color }}>
          {result.text}
        </span>
      )}
      {prime && (
        <span className="bj-tuto-pop absolute -bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-full px-4 py-1 font-display text-lg font-extrabold uppercase" style={{ background: theme.gold, color: '#241A05' }}>
          <Sparkles className="h-4 w-4" />
          {t('table.bj.seat.prime')} +200
        </span>
      )}
    </div>
  );
}

export default function TutorialOverlay({ state, you, theme, busy, onSkipVote, t }: Props) {
  const [, forceTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => forceTick((v) => v + 1), 350);
    return () => clearInterval(interval);
  }, []);

  const startedAt = state.phaseStartedAt ?? serverNow();
  const elapsed = Math.max(0, serverNow() - startedAt);
  const step = Math.min(CHAPTERS - 1, Math.floor(elapsed / CHAPTER_MS));
  const progress = Math.min(1, elapsed / (CHAPTERS * CHAPTER_MS));

  const seats = state.seats;
  const p1 = seats[0]?.pseudo ?? 'Marc';
  const p2 = seats[1]?.pseudo ?? 'Julie';
  const seated = you !== null && seats.some((s) => s.playerId === you.playerId);
  const voted = you?.skipVoted ?? false;
  const enabledJokers = JOKER_TYPES.filter((type) => state.config.jokersEnabled?.[type] !== false);

  const text = (key: string) =>
    t(`table.bj.tuto.${key}`)
      .replace('{p1}', p1)
      .replace('{p2}', p2)
      .replace('{prime}', String(state.config.prime));

  const TITLES = ['goal', 'bets', 'deal', 'values', 'hit', 'double', 'dealer', 'payout', 'score', 'jokersAll', 'go'] as const;

  // les 3 dernières secondes : décompte avant la première mise
  const remainMs = Math.max(0, CHAPTERS * CHAPTER_MS - elapsed);
  const countdown = step === 10 && remainMs <= 3_200 ? Math.max(1, Math.ceil(remainMs / 1000)) : null;

  // la timeline de la manche à blanc (ms depuis le début de l'intro)
  const DEAL = 2 * CHAPTER_MS;
  const HIT = 4 * CHAPTER_MS;
  const REVEAL = 6 * CHAPTER_MS;
  const PAY = 7 * CHAPTER_MS;
  const SCORE = 8 * CHAPTER_MS;

  const betsIn = elapsed >= CHAPTER_MS;
  const revealed = elapsed >= REVEAL + 700;
  const paid = elapsed >= PAY + 400;
  const scored = elapsed >= SCORE;

  const p1Cards: TimedCard[] = [
    { card: '9h', at: DEAL + 200 },
    { card: '7s', at: DEAL + 500 },
    { card: '4h', at: HIT + 700 },
  ];
  const p2Cards: TimedCard[] = [
    { card: 'Ah', at: DEAL + 800 },
    { card: 'Kd', at: DEAL + 1100 },
  ];
  const dealerCards: TimedCard[] = revealed
    ? [
        { card: '8c', at: 0 },
        { card: '9d', at: REVEAL + 700 },
      ]
    : [
        { card: '8c', at: DEAL + 1500 },
        { card: '??', at: DEAL + 1800 },
      ];
  const dealerVisible = dealerCards.filter((c) => elapsed >= c.at);
  const p1HasHit = elapsed >= HIT + 700;

  return (
    <div className="pointer-events-auto absolute inset-0 z-40 flex flex-col items-center justify-center gap-6" style={{ background: 'rgba(3,5,12,0.94)' }}>
      {/* progression */}
      <div className="absolute left-1/2 top-6 w-[760px] -translate-x-1/2">
        <div className="h-2.5 w-full overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${progress * 100}%`, background: theme.hudAccent }} />
        </div>
        <div className="mt-2 flex justify-between">
          {Array.from({ length: CHAPTERS }, (_, i) => (
            <span key={i} className="h-2.5 w-2.5 rounded-full" style={{ background: i <= step ? theme.hudAccent : 'rgba(255,255,255,0.18)' }} />
          ))}
        </div>
      </div>

      {/* la manche à blanc */}
      <div
        className="relative flex w-[1150px] flex-col items-center rounded-[40px] border-2 px-14 pb-8 pt-5"
        style={{ background: theme.feltBg, borderColor: theme.seatBorder }}
      >
        {step === 0 ? (
          <div className="flex min-h-[452px] w-full flex-col items-center justify-center gap-7">
            <span
              className="font-display text-8xl font-black uppercase tracking-[0.14em]"
              style={{
                color: theme.gold,
                textShadow: `0 0 34px ${theme.gold}55`,
                opacity: elapsed >= 300 ? 1 : 0,
                transition: 'opacity 500ms ease',
              }}
            >
              {t('table.bj.title')}
            </span>
            <span
              className="max-w-[900px] text-center font-display text-3xl font-bold leading-snug text-white/90"
              style={{ opacity: elapsed >= 1500 ? 1 : 0, transition: 'opacity 500ms ease' }}
            >
              {text('goal')}
            </span>
            <span
              className="max-w-[900px] text-center font-display text-2xl font-bold leading-snug text-white/60"
              style={{ opacity: elapsed >= 3000 ? 1 : 0, transition: 'opacity 500ms ease' }}
            >
              {text('winner')}
            </span>
          </div>
        ) : step >= 9 ? (
          <div className="flex min-h-[452px] w-full items-center justify-center">
            {step === 9 ? (
              <div className="grid grid-cols-3 gap-x-12 gap-y-7">
                {enabledJokers.map((type, i) => (
                  <div key={type} className="flex items-center gap-3" style={{ opacity: elapsed >= 9 * CHAPTER_MS + i * 300 ? 1 : 0, transition: 'opacity 250ms ease' }}>
                    <JokerGlyph type={type} theme={theme} width={64} t={t} compact />
                    <div>
                      <div className="font-display text-xl font-bold uppercase" style={{ color: theme.hudAccent }}>
                        {t(`table.bj.joker.${type}`)}
                      </div>
                      <div className="max-w-[280px] text-base leading-tight text-white/70">{t(`table.bj.joker.${type}.desc`)}</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center gap-6">
                <span
                  className="font-display text-7xl font-black uppercase tracking-[0.12em]"
                  style={{ color: theme.gold, textShadow: `0 0 30px ${theme.gold}55` }}
                >
                  {t('table.bj.tuto.go')}
                </span>
                {countdown !== null && (
                  <span
                    key={countdown}
                    className="bj-pop font-display text-9xl font-black leading-none"
                    style={{ color: theme.hudAccent, textShadow: `0 0 36px ${theme.hudAccent}66` }}
                  >
                    {countdown}
                  </span>
                )}
              </div>
            )}
          </div>
        ) : (
          <>
        {/* croupier */}
        <div className="flex min-h-[190px] flex-col items-center gap-2">
          <span className="font-display text-xl font-bold uppercase tracking-[0.25em]" style={{ color: theme.feltText }}>
            {t('table.bj.dealer')}
          </span>
          <div className="flex min-h-[112px] items-center">
            {dealerVisible.map(({ card }, i) => (
              <div key={`${i}-${card}`} style={{ marginLeft: i === 0 ? 0 : -30, zIndex: i }}>
                <TutoCard card={card} theme={theme} width={78} />
              </div>
            ))}
          </div>
          {revealed && <TotalBadge label="17" color="#EDF0F7" />}
        </div>

        {/* les deux joueurs de la démonstration */}
        <div className="mt-2 flex w-full items-start justify-between px-6">
          <TutoSeat
            pseudo={p1}
            theme={theme}
            cards={p1Cards}
            elapsed={elapsed}
            totalLabel={p1HasHit ? '20' : '16'}
            totalColor={p1HasHit ? theme.hudAccent : '#FF9F3D'}
            bet={betsIn}
            result={paid ? { text: `${t('table.bj.outcome.win')} +20`, color: theme.gold } : null}
            prime={false}
            score={scored ? 540 : null}
            t={t}
          />
          <TutoSeat
            pseudo={p2}
            theme={theme}
            cards={p2Cards}
            elapsed={elapsed}
            totalLabel="21"
            totalColor={theme.gold}
            bet={betsIn}
            result={paid ? { text: `${t('table.bj.outcome.blackjack')} +30`, color: theme.gold } : null}
            prime={paid}
            score={scored ? 750 : null}
            t={t}
          />
        </div>

        {/* encart pédagogique : doubler */}
        {step === 5 && (
          <div className="bj-tuto-pop absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-6 rounded-3xl border-2 px-12 py-8" style={{ background: 'rgba(4,6,14,0.94)', borderColor: theme.gold }}>
            <ChipGlyph value={50} theme={theme} size={64} />
            <span className="font-display text-6xl font-black" style={{ color: theme.gold }}>
              x2
            </span>
            <div className="flex items-center">
              <CardGlyph card="6h" theme={theme} width={72} />
              <div style={{ marginLeft: -28 }}>
                <CardGlyph card="5s" theme={theme} width={72} />
              </div>
              {elapsed >= 5 * CHAPTER_MS + 900 && (
                <div className="bj-tuto-deal" style={{ marginLeft: 10 }}>
                  <CardGlyph card="back" theme={theme} width={72} />
                </div>
              )}
            </div>
          </div>
        )}

          </>
        )}
      </div>

      {/* l'explication de l'étape (portée par l'écran central aux extrémités) */}
      {step > 0 && step < 10 ? (
        <div key={step} className="bj-chapter-in max-w-[1240px] px-10 text-center font-display text-4xl font-bold leading-snug text-white">
          {text(TITLES[step])}
        </div>
      ) : (
        <div className="h-[60px]" />
      )}

      {/* vote passer */}
      {seated && (
        <button
          className="absolute bottom-8 right-10 flex items-center gap-3 rounded-2xl border-2 px-9 py-5 font-display text-2xl font-bold uppercase active:scale-95"
          style={{
            borderColor: voted ? theme.hudAccent : 'rgba(255,255,255,0.28)',
            color: voted ? theme.hudAccent : '#EDF0F7',
            background: voted ? `${theme.hudAccent}14` : 'rgba(255,255,255,0.06)',
          }}
          disabled={busy || voted}
          onClick={onSkipVote}
        >
          <FastForward className="h-7 w-7" />
          {t('table.bj.tuto.skip')} ({state.skipVotes.length}/{seats.length})
        </button>
      )}
      {!seated && state.skipVotes.length > 0 && (
        <span className="absolute bottom-9 right-10 text-xl font-bold uppercase text-white/55">
          {t('table.bj.tuto.skip')} {state.skipVotes.length}/{seats.length}
        </span>
      )}
    </div>
  );
}
