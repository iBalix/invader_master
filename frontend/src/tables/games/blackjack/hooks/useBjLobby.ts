/**
 * Liste des tables de blackjack du bar : topic realtime 'blackjack:lobby'
 * (signal de relecture) + poll de secours 4 s + relecture au retour de veille.
 */

import { useCallback, useEffect, useState } from 'react';
import { useRealtimeTopic } from '../../../hooks/useRealtimeTopic';
import { bjApi } from '../lib/bjApi';
import type { BjLobbyItem } from '../lib/bjTypes';

const POLL_MS = 4_000;

export function useBjLobby() {
  const [items, setItems] = useState<BjLobbyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const list = await bjApi.lobby();
      setItems(list);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'network');
    } finally {
      setLoading(false);
    }
  }, []);

  useRealtimeTopic('blackjack:lobby', () => void reload());

  useEffect(() => {
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
