/**
 * Éligibilité des jokers côté client (le serveur revalide tout).
 * Miroir des règles de bjFlow.bjJoker.
 */

import type { BjHandView, BjPublicState, BjSeatView, JokerType } from './bjTypes';

function handActionable(hand: BjHandView): boolean {
  return !hand.stood && !hand.busted && !hand.blackjack && !hand.locked;
}

/** cibles valides d'une attaque pour ce type */
export function eligibleTargets(state: BjPublicState, me: BjSeatView, type: JokerType): BjSeatView[] {
  return state.seats.filter((seat) => {
    if (seat.playerId === me.playerId || seat.left || seat.joinPending) return false;
    if (seat.attacksReceived >= 2) return false;
    if (type === 'force') {
      return seat.hands.some((h) => !h.busted && !h.blackjack && h.total >= 12);
    }
    if (type === 'lock') {
      return seat.hands.some((h) => handActionable(h) && h.total <= 16);
    }
    if (type === 'steal') {
      return seat.hands.some((h) => !h.busted && !h.blackjack && h.cards.length >= 2);
    }
    return false;
  });
}

/** le joker est-il jouable maintenant, au-delà des plafonds de manche ? */
export function jokerPlayable(state: BjPublicState, me: BjSeatView, type: JokerType): boolean {
  const acting = state.status === 'acting';
  const dealerPhase = state.status === 'dealer';
  if (!acting && !(dealerPhase && type === 'filet')) return false;
  if (me.playedThisRound >= 2) return false;

  switch (type) {
    case 'force':
    case 'lock':
      return acting && eligibleTargets(state, me, type).length > 0;
    case 'steal':
      return (
        acting &&
        me.hands.some((h) => !h.busted && !h.blackjack) &&
        eligibleTargets(state, me, type).length > 0
      );
    case 'filet':
      return me.hands.some((h) => h.busted && !h.filetUsed && h.cards.length >= 3);
    case 'shield':
      return acting && !me.shield;
    case 'redraw': {
      const hand = me.hands[0];
      return (
        acting &&
        me.hands.length === 1 &&
        hand !== undefined &&
        hand.cards.length === 2 &&
        handActionable(hand) &&
        !hand.doubled
      );
    }
    default:
      return false;
  }
}
