/**
 * Liste des parties du bar : topic realtime 'chess:lobby' (signal de relecture)
 * + poll de secours 15 s + relecture au retour de veille.
 */

import { useCallback, useEffect, useState } from 'react';
import { chessApi } from '../lib/chessApi';
import { useRealtimeTopic } from './useRealtimeTopic';
import type { ChessLobbyItem } from '../lib/chessTypes';

/**
 * Filet de secours si le signal temps réel n'arrive pas. Court volontairement :
 * on regarde le lobby en attendant qu'une partie apparaisse, et personne
 * n'attend 15 s avant de recharger la page. La requête est légère (une liste
 * de parties ouvertes).
 */
const POLL_MS = 4_000;

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

  // signal "la liste a changé" : abonnement auto-réparant (le canal peut
  // mourir après une coupure wifi et rester muet)
  useRealtimeTopic('chess:lobby', () => void reload());

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
