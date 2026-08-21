/**
 * Contrat d'un thème visuel d'échecs. Tout est dessiné en code (SVG/CSS),
 * aucune image bitmap. Les couleurs de cases sont des styles inline (Tailwind
 * ne voit pas les classes dynamiques), le HUD reste sur les tokens table-*.
 */

import type { ComponentType, CSSProperties, ReactNode } from 'react';
import type { ChessColor, PieceType } from '../lib/chessTypes';

export type CaptureFxKind = 'fly' | 'dissolve' | 'zap' | 'pixel-burst' | 'fade' | 'warp';

export interface PieceStyle {
  body: string;
  stroke: string;
  strokeWidth: number;
  /** couleur des détails internes (croix, créneaux...), défaut = stroke */
  detail?: string;
  /** dégradé vertical du corps (remplace body) */
  gradient?: { from: string; to: string };
  /** filtre CSS appliqué au SVG (ex: drop-shadow néon) ; coupé en perf reduced */
  glow?: string;
}

export interface ChessTheme {
  id: string;
  labelKey: string;

  /** background CSS de la page partie */
  pageBg: string;
  /** classes du cadre autour du plateau (statiques, connues de Tailwind) */
  boardFrameClass: string;
  boardFrameStyle?: CSSProperties;
  /** fond du plateau derrière les cases (utile quand elles sont translucides) */
  boardBg?: string;

  lightSquare: string;
  darkSquare: string;
  /** bordure de chaque case (grille néon) ; undefined = pas de grille */
  squareBorder?: string;
  /** couleur des coordonnées a-h/1-8 ; défaut = couleur de la case opposée */
  coordColor?: string;

  /** contour de la case sélectionnée, à la couleur du camp qui joue */
  selectedOutline: (color: ChessColor) => string;
  /** classe CSS additionnelle du marqueur de sélection (ex: arc électrique) */
  selectedClass?: string;
  /**
   * Couleur de la pastille de case libre, SELON LE CAMP QUI JOUE : c'est mon
   * propre déplacement qui est annoncé, la pastille doit donc porter ma
   * couleur (sinon les noirs voient des pastilles blanches et inversement).
   */
  legalDot: (color: ChessColor) => string;
  /**
   * Anneau de capture : couleur unique "danger" du thème. Elle entoure une
   * pièce ADVERSE, elle doit donc contraster avec les deux camps — la teinter
   * par camp la rendrait invisible sur la pièce visée une fois sur deux.
   */
  captureRing: string;
  lastMoveTint: string;
  checkTint: string;

  /** accent HUD : liseré du joueur au trait, éléments actifs */
  hudAccent: string;
  clockDanger: string;

  /** 'square' pour le thème pixel (pas de rond en 8-bit) */
  markerShape: 'round' | 'square';

  pieceStyle: (color: ChessColor) => PieceStyle;
  renderPiece: (type: PieceType, color: ChessColor, size?: number | string) => ReactNode;

  /** déplacement des pièces */
  moveMs: number;
  moveEasing: string;

  /** animation de capture (varie par thème) */
  captureFx: CaptureFxKind;
  captureMs: number;
  /** couleur des particules (dissolve / pixel-burst / zap) */
  particleColor?: (color: ChessColor) => string;

  /** ambiance décorative one-shot (jamais montée en perf reduced) */
  Ambient?: ComponentType<{ boardSize: number }>;
}
