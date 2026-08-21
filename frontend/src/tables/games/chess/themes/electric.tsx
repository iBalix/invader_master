/**
 * Thème ÉLECTRIQUE : métal sombre, accent jaune haute tension, arc animé sur
 * la sélection. Capture 'zap' : flash + éclair + disparition par à-coups.
 */

import { PieceGlyph } from './pieces/StandardPieceSet';
import type { ChessTheme, PieceStyle } from './types';

const WHITE: PieceStyle = {
  body: '#D9DEE8',
  stroke: '#0E1116',
  strokeWidth: 2,
  glow: 'drop-shadow(0 1px 2px rgba(0,0,0,0.5))',
};

const BLACK: PieceStyle = {
  body: '#181B22',
  stroke: '#FFE955',
  strokeWidth: 1.8,
  detail: '#FFE955',
  glow: 'drop-shadow(0 0 4px rgba(255,233,85,0.35))',
};

export const electricTheme: ChessTheme = {
  id: 'electric',
  labelKey: 'table.chess.theme.electric',
  pageBg: 'linear-gradient(180deg, #14161C 0%, #0A0B10 100%)',
  boardFrameClass:
    'rounded-xl border-2 border-[#3A3E4A] shadow-[0_14px_40px_rgba(0,0,0,0.6),0_0_18px_rgba(255,233,85,0.12)]',
  // écart de luminosité assumé : le damier reste lisible avant tout
  lightSquare: '#343845',
  darkSquare: '#15171E',
  squareBorder: 'rgba(255,255,255,0.06)',
  coordColor: 'rgba(217,222,232,0.4)',
  selectedOutline: '#FFE955',
  selectedClass: 'chess-selected-electric',
  legalDot: (c) => (c === 'w' ? 'rgba(230,236,247,0.85)' : '#FFE955'),
  captureRing: '#FF3B5C',
  lastMoveTint: 'rgba(255,233,85,0.14)',
  checkTint: 'rgba(255,59,92,0.45)',
  hudAccent: '#FFE955',
  clockDanger: '#FF3B5C',
  markerShape: 'round',
  pieceStyle: (c) => (c === 'w' ? WHITE : BLACK),
  renderPiece: (type, color, size) => (
    <PieceGlyph type={type} color={color} style={color === 'w' ? WHITE : BLACK} size={size} />
  ),
  moveMs: 160,
  moveEasing: 'cubic-bezier(0.2, 0.9, 0.2, 1)',
  captureFx: 'zap',
  captureMs: 380,
  particleColor: () => '#FFE955',
};
