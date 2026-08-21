/**
 * La table : feutre du thème, croupier en haut au centre, sièges répartis
 * sur l'arc bas selon l'anneau physique du bar (moi en bas au centre, le
 * suivant dans l'anneau à ma gauche), couches d'effets (jokers, temps forts,
 * jetons qui voyagent) et dock d'actions du joueur local.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import ActionBar from './ActionBar';
import BetPanel from './BetPanel';
import BigMomentLayer from './BigMomentLayer';
import ChipFlyLayer, { type ChipFlight } from './ChipFlyLayer';
import DealerPod from './DealerPod';
import JokerFxLayer from './JokerFxLayer';
import JokerHand from './JokerHand';
import JokerLegend from './JokerLegend';
import RoundResultOverlay from './RoundResultOverlay';
import SeatPod from './SeatPod';
import { placeSeats, type SeatPlacement } from '../lib/ring';
import { seatAnchorKey, centerOf, type AnchorRegistry } from '../lib/anchors';
import { decomposeChips } from './ChipStack';
import type { BjAct, BjPublicState, BjYou, JokerType } from '../lib/bjTypes';
import type { BjTheme } from '../themes/types';
import type { TFunction } from '../../../i18n/useT';

interface Props {
  state: BjPublicState;
  you: BjYou | null;
  theme: BjTheme;
  viewerDevice: string | null;
  busy: boolean;
  reduced: boolean;
  onBet: (amount: number) => void;
  onAct: (action: BjAct) => void;
  onJoker: (type: JokerType, target: string | null) => void;
  t: TFunction;
}

const CASCADE_MS = 150;

export default function BjTable({
  state,
  you,
  theme,
  viewerDevice,
  busy,
  reduced,
  onBet,
  onAct,
  onJoker,
  t,
}: Props) {
  const anchors: AnchorRegistry = useRef({});
  // le tout premier état affiché ne rejoue aucune animation d'arrivée
  const [firstPaintDone, setFirstPaintDone] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setFirstPaintDone(true));
    return () => cancelAnimationFrame(raf);
  }, []);
  const animate = firstPaintDone;

  const mySeat = you ? state.seats.find((s) => s.playerId === you.playerId) ?? null : null;
  const inRound = state.status !== 'lobby' && state.status !== 'end';

  const { placed } = useMemo(
    () => placeSeats(state.seats, mySeat?.playerId ?? null, viewerDevice),
    [state.seats, mySeat?.playerId, viewerDevice],
  );

  // cascade de distribution : deux passes (siège, siège..., croupier).
  // Calculée sur les sièges actifs, PAS sur les mains : pendant les mises les
  // mains n'existent pas encore, or c'est ce calcul que les cartes liront au
  // moment où la donne arrive.
  const dealDelays = useMemo(() => {
    const active = placed
      .map((p) => p.seat)
      .filter((s) => !s.joinPending)
      .sort((a, b) => a.ringPos - b.ringPos);
    const n = active.length;
    const bySeat: Record<string, number[][]> = {};
    active.forEach((seat, i) => {
      bySeat[seat.playerId] = [[i * CASCADE_MS, (n + 1 + i) * CASCADE_MS]];
    });
    const dealer = [n * CASCADE_MS, (2 * n + 1) * CASCADE_MS];
    return { bySeat, dealer };
  }, [placed]);

  // meilleur score = couronne, seulement s'il est seul en tête
  const scores = state.seats.filter((s) => !s.joinPending).map((s) => s.score);
  const bestScore = Math.max(0, ...scores);
  const uniqueLeader = scores.filter((v) => v === bestScore).length === 1;

  // jetons qui voyagent au paiement
  const [flights, setFlights] = useState<ChipFlight[]>([]);
  const paidRound = useRef(-1);
  useEffect(() => {
    if (state.status !== 'payout' || !state.lastRound) return;
    if (paidRound.current === state.lastRound.roundIndex) return;
    paidRound.current = state.lastRound.roundIndex;
    if (reduced) return;
    const dealerEl = anchors.current['shoe'];
    if (!dealerEl) return;
    const bank = centerOf(dealerEl);
    const next: ChipFlight[] = [];
    for (const seat of state.seats) {
      const delta = seat.hands.reduce((sum, h) => sum + (h.delta ?? 0), 0);
      if (delta === 0) continue;
      const el = anchors.current[seatAnchorKey(seat.playerId)];
      if (!el) continue;
      const pos = centerOf(el);
      const chips = decomposeChips(Math.abs(delta), 3);
      chips.forEach((value, i) => {
        next.push({
          key: `${state.lastRound!.roundIndex}:${seat.playerId}:${i}`,
          value,
          from: delta > 0 ? bank : pos,
          to: delta > 0 ? pos : bank,
          delayMs: i * 130 + (delta > 0 ? 500 : 0),
        });
      });
    }
    setFlights(next);
  }, [state.status, state.lastRound, state.seats, reduced]);

  const myTurn = mySeat !== null && state.turn?.playerId === mySeat.playerId;

  return (
    <div className="relative h-full w-full overflow-hidden" style={{ background: theme.feltBg }}>
      {/* marquages du feutre */}
      <div className="bj-felt-arc" style={{ ['--bj-felt-line' as string]: theme.feltLine }} />
      <div
        className="pointer-events-none absolute left-1/2 top-[31%] -translate-x-1/2 select-none whitespace-nowrap font-display text-sm font-bold uppercase tracking-[0.5em]"
        style={{ color: theme.feltText, opacity: 0.55 }}
      >
        {t('table.bj.felt.blackjack32')}
      </div>
      <div
        className="pointer-events-none absolute left-1/2 top-[36%] -translate-x-1/2 select-none whitespace-nowrap text-xs font-semibold uppercase tracking-[0.4em]"
        style={{ color: theme.feltText, opacity: 0.4 }}
      >
        {t('table.bj.felt.dealerRule')}
      </div>

      {/* croupier */}
      <div className="absolute left-1/2 top-[3.5%] -translate-x-1/2">
        <DealerPod
          state={state}
          theme={theme}
          anchors={anchors}
          dealDelays={dealDelays.dealer}
          animate={animate}
          reduced={reduced}
          t={t}
        />
      </div>

      {/* sièges */}
      {placed.map((p: SeatPlacement) => (
        <div key={p.seat.playerId} style={{ position: 'absolute', left: `${p.x}%`, top: `${p.y}%` }}>
          <SeatPod
            ref={(el) => {
              anchors.current[seatAnchorKey(p.seat.playerId)] = el;
            }}
            seat={p.seat}
            state={state}
            theme={theme}
            isViewer={p.isViewer}
            isLeader={uniqueLeader && p.seat.score === bestScore && state.roundIndex >= 0}
            dealDelays={dealDelays.bySeat[p.seat.playerId]}
            animate={animate}
            anchors={anchors}
            reduced={reduced}
            primeWinner={state.status === 'payout' && (state.lastRound?.primeWinners.includes(p.seat.playerId) ?? false)}
            winFlash={
              state.status === 'payout' && p.seat.hands.reduce((sum, h) => sum + (h.delta ?? 0), 0) > 0
            }
            t={t}
          />
        </div>
      ))}

      {/* légende permanente des jokers */}
      {inRound && <JokerLegend state={state} theme={theme} t={t} />}

      {/* résolution de manche */}
      <RoundResultOverlay state={state} theme={theme} t={t} />

      {/* couches d'effets */}
      <JokerFxLayer event={state.lastJokerEvent} theme={theme} anchors={anchors} reduced={reduced} t={t} />
      <BigMomentLayer state={state} theme={theme} reduced={reduced} t={t} />
      <ChipFlyLayer flights={flights} theme={theme} reduced={reduced} />

      {/* dock du joueur local */}
      {mySeat && !mySeat.joinPending && inRound && (
        <div className="pointer-events-none absolute bottom-2 left-1/2 z-30 flex -translate-x-1/2 flex-col items-center gap-2">
          {state.status === 'acting' && myTurn && (
            <ActionBar state={state} seat={mySeat} theme={theme} busy={busy} onAct={onAct} t={t} />
          )}
          {state.status === 'betting' && (
            <BetPanel
              state={state}
              theme={theme}
              myChips={mySeat.chips}
              serverBet={mySeat.betInput}
              lastBet={you?.betInput ?? null}
              onBet={onBet}
              reduced={reduced}
              t={t}
            />
          )}
        </div>
      )}
      {mySeat && !mySeat.joinPending && inRound && you && you.jokers.length > 0 && (
        <div className="pointer-events-none absolute bottom-2 right-3 z-30">
          <JokerHand state={state} me={mySeat} jokers={you.jokers} theme={theme} busy={busy} onPlay={onJoker} t={t} />
        </div>
      )}
    </div>
  );
}
