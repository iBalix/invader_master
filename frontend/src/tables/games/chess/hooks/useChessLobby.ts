/**
 * Liste des parties du bar : topic realtime 'chess:lobby' (signal de relecture)
 * + poll de secours 15 s + relecture au retour de veille.
 */

import { useCallback, useEffect, useState } from 'react';
import { subscribeTopic } from '../../../lib/realtime';
import { chessApi } from '../lib/chessApi';
import type { ChessLobbyItem } from '../lib/chessTypes';

const POLL_MS = 15_000;

export function useChessLobby() {
  const [items, setItems] = useState<ChessLobbyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const list = await chessApi.lobby();
      setItems(list);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'network');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
    const interval = setInterval(() => void reload(), POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void reload();
    };
    document.addEventListener('visibilitychange', onVisible);
    const unsubscribe = subscribeTopic('chess:lobby', () => void reload());
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
      unsubscribe();
    };
  }, [reload]);

  return { items, loading, error, reload };
}
