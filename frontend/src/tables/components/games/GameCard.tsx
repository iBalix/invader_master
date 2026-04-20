/**
 * Carte d'un jeu (DA V3 launcher) - 16:9 large.
 *
 *   - 4 cards par ligne (xl), donc plus large que la version compacte.
 *   - Texte superpose sur l'image dans un degrade pour gagner de la place
 *     verticale.
 */

import type { Game } from '../../hooks/useGames';

interface Props {
  game: Game;
  onClick: () => void;
}

export default function GameCard({ game, onClick }: Props) {
  const cover = game.images?.[0];
  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative block w-full overflow-hidden rounded-2xl border border-white/10 bg-table-bg-elev/85 text-left transition-transform duration-150 active:scale-[0.97]"
    >
      <div className="relative aspect-video w-full overflow-hidden">
        {cover ? (
          <img
            src={cover}
            alt={game.name}
            className="h-full w-full object-cover"
            draggable={false}
            loading="lazy"
            decoding="async"
          />
        ) : (
          <div
            className="flex h-full w-full items-center justify-center font-display text-base uppercase text-table-ink-muted"
            style={{
              background:
                'linear-gradient(135deg, rgba(255,43,214,0.25), rgba(123,43,255,0.18))',
            }}
          >
            {game.name}
          </div>
        )}

        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/95 via-black/60 to-transparent" />

        <div className="absolute inset-x-0 bottom-0 flex flex-col gap-0.5 px-4 py-3">
          <div className="line-clamp-2 font-display text-base uppercase tracking-wider text-white">
            {game.name}
          </div>
          {game.consoleName && (
            <div className="font-display text-[11px] uppercase tracking-widest text-table-cyan/85">
              {game.consoleName}
            </div>
          )}
        </div>
      </div>
    </button>
  );
}
