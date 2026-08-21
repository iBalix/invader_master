/**
 * Couche des pièces : position absolue + transform translate(%) avec
 * transition CSS. Le retargeting natif des transitions gère un coup pendant
 * une animation ; `suppress` coupe les transitions le temps d'un repaint
 * (resync multi-coups, changement d'orientation).
 */

import { viewCoords, type Orientation, type Square } from '../lib/geometry';
import type { TrackedPiece } from '../lib/pieceTracker';
import type { ChessTheme } from '../themes/types';

interface Props {
  pieces: TrackedPiece[];
  orientation: Orientation;
  theme: ChessTheme;
  suppress: boolean;
  /** pièce du dernier coup : passe au-dessus pendant sa transition */
  raisedSquare: Square | null;
  /** pièce sélectionnée (léger zoom) */
  selectedSquare: Square | null;
  /** pièce à secouer (coup illégal) */
  shakeSquare: Square | null;
  /** roi vaincu : il se couche (mat, abandon, drapeau) */
  fallenKingSquare: Square | null;
}

export default function PieceLayer({
  pieces,
  orientation,
  theme,
  suppress,
  raisedSquare,
  selectedSquare,
  shakeSquare,
  fallenKingSquare,
}: Props) {
  return (
    <div className="pointer-events-none absolute inset-0">
      {pieces.map((piece) => {
        if (piece.square === null) return null;
        const { vx, vy } = viewCoords(piece.square, orientation);
        return (
          <div
            key={piece.id}
            className="chess-piece"
            style={{
              transform: `translate(${vx * 100}%, ${vy * 100}%)`,
              transition: suppress ? 'none' : `transform ${theme.moveMs}ms ${theme.moveEasing}`,
              zIndex: piece.square === raisedSquare ? 6 : undefined,
            }}
          >
            <div
              className={[
                'chess-piece-inner',
                piece.square === shakeSquare ? 'chess-shake' : '',
                piece.square === fallenKingSquare ? 'chess-king-fallen' : '',
              ].join(' ')}
              data-selected={piece.square === selectedSquare ? 'true' : undefined}
            >
              {theme.renderPiece(piece.type, piece.color, '100%')}
            </div>
          </div>
        );
      })}
    </div>
  );
}
