/**
 * Records du bar d'un jeu : top N des meilleures performances par pseudo,
 * GET /public/<mode>/records. Générique : n'importe quel jeu qui expose la
 * même route peut l'utiliser (Flappy Bar aujourd'hui, les suivants demain).
 *
 * Le backend diffuse 'sync' sur le topic '<mode>:records' après chaque
 * record enregistré ; poll de secours 15 s et relecture au retour de veille
 * ou de réseau, comme les lobbys.
 */

import { useCallback, useEffect, useState } from 'react';
import { publicApi } from '../lib/tablesApi';
import { useRealtimeTopic } from './useRealtimeTopic';
import type { BarRecordItem } from '../games/flappybar/lib/flapTypes';

export type { BarRecordItem };

const POLL_MS = 15_000;

export interface UseBarRecordsResult {
  items: BarRecordItem[];
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

/** lecture défensive : { items } attendu, mais on tolère { data: { items } } */
function extractItems(data: unknown): BarRecordItem[] {
  const root = data as { items?: unknown; data?: { items?: unknown } } | null | undefined;
  const raw = root?.items ?? root?.data?.items;
  return Array.isArray(raw) ? (raw as BarRecordItem[]) : [];
}

export function useBarRecords(mode: string, limit = 10): UseBarRecordsResult {
  const [items, setItems] = useState<BarRecordItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const { data } = await publicApi.get(`/${mode}/records`, { params: { limit } });
      setItems(extractItems(data));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'network');
    } finally {
      setLoading(false);
    }
  }, [mode, limit]);

  useRealtimeTopic(`${mode}:records`, () => void reload());

  useEffect(() => {
    setLoading(true);
    void reload();
    const interval = setInterval(() => void reload(), POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void reload();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onVisible);
    };
  }, [reload]);

  return { items, loading, error, reload };
}
