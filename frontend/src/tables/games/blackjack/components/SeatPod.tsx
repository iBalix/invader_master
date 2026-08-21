/**
 * Siège d'un joueur autour de la table : pseudo + table d'origine, mains,
 * jetons, score en direct, jokers (compte public, contenu privé), bouclier,
 * chrono du tour. Le pod du joueur actif s'allume, les autres s'estompent
 * légèrement pendant son tour.
 */

import { forwardRef } from 'react';
import { Crown, Shield, Star } from 'lucide-react';
import AnimatedNumber from './AnimatedNumber';
import ChipStack from './ChipStack';
import HandFan from './HandFan';
import TimerRing from './TimerRing';
import { tableOriginLabel } from '../lib/ring';
import type { BjPublicState, BjSeatView } from '../lib/bjTypes';
import type { BjTheme } from '../themes/types';
import type { AnchorRegistry } from '../lib/anchors';
import type { TFunction } from '../../../i18n/useT';

interface Props {
  seat: BjSeatView;
  state: BjPublicState;
  theme: BjTheme;
  isViewer: boolean;
  /** meilleur score de la table */
  isLeader: boolean;
  /** cascade de distribution : délais par (main, carte) */
  dealDelays?: number[][];
  animate: boolean;
  anchors?: AnchorRegistry;
  reduced?: boolean;
  /** vainqueur de la prime au paiement */
  primeWinner: boolean;
  /** halo de gain (delta > 0 au paiement) */
  winFlash: boolean;
  t: TFunction;
}

const SeatPod = forwardRef<HTMLDivElement, Props>(function SeatPod(
  { seat, state, theme, isViewer, isLeader, dealDelays, animate, anchors, reduced, primeWinner, winFlash, t },
  ref,
) {
  const isTurn = state.turn?.playerId === seat.playerId;
  const turnHand = isTurn ? state.turn!.hand : -1;
  const betting = state.status === 'betting';
  const payout = state.status === 'payout';
  const cardWidth = isViewer ? 58 : 46;
  const someoneActing = state.status === 'acting' && state.turn !== null;
  const faded = someoneActing && !isTurn && !isViewer;

  // chrono du tour : deadline serveur, plafonnée par le cap de la main
  const deadline =
    isTurn && state.phaseEndsAt
      ? state.turn?.capAt
        ? Math.min(state.phaseEndsAt, state.turn.capAt)
        : state.phaseEndsAt
      : null;

  return (
    <div
      ref={ref}
      className={`bj-seat ${animate ? 'bj-seat-arrive' : ''} ${winFlash && !reduced ? 'bj-win-halo' : ''}`}
      style={{ ['--bj-accent-soft' as string]: `${theme.hudAccent}88`, opacity: faded ? 0.72 : 1 }}
    >
      <div
        className={`relative flex flex-col items-center gap-1 rounded-2xl border px-3 pb-2 pt-1.5 ${isTurn && !reduced ? 'bj-seat-ping' : ''}`}
        style={{
          background: theme.seatBg,
          borderColor: isTurn ? theme.hudAccent : primeWinner ? theme.gold : theme.seatBorder,
          borderWidth: isTurn || primeWinner ? 2 : 1,
          minWidth: isViewer ? 220 : 176,
          boxShadow: isTurn ? `0 0 18px ${theme.hudAccent}44` : undefined,
        }}
      >
        {/* entête : pseudo, origine, couronne, bouclier, badge créateur */}
        <div className="flex max-w-[240px] items-center gap-1.5">
          {isLeader && <Crown className="h-4 w-4 shrink-0" style={{ color: theme.gold }} />}
          <span
            className="truncate font-display text-base font-bold uppercase tracking-wide"
            style={{ color: isViewer ? theme.hudAccent : '#EDF0F7' }}
          >
            {seat.pseudo}
          </span>
          {tableOriginLabel(seat.device) && (
            <span className="shrink-0 rounded bg-white/10 px-1 py-0.5 text-[10px] font-bold text-white/70">
              {tableOriginLabel(seat.device)}
            </span>
          )}
          {seat.isCreator && <Star className="h-3.5 w-3.5 shrink-0 text-white/50" />}
          {seat.shield && <Shield className="h-4 w-4 shrink-0" style={{ color: theme.hudAccent }} />}
        </div>

        {/* mains (ou attente) */}
        {seat.hands.length > 0 ? (
          <div className="flex items-start gap-2">
            {seat.hands.map((hand, hi) => (
              <div key={hi} className={seat.hands.length > 1 ? (turnHand === hi ? '' : 'opacity-75') : ''}>
                <HandFan
                  hand={hand}
                  theme={theme}
                  cardWidth={seat.hands.length > 1 ? cardWidth - 8 : cardWidth}
                  active={turnHand === hi}
                  dealDelays={dealDelays?.[hi]}
                  animate={animate}
                  anchors={anchors}
                  reduced={reduced}
                  showOutcome={payout}
                  t={t}
                />
              </div>
            ))}
          </div>
        ) : betting ? (
          <div className="flex h-[70px] items-center" style={{ color: seat.hasBet ? theme.hudAccent : '#8B93A8' }}>
            {seat.hasBet && seat.betInput !== null ? (
              <ChipStack amount={seat.betInput} theme={theme} chipSize={24} />
            ) : (
              <span className="text-sm font-semibold">{t('table.bj.seat.betting')}</span>
            )}
          </div>
        ) : seat.joinPending ? (
          <div className="flex h-[70px] items-center px-2 text-center text-xs font-semibold" style={{ color: '#8B93A8' }}>
            {t('table.bj.seat.pending')}
          </div>
        ) : (
          <div className="h-[8px]" />
        )}

        {/* pied : jetons, score, manches gagnées, jokers */}
        <div className="flex w-full items-center justify-between gap-2 border-t border-white/8 pt-1">
          <div className="flex items-center gap-1 text-sm font-bold" style={{ color: '#D7DCEA' }}>
            <svg width="13" height="13" viewBox="0 0 48 48" aria-hidden>
              <circle cx="24" cy="24" r="21" fill="none" stroke={theme.hudAccent} strokeWidth="6" strokeDasharray="10 7" />
              <circle cx="24" cy="24" r="10" fill={theme.hudAccent} />
            </svg>
            <AnimatedNumber value={seat.chips} />
          </div>
          <div className="flex items-center gap-1.5">
            {seat.roundsWon > 0 && (
              <span className="text-[11px] font-bold" style={{ color: theme.gold }}>
                {seat.roundsWon}★
              </span>
            )}
            <span className="rounded-full px-2 py-0.5 font-display text-sm font-extrabold" style={{ background: `${theme.hudAccent}1E`, color: theme.hudAccent }}>
              <AnimatedNumber value={seat.score} />
            </span>
          </div>
        </div>

        {/* jokers : compte public en pastilles face cachée */}
        {state.config.jokerFrequency !== undefined && seat.jokerCount > 0 && (
          <div className="absolute -bottom-2 left-1/2 flex -translate-x-1/2 gap-1">
            {Array.from({ length: seat.jokerCount }, (_, i) => (
              <span
                key={i}
                className="bj-pop h-3.5 w-2.5 rounded-[2px] border"
                style={{ background: theme.seatBg, borderColor: theme.hudAccent, animationDelay: `${i * 60}ms` }}
              />
            ))}
          </div>
        )}

        {/* badges d'état */}
        {seat.lanterne && (
          <span className="absolute -top-2.5 left-2 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase" style={{ background: `${theme.danger}2E`, color: theme.danger }}>
            {t('table.bj.seat.lanterne')}
          </span>
        )}
        {seat.attacksReceived >= 2 && state.status === 'acting' && (
          <span className="absolute -top-2.5 right-2 rounded-full bg-white/12 px-2 py-0.5 text-[10px] font-bold uppercase text-white/70">
            {t('table.bj.seat.protected')}
          </span>
        )}
        {primeWinner && (
          <span className="bj-pop absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full px-2.5 py-0.5 font-display text-xs font-extrabold uppercase" style={{ background: theme.gold, color: '#241A05' }}>
            {t('table.bj.seat.prime')}
          </span>
        )}

        {/* chrono du joueur actif, visible de tous */}
        {isTurn && deadline !== null && (
          <div className="absolute -right-5 -top-5">
            <TimerRing
              endsAt={deadline}
              totalMs={state.config.decisionMs}
              color={theme.hudAccent}
              dangerColor={theme.danger}
              size={44}
              reduced={reduced}
            />
          </div>
        )}
      </div>
    </div>
  );
});

export default SeatPod;
