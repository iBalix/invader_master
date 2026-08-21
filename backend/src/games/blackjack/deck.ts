/**
 * Cartes, sabot et totaux. Pur, sans I/O. Le serveur est l'unique arbitre :
 * le client ne fait qu'afficher.
 */

import crypto from 'crypto';
import type { Card } from './types.js';

const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K'] as const;
const SUITS = ['s', 'h', 'd', 'c'] as const;

/** sabot mélangé (Fisher-Yates sur crypto.randomInt) */
export function buildShoe(decks: number): Card[] {
  const shoe: Card[] = [];
  for (let d = 0; d < decks; d++) {
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        shoe.push(`${rank}${suit}`);
      }
    }
  }
  for (let i = shoe.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [shoe[i], shoe[j]] = [shoe[j], shoe[i]];
  }
  return shoe;
}

export function cardValue(card: Card): number {
  const rank = card[0];
  if (rank === 'A') return 1;
  if (rank === 'T' || rank === 'J' || rank === 'Q' || rank === 'K') return 10;
  return Number(rank);
}

/** total blackjack : les As comptent 11 quand ça ne fait pas sauter */
export function handTotal(cards: Card[]): { total: number; soft: boolean } {
  let total = 0;
  let aces = 0;
  for (const card of cards) {
    total += cardValue(card);
    if (card[0] === 'A') aces += 1;
  }
  if (aces > 0 && total + 10 <= 21) {
    return { total: total + 10, soft: true };
  }
  return { total, soft: false };
}

export function isBust(cards: Card[]): boolean {
  return handTotal(cards).total > 21;
}

/** blackjack naturel : 21 en 2 cartes (hors mains issues d'un split) */
export function isNatural(cards: Card[]): boolean {
  return cards.length === 2 && handTotal(cards).total === 21;
}

export function sameRank(a: Card, b: Card): boolean {
  return a[0] === b[0];
}
