/**
 * Aides cartes : décodage du format compact backend ("As" = As de pique,
 * "Td" = 10 de carreau, '??' = face cachée) et valeurs d'affichage.
 */

import type { Card } from './bjTypes';

export type Suit = 's' | 'h' | 'd' | 'c';
export type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'T' | 'J' | 'Q' | 'K';

export interface ParsedCard {
  rank: Rank;
  suit: Suit;
  /** libellé du rang affiché ("10" pour T) */
  label: string;
  red: boolean;
  hidden: false;
}

export interface HiddenCard {
  hidden: true;
}

export function parseCard(card: Card): ParsedCard | HiddenCard {
  if (card === '??' || card.length < 2) return { hidden: true };
  const rank = card[0] as Rank;
  const suit = card[1] as Suit;
  return {
    rank,
    suit,
    label: rank === 'T' ? '10' : rank,
    red: suit === 'h' || suit === 'd',
    hidden: false,
  };
}

/** total d'une main côté client (affichage optimiste ; le serveur fait foi) */
export function clientHandTotal(cards: Card[]): { total: number; soft: boolean } {
  let total = 0;
  let aces = 0;
  for (const card of cards) {
    if (card === '??') continue;
    const rank = card[0];
    if (rank === 'A') {
      aces += 1;
      total += 11;
    } else if (rank === 'T' || rank === 'J' || rank === 'Q' || rank === 'K') {
      total += 10;
    } else {
      total += Number(rank);
    }
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces -= 1;
  }
  return { total, soft: aces > 0 };
}

/** zone dangereuse (cadre orange) : total dur entre 12 et 16 */
export function inDangerZone(total: number, soft: boolean): boolean {
  return !soft && total >= 12 && total <= 16;
}
