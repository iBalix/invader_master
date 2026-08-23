/**
 * Ecran liste des jeux v2 (DA V3 launcher).
 *
 * - Sidebar moderne (LauncherSidebar) avec icone Lucide + texture par categorie
 * - Bandeau de filtre nb joueurs (1 / 2 / 3 / 4+) au-dessus de la grille. Chaque
 *   seuil signifie "au moins n joueurs", d'ou le "+" sur le dernier ; un jeu en
 *   reseau a 8 joueurs y tombe naturellement.
 * - AUCUN filtre coche par defaut, et remise a zero a chaque changement de
 *   categorie : on entre en voyant tous les jeux, pas une grille a moitie grisee.
 * - Les seuils sans aucun jeu dans la categorie affichee sont grises et non
 *   cliquables. Un second appui sur le seuil actif le retire.
 * - Grid de vignettes 16:9 dense ; avec un filtre pose, les jeux dont
 *   max_players est sous le seuil sont grises
 * - Tap d'une vignette = LaunchGameModal (sauf grise)
 * - Plus de titre redondant en haut (la categorie active est lisible dans la sidebar)
 * - Plus de catégorie "Nos préférés" ni "4 joueurs" (filtrees au seed v2)
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useHostname } from '../hooks/useHostname';
import { useGamesV2, type GameV2 } from '../hooks/useGamesV2';
import { useDesignConfig } from '../hooks/useDesignConfig';
import type { Game } from '../hooks/useGames';
import { useT } from '../i18n/useT';
import HeaderBar from '../components/layout/HeaderBar';
import GamepadBadge from '../components/layout/GamepadBadge';
import BackButton from '../components/layout/BackButton';
import LauncherSidebar, { type SidebarEntry } from '../components/layout/LauncherSidebar';
import GameCard from '../components/games/GameCard';
import LaunchGameModal from '../components/games/LaunchGameModal';
import RetroLoader from '../components/ui/RetroLoader';
import AnimatedGrid, { AnimatedGridItem } from '../components/ui/AnimatedGrid';
import ScrollIndicator from '../components/menu/ScrollIndicator';

/**
 * Seuils du filtre joueurs. Chaque seuil signifie "au moins n joueurs" : le
 * dernier s'affiche donc "4+", ce que le filtre faisait deja sans le dire.
 * Un jeu en reseau a 8 joueurs (le blackjack) tombe bien sous ce 4+.
 */
const SEUILS_JOUEURS = [1, 2, 3, 4] as const;

/** libelle d'un seuil : le plus haut est un "et plus" */
function libelleSeuil(n: number): string {
  const dernier = SEUILS_JOUEURS[SEUILS_JOUEURS.length - 1];
  if (n === dernier) return `${n}+ joueurs`;
  return `${n} ${n === 1 ? 'joueur' : 'joueurs'}`;
}

export default function GamesPage() {
  useHostname();
  const navigate = useNavigate();
  const { loading, data, error } = useGamesV2();
  const { design } = useDesignConfig();
  const gamesColor = design.gamesButtonColor;
  const t = useT();
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [selected, setSelected] = useState<GameV2 | null>(null);
  // null = aucun filtre, et c'est l'etat par defaut : on entre dans une
  // categorie en voyant tous ses jeux, pas une grille a moitie grisee.
  const [playerFilter, setPlayerFilter] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Auto-selection de la premiere categorie au load
  useEffect(() => {
    if (!activeCategory && data && data.categories.length > 0) {
      setActiveCategory(data.categories[0].id);
    }
  }, [data, activeCategory]);

  // Map consoleId -> displayName ?? name (fallback)
  const consoleLabelById = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of data?.consoles ?? []) {
      map.set(c.id, c.displayName?.trim() ? c.displayName : c.name);
    }
    return map;
  }, [data]);

  // Map consoleName (string) -> displayName, utilise par GameCard quand consoleId absent du game
  const consoleLabelByName = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of data?.consoles ?? []) {
      map.set(c.name, c.displayName?.trim() ? c.displayName : c.name);
    }
    return map;
  }, [data]);

  const visibleGames = useMemo(() => {
    if (!data || !activeCategory) return [] as GameV2[];
    const cat = data.categories.find((c) => c.id === activeCategory);
    if (!cat) return [] as GameV2[];
    return data.games.filter((g) => g.categories.includes(cat.name));
  }, [data, activeCategory]);

  /**
   * Seuils ayant au moins un jeu dans la categorie affichee. Les autres sont
   * grises et non cliquables : proposer un filtre qui ne renvoie rien envoie le
   * client dans un mur, et sur une borne il n'a personne a qui demander.
   */
  const seuilsDisponibles = useMemo(() => {
    const dispo = new Set<number>();
    for (const g of visibleGames) {
      const max = g.maxPlayers ?? 1;
      for (const n of SEUILS_JOUEURS) if (max >= n) dispo.add(n);
    }
    return dispo;
  }, [visibleGames]);

  // Changement de categorie : on repart sans filtre. Sinon un filtre reste actif
  // alors qu'il vient d'etre grise, et la grille arrive vide sans explication.
  useEffect(() => {
    setPlayerFilter(null);
  }, [activeCategory]);

  const sidebarEntries = useMemo<SidebarEntry[]>(() => {
    return (data?.categories ?? []).map((cat) => ({
      id: cat.id,
      name: cat.name,
      iconName: cat.iconName,
      color: cat.color,
      textureUrl: cat.textureUrl,
      count: (data?.games ?? []).filter((g) => g.categories.includes(cat.name)).length,
    }));
  }, [data]);

  return (
    <div className="relative flex h-full w-full flex-col px-8 py-6">
      <HeaderBar
        title={t('table.games.title').toUpperCase()}
        left={<BackButton />}
        right={<GamepadBadge />}
      />

      <div className="mt-5 flex min-h-0 flex-1 gap-5">
        <LauncherSidebar
          title={t('table.games.categories', 'Categories')}
          accent="magenta"
          accentColor={gamesColor}
          entries={sidebarEntries}
          currentId={activeCategory}
          onSelect={setActiveCategory}
          showCategoryDividers
        />

        <section className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl border border-white/10 bg-table-bg-soft/85">
          <div className="flex shrink-0 items-center gap-3 border-b border-white/10 px-6 py-4">
            <span className="font-display text-xs uppercase tracking-[0.3em] text-table-cyan/85">
              Filtre joueurs
            </span>
            <div className="flex gap-2">
              {SEUILS_JOUEURS.map((n) => {
                const active = playerFilter === n;
                const dispo = seuilsDisponibles.has(n);
                return (
                  <button
                    key={n}
                    type="button"
                    disabled={!dispo}
                    // un second appui sur le seuil actif le retire : sans ca, une
                    // fois un filtre pose il n'y a plus aucun moyen de tout revoir
                    onClick={() => setPlayerFilter(active ? null : n)}
                    className={[
                      'flex h-12 items-center gap-2 rounded-full border px-5 font-display text-base uppercase tracking-wider transition-colors',
                      !dispo
                        ? 'cursor-not-allowed border-white/5 bg-white/[0.02] text-table-ink-muted/40'
                        : active
                          ? gamesColor
                            ? ''
                            : 'border-table-magenta/60 bg-table-magenta/20 text-table-magenta'
                          : 'border-white/15 bg-white/5 text-table-ink-soft hover:bg-white/10',
                    ].join(' ')}
                    style={
                      dispo && active && gamesColor
                        ? {
                            borderColor: `${gamesColor}99`,
                            backgroundColor: `${gamesColor}33`,
                            color: gamesColor,
                          }
                        : undefined
                    }
                    aria-pressed={active}
                    title={dispo ? undefined : 'Aucun jeu de cette catégorie'}
                  >
                    {libelleSeuil(n)}
                  </button>
                );
              })}
            </div>
          </div>

          <div ref={scrollRef} className="tables-scroll relative flex-1 overflow-y-auto p-5">
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
                  resetKey={`${activeCategory}-${playerFilter ?? "tous"}`}
                  className="grid grid-cols-2 gap-5 md:grid-cols-3 xl:grid-cols-4"
                >
                  {visibleGames.map((g) => {
                    const maxP = g.maxPlayers ?? 1;
                    const isDisabled = playerFilter !== null && maxP < playerFilter;
                    const consoleLabel =
                      g.consoleDisplayName ||
                      (g.consoleId ? consoleLabelById.get(g.consoleId) : null) ||
                      (g.consoleName ? consoleLabelByName.get(g.consoleName) : null) ||
                      g.consoleName ||
                      null;
                    // Adapter pour le composant GameCard qui type Game (v1) — les champs
                    // communs (id, name, images, consoleName) suffisent au rendu.
                    const gameForCard = g as unknown as Game;
                    return (
                      <AnimatedGridItem key={g.id}>
                        <GameCard
                          game={gameForCard}
                          consoleLabel={consoleLabel}
                          disabled={isDisabled}
                          disabledReason={isDisabled ? `Min. ${libelleSeuil(playerFilter!)}` : null}
                          onClick={() => {
                            if (isDisabled) return;
                            // jeu web (échecs, ...) : navigation interne dans
                            // le SPA, pas d'ordre de lancement. Le garde
                            // /table/ empêche toute sortie du kiosque par une
                            // URL mal saisie en base.
                            if (g.gameType === 'web' && g.gameUrl?.startsWith('/table/')) {
                              navigate(g.gameUrl);
                              return;
                            }
                            setSelected(g);
                          }}
                        />
                      </AnimatedGridItem>
                    );
                  })}
                </AnimatedGrid>
              ))}
          </div>
          <ScrollIndicator scrollRef={scrollRef} />
        </section>
      </div>

      <LaunchGameModal
        open={!!selected}
        game={selected as unknown as Game | null}
        onClose={() => setSelected(null)}
      />
    </div>
  );
}
