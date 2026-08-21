/**
 * Zone des prises d'un joueur (les pièces adverses qu'il a capturées),
 * rangées chronologiquement. Un slot en vol (FX de capture en cours) reste
 * invisible puis "pop" à l'arrivée. [data-tray-slot] sert de cible de mesure
 * aux FX volants.
 */

import type { TrackedPiece } from '../lib/pieceTracker';
import type { ChessTheme } from '../themes/types';

interface Props {
  pieces: TrackedPiece[];
  theme: ChessTheme;
  hiddenIds: ReadonlySet<string>;
  /** avantage matériel de CE joueur (affiché +N) */
  advantage: number;
}

export default function CapturedTray({ pieces, theme, hiddenIds, advantage }: Props) {
  return (
    <div className="flex min-h-[2.75rem] flex-wrap items-center gap-1">
      {pieces.map((piece) => (
        <div
          key={piece.id}
          data-tray-slot={piece.id}
          className={['h-10 w-10', hiddenIds.has(piece.id) ? 'opacity-0' : 'chess-slot-pop'].join(' ')}
        >
          {theme.renderPiece(piece.type, piece.color, '100%')}
        </div>
      ))}
      {advantage > 0 && (
        <span className="ml-1 font-display text-lg" style={{ color: theme.hudAccent }}>
          +{advantage}
        </span>
      )}
    </div>
  );
}
