/**
 * Thème CLASSIQUE CARTOON : damier crème/anthracite, silhouettes classiques
 * à contour épais, ombres douces. Capture 'fly' : la pièce glisse se ranger
 * dans la zone des prises.
 */

import { PieceGlyph } from './pieces/StandardPieceSet';
import type { ChessTheme, PieceStyle } from './types';

const WHITE: PieceStyle = {
  body: '#FDF6E3',
  stroke: '#2B2430',
  strokeWidth: 2.2,
  glow: 'drop-shadow(0 2px 2px rgba(0,0,0,0.35))',
};

const BLACK: PieceStyle = {
  body: '#3B3542',
  stroke: '#EDE4F2',
  strokeWidth: 2.2,
  detail: '#EDE4F2',
  glow: 'drop-shadow(0 2px 2px rgba(0,0,0,0.35))',
};

export const classicTheme: ChessTheme = {
  id: 'classic',
  labelKey: 'table.chess.theme.classic',
  pageBg: 'linear-gradient(180deg, #1A1526 0%, #0C0916 100%)',
  boardFrameClass: 'rounded-2xl border-4 border-[#2E2837] shadow-[0_18px_50px_rgba(0,0,0,0.5)]',
  lightSquare: '#EFE0C0',
  darkSquare: '#4A4A57',
  selectedOutline: (c) => (c === 'w' ? '#FFD166' : '#B39DFF'),
  legalDot: (c) => (c === 'w' ? 'rgba(253,246,227,0.9)' : 'rgba(43,36,48,0.55)'),
  captureRing: 'rgba(255,99,99,0.9)',
  lastMoveTint: 'rgba(255,209,102,0.38)',
  checkTint: 'rgba(255,77,77,0.55)',
  hudAccent: '#FFD166',
  clockDanger: '#FF3B5C',
  markerShape: 'round',
  pieceStyle: (c) => (c === 'w' ? WHITE : BLACK),
  renderPiece: (type, color, size) => (
    <PieceGlyph type={type} color={color} style={color === 'w' ? WHITE : BLACK} size={size} />
  ),
  moveMs: 200,
  moveEasing: 'cubic-bezier(0.25, 1, 0.5, 1)',
  captureFx: 'fly',
  captureMs: 420,
};
