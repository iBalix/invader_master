/**
 * Recupere les reglages globaux des tables tactiles (duree veille, images boutons).
 * Endpoint public sans hostname : /public/tables/settings.
 */

import { useEffect, useState } from 'react';
import { tablesApi } from '../lib/tablesApi';
import type { TablesSettings } from '../types';

interface State {
  loading: boolean;
  settings: TablesSettings | null;
}

export function useTablesSettings(): State {
  const [state, setState] = useState<State>({ loading: true, settings: null });

  useEffect(() => {
    let cancelled = false;
    tablesApi
      .get<{ settings: TablesSettings | null }>(`/settings`)
      .then((res) => {
        if (cancelled) return;
        setState({ loading: false, settings: res.data?.settings ?? null });
      })
      .catch(() => {
        if (cancelled) return;
        setState({ loading: false, settings: null });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
