/**
 * Carte d'un jeu (DA V3 launcher) - 16:9 large.
 *
 *   - 4 cards par ligne (xl), donc plus large que la version compacte.
 *   - Texte superpose sur l'image dans un degrade pour gagner de la place
 *     verticale.
 *   - Quand disabled : opacity reduite + grayscale + pointer-events none.
 *     Le badge "Min X joueurs" est superpose pour expliquer pourquoi.
 *   - consoleName accepte un fallback display (utilise par GamesPage v2).
 */

import type { Game } from '../../hooks/useGames';

interface Props {
  game: Game;
  onClick: () => void;
  disabled?: boolean;
  disabledReason?: string | null;
  consoleLabel?: string | null;
}

export default function GameCard({ game, onClick, disabled = false, disabledReason, consoleLabel }: Props) {
  const cover = game.images?.[0];
  const console_ = consoleLabel ?? game.consoleName;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        'group relative block w-full overflow-hidden rounded-2xl border border-white/10 bg-table-bg-elev/85 text-left transition-transform duration-150',
        disabled
          ? 'opacity-30 grayscale pointer-events-none'
          : 'active:scale-[0.97]',
      ].join(' ')}
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
          {console_ && (
            <div className="font-display text-[11px] uppercase tracking-widest text-table-cyan/85">
              {console_}
            </div>
          )}
        </div>

        {disabled && disabledReason && (
          <div className="pointer-events-none absolute right-2 top-2 z-10 rounded-full border border-white/30 bg-black/70 px-2.5 py-1 font-display text-[10px] uppercase tracking-wider text-white">
            {disabledReason}
          </div>
        )}
      </div>
    </button>
  );
}
