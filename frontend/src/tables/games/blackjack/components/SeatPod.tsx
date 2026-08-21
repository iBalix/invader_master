/**
 * Siège d'un joueur autour de la table, volontairement épuré : le pseudo
 * (couronne si premier), la ou les mains, le score de la course, le compte
 * de jokers (mini-carte face cachée ×N) et, SOUS le pod, le tapis de jetons
 * en piles physiques. Mon propre pod est teinté à la couleur du thème, et
 * s'embrase quand c'est à moi de jouer.
 */

import { forwardRef } from 'react';
import { Crown, Shield, Trophy } from 'lucide-react';
import AnimatedNumber from './AnimatedNumber';
import ChipPiles from './ChipPiles';
import ChipStack from './ChipStack';
import HandFan from './HandFan';
import TimerRing from './TimerRing';
import type { BjPublicState, BjSeatView } from '../lib/bjTypes';
import type { BjTheme } from '../themes/types';
import type { AnchorRegistry } from '../lib/anchors';
import type { TFunction } from '../../../i18n/useT';

interface Props {
  seat: BjSeatView;
  state: BjPublicState;
  theme: BjTheme;
  isViewer: boolean;
  /** largeur des cartes de ce pod (calculée selon le nombre de sièges) */
  cardWidth: number;
  /** meilleur score de la table (unique) */
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
  {
    seat,
    state,
    theme,
    isViewer,
    cardWidth,
    isLeader,
    dealDelays,
    animate,
    anchors,
    reduced,
    primeWinner,
    winFlash,
    t,
  },
  ref,
) {
  const isTurn = state.turn?.playerId === seat.playerId;
  const turnHand = isTurn ? state.turn!.hand : -1;
  const betting = state.status === 'betting';
  const payout = state.status === 'payout';
  const someoneActing = state.status === 'acting' && state.turn !== null;
  const faded = someoneActing && !isTurn && !isViewer;
  const split = seat.hands.length >= 2;

  // chrono du tour : deadline serveur, plafonnée par le cap de la main
  const deadline =
    isTurn && state.phaseEndsAt
      ? state.turn?.capAt
        ? Math.min(state.phaseEndsAt, state.turn.capAt)
        : state.phaseEndsAt
      : null;

  // mon pod porte la couleur du thème en permanence, encore plus à mon tour
  const borderColor = isTurn ? theme.hudAccent : primeWinner ? theme.gold : isViewer ? `${theme.hudAccent}99` : theme.seatBorder;
  const glow = isTurn
    ? `0 0 26px ${theme.hudAccent}66`
    : isViewer && !reduced
      ? `0 0 16px ${theme.hudAccent}33`
      : undefined;

  return (
    <div
      ref={ref}
      className={`bj-seat ${animate ? 'bj-seat-arrive' : ''} ${winFlash && !reduced ? 'bj-win-halo' : ''}`}
      style={{ ['--bj-accent-soft' as string]: `${theme.hudAccent}88`, opacity: faded ? 0.72 : 1 }}
    >
      <div
        className={`relative flex flex-col items-center gap-1.5 rounded-3xl border px-4 pb-3 pt-2 ${isTurn && !reduced ? 'bj-seat-ping' : ''}`}
        style={{
          background: theme.seatBg,
          borderColor,
          borderWidth: isTurn || primeWinner ? 2.5 : isViewer ? 2 : 1.5,
          // proportionnelle aux cartes : la densité s'adapte au nombre de sièges
          minWidth: Math.round(cardWidth * 3.3),
          boxShadow: glow,
        }}
      >
        {/* entête : pseudo, couronne du premier, bouclier armé */}
        <div className="flex max-w-[340px] items-center gap-2">
          {isLeader && <Crown className="h-6 w-6 shrink-0" style={{ color: theme.gold }} />}
          <span
            className={`truncate font-display font-bold uppercase tracking-wide ${isViewer ? 'text-2xl' : 'text-xl'}`}
            style={{ color: isViewer ? theme.hudAccent : '#EDF0F7' }}
          >
            {seat.pseudo}
          </span>
          {seat.shield && <Shield className="h-6 w-6 shrink-0" style={{ color: theme.hudAccent }} />}
        </div>

        {/* mains (ou attente) */}
        {seat.hands.length > 0 ? (
          <div className="flex items-start gap-3">
            {seat.hands.map((hand, hi) => (
              <div key={hi} className={split ? (turnHand === hi ? '' : 'opacity-75') : ''}>
                <HandFan
                  hand={hand}
                  theme={theme}
                  cardWidth={split ? Math.round(cardWidth * 0.85) : cardWidth}
                  active={turnHand === hi}
                  dealDelays={dealDelays?.[hi]}
                  animate={animate}
                  anchors={anchors}
                  reduced={reduced}
                  showOutcome={payout}
                  splitPhase={split ? (hi === 0 ? 'kept' : 'new') : null}
                  t={t}
                />
              </div>
            ))}
          </div>
        ) : betting ? (
          <div className="flex h-[96px] items-center" style={{ color: seat.hasBet ? theme.hudAccent : '#8B93A8' }}>
            {seat.hasBet && seat.betInput !== null ? (
              <ChipStack amount={seat.betInput} theme={theme} chipSize={34} />
            ) : (
              <span className="text-lg font-semibold">{t('table.bj.seat.betting')}</span>
            )}
          </div>
        ) : seat.joinPending ? (
          <div className="flex h-[96px] items-center px-2 text-center text-base font-semibold" style={{ color: '#8B93A8' }}>
            {t('table.bj.seat.pending')}
          </div>
        ) : (
          <div className="h-[10px]" />
        )}

        {/* pied : jokers en main (compte public) et score de la course */}
        <div className="flex w-full items-center justify-between gap-3 border-t border-white/8 pt-1.5">
          <div className="flex items-center gap-1.5">
            {seat.jokerCount > 0 && (
              <>
                <span
                  className="bj-pop flex h-[30px] w-[21px] items-center justify-center rounded-[4px] border-2 font-display text-sm font-black"
                  style={{ background: theme.seatBg, borderColor: theme.hudAccent, color: theme.hudAccent }}
                >
                  ?
                </span>
                <span className="font-display text-lg font-bold" style={{ color: theme.hudAccent }}>
                  ×{seat.jokerCount}
                </span>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            {seat.roundsWon > 0 && (
              <span className="text-base font-bold" style={{ color: theme.gold }}>
                {seat.roundsWon}★
              </span>
            )}
            <span
              className="flex items-center gap-1.5 rounded-full px-3 py-1 font-display text-xl font-extrabold"
              style={{ background: `${theme.hudAccent}1E`, color: theme.hudAccent }}
            >
              <Trophy className="h-4 w-4" />
              <AnimatedNumber value={seat.score} />
            </span>
          </div>
        </div>

        {/* badges d'état */}
        {seat.lanterne && (
          <span className="absolute -top-3.5 left-2 rounded-full px-2.5 py-1 text-sm font-bold uppercase" style={{ background: `${theme.danger}2E`, color: theme.danger }}>
            {t('table.bj.seat.lanterne')}
          </span>
        )}
        {seat.attacksReceived >= 2 && state.status === 'acting' && (
          <span className="absolute -top-3.5 right-2 rounded-full bg-white/12 px-2.5 py-1 text-sm font-bold uppercase text-white/70">
            {t('table.bj.seat.protected')}
          </span>
        )}
        {primeWinner && (
          <span className="bj-pop absolute -top-4 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full px-3.5 py-1 font-display text-base font-extrabold uppercase" style={{ background: theme.gold, color: '#241A05' }}>
            {t('table.bj.seat.prime')}
          </span>
        )}

        {/* chrono du joueur actif, visible de tous */}
        {isTurn && deadline !== null && (
          <div className="absolute -right-6 -top-6">
            <TimerRing
              endsAt={deadline}
              totalMs={state.config.decisionMs}
              color={theme.hudAccent}
              dangerColor={theme.danger}
              size={64}
              reduced={reduced}
            />
          </div>
        )}

        {/* le tapis de jetons du joueur, en piles physiques sous le siège */}
        {!seat.joinPending && (
          <div className="absolute left-1/2 top-full mt-1.5 -translate-x-1/2">
            <ChipPiles amount={seat.chips} theme={theme} chipSize={isViewer ? 32 : 27} />
          </div>
        )}
      </div>
    </div>
  );
});

export default SeatPod;
