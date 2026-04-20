/**
 * Recupere le payload home (featured + liveEvent + nextEvent) pour le hostname courant.
 *
 * Le live event etant aussi mis a jour via Pusher (useLiveEvent), on
 * combine les deux sources : la valeur du hook useLiveEvent ecrase
 * celle du fetch initial.
 */

import { useEffect, useState } from 'react';
import { tablesApi } from '../lib/tablesApi';
import type { HomeFeatured, UpcomingEvent } from '../types';

interface State {
  loading: boolean;
  featured: HomeFeatured[];
  nextEvent: UpcomingEvent | null;
}

export function useTableHome(hostname: string | undefined | null): State {
  const [state, setState] = useState<State>({ loading: true, featured: [], nextEvent: null });

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
        });
      })
      .catch(() => {
        if (cancelled) return;
        setState({ loading: false, featured: [], nextEvent: null });
      });
    return () => {
      cancelled = true;
    };
  }, [hostname]);

  return state;
}
