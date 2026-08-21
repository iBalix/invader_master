/**
 * Recupere la config design EFFECTIVE (resolue cote backend selon la
 * planification + stickiness 15 min) via /public/tables/design.
 *
 * Fournit l'image de fond (accueil + veille) et les couleurs des boutons
 * Carte / Jeux (utilisees aussi comme accent sur les pages Carte / Jeux).
 *
 * IMPORTANT : store module-level partage. Tous les composants (TableLayout,
 * HomePage, MenuPage, GamesPage, ScreensaverPage) consomment la MEME valeur
 * resolue -> pas de fetch concurrents, pas d'incoherence fond/couleurs, pas de
 * flicker "une config puis l'autre" a chaque montage/navigation. Un refresh
 * periodique capte les changements de planification sans re-rendre la borne
 * tant que la config effective n'a pas reellement change.
 *
 * Le serveur renvoie DEUX choses : `design`, celui attribue a cette table, et
 * `designs`, le groupe eligible au meme instant. Ce groupe alimente la pastille
 * de l'accueil : le client fait tourner le fond dedans, et son choix est
 * memorise localement (designStore). Si le design memorise disparait du groupe
 * (desactive en back-office, ou hors de sa plage horaire), on l'oublie et on
 * revient a celui du serveur, sinon la borne resterait bloquee sur un fond
 * fantome.
 *
 * Ce choix est en outre temporaire : dix minutes apres le dernier appui sur la
 * pastille, designStore l'efface et la borne reprend le fond que le serveur lui
 * attribue. Rien a faire ici, la disparition de l'override suffit a nous y
 * ramener.
 */

import { useEffect, useState } from 'react';
import { tablesApi } from '../lib/tablesApi';
import { useDesignOverride } from '../store/designStore';

export interface DesignConfig {
  id: string;
  name: string;
  backgroundImageUrl: string | null;
  menuButtonColor: string;
  gamesButtonColor: string;
}

const DEFAULTS: DesignConfig = {
  id: '',
  name: 'default',
  backgroundImageUrl: null,
  menuButtonColor: '#7b2bff',
  gamesButtonColor: '#ff2bd6',
};

const REFRESH_INTERVAL_MS = 60_000;

let cache: DesignConfig | null = null;
/** groupe eligible renvoye par le serveur, ordre d'attribution inclus */
let cacheGroup: DesignConfig[] = [];
let inflight: Promise<DesignConfig> | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<() => void>();

function sameDesign(a: DesignConfig, b: DesignConfig): boolean {
  return (
    a.id === b.id &&
    a.backgroundImageUrl === b.backgroundImageUrl &&
    a.menuButtonColor === b.menuButtonColor &&
    a.gamesButtonColor === b.gamesButtonColor
  );
}

async function load(): Promise<DesignConfig> {
  try {
    const res = await tablesApi.get<{ design: DesignConfig | null; designs?: DesignConfig[] }>(
      `/design`,
    );
    const next = res.data?.design ?? DEFAULTS;
    const group = res.data?.designs ?? [];
    const groupChanged =
      group.length !== cacheGroup.length ||
      group.some((d, i) => d.id !== cacheGroup[i]?.id);
    cacheGroup = group;
    if (!cache || !sameDesign(cache, next) || groupChanged) {
      cache = next;
      listeners.forEach((fn) => fn());
    }
    return cache;
  } catch {
    cache = cache ?? DEFAULTS;
    return cache;
  }
}

function ensureLoaded(): Promise<DesignConfig> {
  if (!inflight) inflight = load();
  return inflight;
}

function ensurePolling(): void {
  if (pollTimer) return;
  pollTimer = setInterval(() => {
    void load();
  }, REFRESH_INTERVAL_MS);
}

interface State {
  loading: boolean;
  /** le design a afficher : celui choisi sur cette borne, sinon celui du serveur */
  design: DesignConfig;
  /** groupe dans lequel la pastille fait tourner le fond */
  designs: DesignConfig[];
  /** passe au design suivant du groupe, pour cette borne uniquement */
  cycle: () => void;
}

export function useDesignConfig(): State {
  const [, force] = useState(0);
  const { overrideId, setOverride } = useDesignOverride();

  useEffect(() => {
    const onChange = () => force((n) => n + 1);
    listeners.add(onChange);
    ensurePolling();
    if (!cache) void ensureLoaded().then(onChange);
    return () => {
      listeners.delete(onChange);
    };
  }, []);

  const serverDesign = cache ?? DEFAULTS;
  const chosen = overrideId ? cacheGroup.find((d) => d.id === overrideId) : undefined;

  // Choix devenu invalide (design desactive ou sorti de sa plage) : on nettoie
  // pour que la borne reprenne le fond que le serveur lui attribue.
  useEffect(() => {
    if (overrideId && cacheGroup.length > 0 && !chosen) setOverride(null);
  }, [overrideId, chosen, setOverride]);

  const design = chosen ?? serverDesign;

  const cycle = () => {
    if (cacheGroup.length < 2) return;
    const at = cacheGroup.findIndex((d) => d.id === design.id);
    const next = cacheGroup[(at + 1) % cacheGroup.length];
    setOverride(next.id);
  };

  return { loading: !cache, design, designs: cacheGroup, cycle };
}
