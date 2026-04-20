/**
 * Ecran liste des jeux (DA V3 launcher).
 *
 * - Sidebar moderne (LauncherSidebar) sans scroll
 * - Grid de vignettes 16:9 dense (5-7 colonnes)
 * - Tap d'une vignette = LaunchGameModal
 */

import { useEffect, useMemo, useState } from 'react';
import { useHostname } from '../hooks/useHostname';
import { useGames, type Game } from '../hooks/useGames';
import { useT } from '../i18n/useT';
import HeaderBar from '../components/layout/HeaderBar';
import BackButton from '../components/layout/BackButton';
import LauncherSidebar, { type SidebarEntry } from '../components/layout/LauncherSidebar';
import GameCard from '../components/games/GameCard';
import LaunchGameModal from '../components/games/LaunchGameModal';
import TournamentTipCard from '../components/games/TournamentTipCard';
import RetroLoader from '../components/ui/RetroLoader';
import AnimatedGrid, { AnimatedGridItem } from '../components/ui/AnimatedGrid';

function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function isFavoritesCategory(name: string | undefined): boolean {
  if (!name) return false;
  const n = normalizeName(name);
  return n.includes('prefere');
}

export default function GamesPage() {
  useHostname();
  const { loading, data, error } = useGames();
  const t = useT();
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [selected, setSelected] = useState<Game | null>(null);

  // Auto-selection de la premiere categorie quand les donnees arrivent.
  useEffect(() => {
    if (!activeCategory && data && data.categories.length > 0) {
      setActiveCategory(data.categories[0].id);
    }
  }, [data, activeCategory]);

  const visibleGames = useMemo(() => {
    if (!data || !activeCategory) return [] as Game[];
    const cat = data.categories.find((c) => c.id === activeCategory);
    if (!cat) return [] as Game[];
    return data.games.filter((g) => g.categories.includes(cat.name));
  }, [data, activeCategory]);

  const sidebarEntries = useMemo<SidebarEntry[]>(() => {
    return (data?.categories ?? []).map((cat) => ({
      id: cat.id,
      name: cat.name,
      emoji: cat.emoji,
      imageUrl: cat.iconUrl,
      count: (data?.games ?? []).filter((g) => g.categories.includes(cat.name)).length,
    }));
  }, [data]);

  const currentCategoryName = useMemo(() => {
    if (!activeCategory || !data) return t('table.games.title');
    return (
      data.categories.find((c) => c.id === activeCategory)?.name ??
      t('table.games.title')
    );
  }, [activeCategory, data, t]);

  const showTournamentTip = isFavoritesCategory(currentCategoryName);

  return (
    <div className="relative flex h-full w-full flex-col px-8 py-6">
      <HeaderBar
        title={t('table.games.title').toUpperCase()}
        left={<BackButton />}
      />

      <div className="mt-5 flex min-h-0 flex-1 gap-5">
        <LauncherSidebar
          title={t('table.games.categories', 'Categories')}
          accent="magenta"
          entries={sidebarEntries}
          currentId={activeCategory}
          onSelect={setActiveCategory}
          showCategoryDividers
        />

        <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl border border-white/10 bg-table-bg-soft/85">
          <div className="flex shrink-0 items-baseline justify-between border-b border-white/10 px-6 py-4">
            <h2 className="font-display text-3xl uppercase tracking-wider text-table-ink">
              {currentCategoryName}
            </h2>
            <span className="rounded-full border border-white/15 bg-white/8 px-3 py-1 font-display text-xs uppercase tracking-wider text-table-ink-soft">
              {visibleGames.length} {t('table.games.title').toLowerCase()}
            </span>
          </div>
          <div className="tables-scroll relative flex-1 overflow-y-auto p-5">
            {loading && (
              <div className="flex h-full items-center justify-center">
                <RetroLoader label={t('table.common.loading', 'LOADING')} accent="magenta" />
              </div>
            )}
            {!loading && error && (
              <div className="flex h-full items-center justify-center text-center text-table-red">
                {error}
              </div>
            )}
            {!loading && !error &&
              (visibleGames.length === 0 ? (
                <div className="flex h-48 items-center justify-center text-table-ink-muted">
                  {t('table.games.empty')}
                </div>
              ) : (
                <AnimatedGrid
                  resetKey={activeCategory}
                  className="grid grid-cols-2 gap-5 md:grid-cols-3 xl:grid-cols-4"
                >
                  {showTournamentTip && (
                    <AnimatedGridItem key="__tip-tournament__">
                      <TournamentTipCard />
                    </AnimatedGridItem>
                  )}
                  {visibleGames.map((g) => (
                    <AnimatedGridItem key={g.id}>
                      <GameCard game={g} onClick={() => setSelected(g)} />
                    </AnimatedGridItem>
                  ))}
                </AnimatedGrid>
              ))}
          </div>
        </section>
      </div>

      <LaunchGameModal
        open={!!selected}
        game={selected}
        onClose={() => setSelected(null)}
      />
    </div>
  );
}
