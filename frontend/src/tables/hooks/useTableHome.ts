/**
 * Recupere le payload home (featured + liveEvent + nextEvent) pour le hostname courant.
 *
 * Le live event etant aussi mis a jour via Pusher (useLiveEvent), on
 * combine les deux sources : la valeur du hook useLiveEvent ecrase
 * celle du fetch initial.
 */

import { useEffect, useState } from 'react';
import { tablesApi } from '../lib/tablesApi';
import type { FeaturedItem, GameVideoRef, TablesSettings, UpcomingEvent } from '../types';

interface State {
  loading: boolean;
  featured: FeaturedItem[];
  nextEvent: UpcomingEvent | null;
  settings: TablesSettings | null;
  menuVideos: string[];
  gameVideos: GameVideoRef[];
}

export function useTableHome(hostname: string | undefined | null): State {
  const [state, setState] = useState<State>({
    loading: true,
    featured: [],
    nextEvent: null,
    settings: null,
    menuVideos: [],
    gameVideos: [],
  });

  useEffect(() => {
    if (!hostname) return;
    let cancelled = false;
    setState((s) => ({ ...s, loading: true }));
    tablesApi
      .get(`/${hostname}/home`)
      .then((res) => {
        if (cancelled) return;
        setState({
          loading: false,
          featured: res.data?.featured ?? [],
          nextEvent: res.data?.nextEvent ?? null,
          settings: res.data?.settings ?? null,
          menuVideos: res.data?.menuVideos ?? [],
          gameVideos: res.data?.gameVideos ?? [],
        });
      })
      .catch(() => {
        if (cancelled) return;
        setState({
          loading: false,
          featured: [],
          nextEvent: null,
          settings: null,
          menuVideos: [],
          gameVideos: [],
        });
      });
    return () => {
      cancelled = true;
    };
  }, [hostname]);

  return state;
}
