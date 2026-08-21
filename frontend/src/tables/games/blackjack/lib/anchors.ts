/**
 * Registre d'ancres DOM de la table : sabot, croupier, sièges. Sert à
 * mesurer les trajets (carte du sabot au siège, jetons du siège vers la
 * banque) sans recalcul de layout : une lecture de getBoundingClientRect au
 * déclenchement de chaque effet.
 */

import type { MutableRefObject } from 'react';

export type AnchorRegistry = MutableRefObject<Record<string, HTMLElement | null>>;

export function seatAnchorKey(playerId: string): string {
  return `seat:${playerId}`;
}

export function centerOf(el: HTMLElement): { x: number; y: number } {
  const rect = el.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}
