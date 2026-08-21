/**
 * Décisions de la main active : TIRER / RESTER / DOUBLER / SÉPARER.
 * Gros boutons tactiles ; doubler et séparer n'apparaissent que quand la
 * règle ET les fonds le permettent. windowSeq protège contre un double
 * appui à cheval sur deux fenêtres.
 */

import { sameRankPair } from '../lib/rules';
import type { BjAct, BjPublicState, BjSeatView } from '../lib/bjTypes';
import type { BjTheme } from '../themes/types';
import type { TFunction } from '../../../i18n/useT';

interface Props {
  state: BjPublicState;
  seat: BjSeatView;
  theme: BjTheme;
  busy: boolean;
  onAct: (action: BjAct) => void;
  t: TFunction;
}

export default function ActionBar({ state, seat, theme, busy, onAct, t }: Props) {
  const turn = state.turn;
  if (!turn || turn.playerId !== seat.playerId) return null;
  const hand = seat.hands[turn.hand];
  if (!hand || hand.stood || hand.busted) return null;

  const firstDecision = hand.cards.length === 2;
  // doubler reste possible sur une main séparée (cf. cahier des charges)
  const canDouble = state.config.allowDouble && firstDecision && !hand.doubled;
  const doubleAffordable = canDouble && seat.chips >= hand.bet;
  const canSplit =
    state.config.allowSplit &&
    seat.hands.length === 1 &&
    firstDecision &&
    !hand.fromSplit &&
    sameRankPair(hand.cards) &&
    seat.chips >= hand.bet;
  const canHit = !hand.locked;

  const base =
    'pointer-events-auto flex h-16 items-center justify-center rounded-2xl px-6 font-display text-xl font-extrabold uppercase tracking-wide text-white shadow-lg active:scale-95 disabled:opacity-40';

  return (
    <div className="flex items-center gap-3">
      <button
        className={base}
        style={{ background: `linear-gradient(180deg, ${theme.hudAccent}, ${theme.hudAccent}99)`, color: '#0A0D18' }}
        disabled={busy || !canHit}
        onClick={() => onAct('hit')}
      >
        {t('table.bj.act.hit')}
      </button>
      <button
        className={base}
        style={{ background: 'rgba(255,255,255,0.14)', border: '1px solid rgba(255,255,255,0.25)' }}
        disabled={busy}
        onClick={() => onAct('stand')}
      >
        {t('table.bj.act.stand')}
      </button>
      {canDouble && (
        <button
          className={base}
          style={{ background: `${theme.gold}2A`, border: `1.5px solid ${theme.gold}`, color: theme.gold }}
          disabled={busy || !doubleAffordable || hand.locked}
          onClick={() => onAct('double')}
        >
          {t('table.bj.act.double')}
        </button>
      )}
      {canSplit && (
        <button
          className={base}
          style={{ background: 'rgba(255,255,255,0.08)', border: `1.5px solid ${theme.hudAccent}`, color: theme.hudAccent }}
          disabled={busy || hand.locked}
          onClick={() => onAct('split')}
        >
          {t('table.bj.act.split')}
        </button>
      )}
    </div>
  );
}
