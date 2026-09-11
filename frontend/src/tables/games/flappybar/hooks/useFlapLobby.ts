/**
 * Liste des parties de Flappy Bar du bar : topic realtime 'flappybar:lobby'
 * (signal de relecture) + poll de secours 4 s + relecture au retour de veille.
 */

import { useCallback, useEffect, useState } from 'react';
import { useRealtimeTopic } from '../../../hooks/useRealtimeTopic';
import { flapApi } from '../lib/flapApi';
import type { FlapLobbyItem } from '../lib/flapTypes';

const POLL_MS = 4_000;

export function useFlapLobby() {
  const [items, setItems] = useState<FlapLobbyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const list = await flapApi.lobby();
      setItems(list);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'network');
    } finally {
      setLoading(false);
    }
  }, []);

  useRealtimeTopic('flappybar:lobby', () => void reload());

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
