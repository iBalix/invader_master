/**
 * Conventions des operations bancaires (table `flux`), partagees par les pages
 * Tresorerie et Rentabilite. Memes valeurs que
 * backend/src/services/financeStats.ts.
 */

import { fmtEur } from './format';

/** Recettes deposees en banque (CB, especes). */
export const REVENUE_CATEGORY = 'encaissement';
/** Achats revendus (boissons, food). */
export const COGS_CATEGORY = 'matières premières';

export function categoryLabel(category: string): string {
  if (category === '') return 'Non catégorisé';
  return category.charAt(0).toUpperCase() + category.slice(1);
}

/** Montant avec son signe explicite : +1 234 €, -567 €. */
export function fmtSigned(value: number): string {
  return `${value > 0 ? '+' : value < 0 ? '-' : ''}${fmtEur(Math.abs(value))}`;
}

/** Marge brute : 1 - achats / encaissements, ou null sans encaissement. */
export function grossMargin(revenue: number, cogs: number): number | null {
  return revenue > 0 ? 1 - cogs / revenue : null;
}
