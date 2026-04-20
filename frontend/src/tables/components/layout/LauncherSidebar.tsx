/**
 * Sidebar verticale "launcher" V3 moderne et epuree.
 *
 * Specs :
 *   - Pas de scroll : la liste se distribue dans la hauteur disponible.
 *     Chaque item utilise flex-1 avec un min/max-height qui s'adapte au
 *     nombre d'entrees pour rester lisible.
 *   - Texte mis en avant (font display, gros, uppercase). Plus de "carre
 *     thumbnail avec initiales" qui faisait loader/contact-list.
 *   - Item actif : "pill" anime via Framer Motion (layoutId) qui glisse
 *     d'un item a l'autre. Inclut la barre verticale d'accent + le bg
 *     subtil. En mode reduced motion, on desactive l'animation.
 *   - Count optionnel (showCount=false sur la carte par exemple).
 *   - Optionnellement un emoji discret a gauche si fourni.
 */

import { useId, useMemo } from 'react';
import { motion } from 'framer-motion';
import { usePerfMode } from '../../hooks/usePerfMode';

export interface SidebarEntry {
  id: string;
  name: string;
  count?: number;
  imageUrl?: string | null;
  emoji?: string | null;
  depth?: number;
  /**
   * Si true, ajoute un dot rouge "live" pulsant devant l'item pour le mettre
   * en avant (ex: categorie Happy Hour active a l'instant T).
   */
  pulse?: boolean;
}

interface Props {
  title: string;
  accent?: 'violet' | 'magenta' | 'cyan';
  entries: SidebarEntry[];
  currentId: string | null;
  onSelect: (id: string) => void;
  showCount?: boolean;
}

const ACCENT_BAR: Record<NonNullable<Props['accent']>, string> = {
  violet: 'bg-table-violet',
  magenta: 'bg-table-magenta',
  cyan: 'bg-table-cyan',
};

const ACCENT_PILL_BG: Record<NonNullable<Props['accent']>, string> = {
  violet: 'bg-table-violet/20 border-table-violet/40',
  magenta: 'bg-table-magenta/20 border-table-magenta/40',
  cyan: 'bg-table-cyan/20 border-table-cyan/40',
};

const ACCENT_TITLE: Record<NonNullable<Props['accent']>, string> = {
  violet: 'text-table-violet/80',
  magenta: 'text-table-magenta/80',
  cyan: 'text-table-cyan/80',
};

export default function LauncherSidebar({
  title,
  accent = 'violet',
  entries,
  currentId,
  onSelect,
  showCount = true,
}: Props) {
  const perf = usePerfMode();
  const reactId = useId();
  // layoutId unique a cette instance pour eviter les collisions si plusieurs
  // sidebars cohabitent dans le DOM (ex: navigation popLayout).
  const pillId = `sidebar-pill-${reactId}`;

  const { textClass, maxH, minH } = useMemo(() => {
    if (entries.length <= 5) {
      return { textClass: 'text-2xl', maxH: '5.5rem', minH: '4rem' };
    }
    if (entries.length <= 8) {
      return { textClass: 'text-xl', maxH: '4.5rem', minH: '3.5rem' };
    }
    if (entries.length <= 12) {
      return { textClass: 'text-lg', maxH: '3.75rem', minH: '3rem' };
    }
    return { textClass: 'text-base', maxH: '3rem', minH: '2.5rem' };
  }, [entries.length]);

  return (
    <aside className="flex h-full w-72 shrink-0 flex-col overflow-hidden rounded-3xl border border-white/10 bg-table-bg-soft/85">
      <style>{`
        @keyframes sidebar-live-dot {
          0%, 100% { transform: scale(1); opacity: 1; box-shadow: 0 0 0 0 rgba(255, 43, 214, 0.7); }
          50% { transform: scale(1.18); opacity: 1; box-shadow: 0 0 0 8px rgba(255, 43, 214, 0); }
        }
      `}</style>
      <div
        className={[
          'shrink-0 px-6 pt-5 pb-3 font-retro text-[11px] uppercase tracking-[0.3em]',
          ACCENT_TITLE[accent],
        ].join(' ')}
      >
        {title}
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-hidden px-3 pb-4">
        {entries.map((e) => {
          const active = e.id === currentId;
          return (
            <button
              key={e.id}
              type="button"
              onClick={() => onSelect(e.id)}
              style={{ maxHeight: maxH, minHeight: minH }}
              className={[
                'group relative flex flex-1 items-center gap-3 rounded-xl px-4 text-left transition-colors duration-150 active:scale-[0.98]',
                e.depth && e.depth > 0 ? 'ml-3' : '',
                active
                  ? 'text-white'
                  : 'text-table-ink-soft hover:bg-white/5 hover:text-table-ink',
              ].join(' ')}
            >
              {active && (
                <motion.span
                  layoutId={pillId}
                  aria-hidden
                  className={[
                    'pointer-events-none absolute inset-0 rounded-xl border',
                    ACCENT_PILL_BG[accent],
                  ].join(' ')}
                  transition={
                    perf.reduced
                      ? { duration: 0 }
                      : { type: 'spring', stiffness: 420, damping: 36, mass: 0.8 }
                  }
                >
                  <span
                    aria-hidden
                    className={[
                      'absolute left-0 top-1/2 h-3/5 w-1 rounded-r-full',
                      ACCENT_BAR[accent],
                    ].join(' ')}
                    style={{ transform: 'translate(-3px, -50%)' }}
                  />
                </motion.span>
              )}

              {e.pulse && (
                <span
                  aria-hidden
                  className="relative z-[1] inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-table-magenta"
                  style={{ animation: 'sidebar-live-dot 1.6s ease-out infinite' }}
                />
              )}

              {e.emoji && (
                <span className="relative z-[1] shrink-0 text-2xl leading-none">
                  {e.emoji}
                </span>
              )}

              <span
                className={[
                  'relative z-[1] min-w-0 flex-1 truncate font-display uppercase tracking-wider',
                  textClass,
                ].join(' ')}
              >
                {e.name}
              </span>

              {showCount && typeof e.count === 'number' && (
                <span
                  className={[
                    'relative z-[1] shrink-0 rounded-full px-2.5 py-0.5 font-display text-xs tabular-nums',
                    active ? 'bg-white/15 text-white' : 'bg-white/5 text-table-ink-muted',
                  ].join(' ')}
                >
                  {e.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </aside>
  );
}
