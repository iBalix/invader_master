/**
 * Contrat d'un thème visuel de blackjack. Tout est dessiné en code (SVG/CSS),
 * aucune image bitmap. Le thème définit ses couleurs ET sa grammaire de
 * mouvement : distribution, dépassement, victoire ne bougent pas pareil d'un
 * thème à l'autre (cf. cahier des charges, section animations).
 */

import type { ReactNode } from 'react';

/** distribution : traînée lumineuse / glisse feutrée / à-coups pixel */
export type DealFxKind = 'trail' | 'slide' | 'step';
/** dépassement : désintégration / cartes qui s'affaissent / explosion pixel */
export type BustFxKind = 'dissolve' | 'sag' | 'burst';
/** victoire d'un siège : halo / empilement propre / rafale */
export type WinFxKind = 'halo' | 'stack' | 'burst';

export interface ChipStyle {
  base: string;
  edge: string;
  text: string;
}

export interface BjTheme {
  id: string;
  labelKey: string;

  /** fond de la page partie (CSS background) */
  pageBg: string;
  /** feutre de la table (CSS background du conteneur) */
  feltBg: string;
  /** liseré des marquages du feutre (arcs, lignes) */
  feltLine: string;
  /** texte des marquages du feutre */
  feltText: string;

  /** cartes */
  cardFace: string;
  cardBorder: string;
  cardRed: string;
  cardBlack: string;
  /** dos de carte : SVG inline dans un viewBox 0 0 100 140 */
  renderBack: () => ReactNode;
  /** filtre CSS des cartes (halo néon...) ; coupé en mode perf réduit */
  cardGlow?: string;
  /** rendu pixel : crispEdges + coins carrés */
  pixel?: boolean;

  /** jetons, par valeur (paliers de couleurs) */
  chipStyle: (value: number) => ChipStyle;

  /** sièges / HUD */
  seatBg: string;
  seatBorder: string;
  hudAccent: string;
  danger: string;
  gold: string;

  /** grammaire de mouvement */
  dealFx: DealFxKind;
  bustFx: BustFxKind;
  winFx: WinFxKind;
  dealMs: number;
  flipMs: number;

  /** classe de police optionnelle (thème pixel) */
  fontClass?: string;
}

/** paliers de jetons classiques : blanc 1-, rouge 5-, bleu 25-, vert 100-, noir 500+ */
export function tierOf(value: number): 0 | 1 | 2 | 3 {
  if (value >= 500) return 3;
  if (value >= 100) return 2;
  if (value >= 25) return 1;
  return 0;
}
