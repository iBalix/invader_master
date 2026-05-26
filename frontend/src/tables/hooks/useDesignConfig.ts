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
 */

import { useEffect, useState } from 'react';
import { tablesApi } from '../lib/tablesApi';

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
let inflight: Promise<DesignConfig> | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<(d: DesignConfig) => void>();

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
    const res = await tablesApi.get<{ design: DesignConfig | null }>(`/design`);
    const next = res.data?.design ?? DEFAULTS;
    if (!cache || !sameDesign(cache, next)) {
      cache = next;
      listeners.forEach((fn) => fn(next));
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
  design: DesignConfig;
}

export function useDesignConfig(): State {
  const [state, setState] = useState<State>(() =>
    cache ? { loading: false, design: cache } : { loading: true, design: DEFAULTS },
  );

  useEffect(() => {
    const onChange = (d: DesignConfig) => setState({ loading: false, design: d });
    listeners.add(onChange);
    ensurePolling();

    if (cache) {
      setState({ loading: false, design: cache });
    } else {
      void ensureLoaded().then((d) => setState({ loading: false, design: d }));
    }

    return () => {
      listeners.delete(onChange);
    };
  }, []);

  return state;
}
