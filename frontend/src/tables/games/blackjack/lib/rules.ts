/**
 * Règles côté client (affichage des actions possibles ; le serveur fait foi).
 */

import type { Card } from './bjTypes';

/** paire séparable : rang strictement identique (aligné sur le backend) */
export function sameRankPair(cards: Card[]): boolean {
  return cards.length === 2 && cards[0][0] === cards[1][0];
}
