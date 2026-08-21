/**
 * Session d'échecs temps réel : même protocole auto-réparant que le quiz
 * (garde anti-régression sur v, refetch coalescé, poll de secours 10 s,
 * visibilitychange/online, signal realtime 'sync' sans donnée métier).
 * Les réponses des POST (move/action) portent l'état frais : applyResponse
 * les applique sans refetch.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { subscribeTopic } from '../../../lib/realtime';
import { chessApi } from '../lib/chessApi';
import type { ChessPublicState, ChessStateResponse, ChessYou } from '../lib/chessTypes';

const POLL_MS = 10_000;

export interface UseChessSessionResult {
  state: ChessPublicState | null;
  you: ChessYou | null;
  error: string | null;
  refresh: () => Promise<void>;
  applyResponse: (data: ChessStateResponse) => void;
}

export function useChessSession(
  sessionId: string | null,
  playerToken: string | null,
): UseChessSessionResult {
  const [state, setState] = useState<ChessPublicState | null>(null);
  const [you, setYou] = useState<ChessYou | null>(null);
  const [error, setError] = useState<string | null>(null);
  const versionRef = useRef(0);
  const tokenRef = useRef(playerToken);
  tokenRef.current = playerToken;
  const refreshing = useRef(false);
  const pendingRefresh = useRef(false);

  const applyResponse = useCallback((data: ChessStateResponse) => {
    if (data.state.v >= versionRef.current) {
      versionRef.current = data.state.v;
      setState(data.state);
      setYou(data.you);
    }
  }, []);

  const refresh = useCallback(async () => {
    if (!sessionId) return;
    // un refresh demandé pendant un refresh en vol est mis en file, jamais jeté
    if (refreshing.current) {
      pendingRefresh.current = true;
      return;
    }
    refreshing.current = true;
    try {
      do {
        pendingRefresh.current = false;
        const usedToken = tokenRef.current;
        try {
          const data = await chessApi.state(sessionId, usedToken ?? undefined);
          if (data.state.v >= versionRef.current) {
            versionRef.current = data.state.v;
            setState(data.state);
            // "you" seulement si la requête portait le token courant
            if (usedToken === tokenRef.current) setYou(data.you);
          }
          setError(null);
        } catch (err) {
          setError(err instanceof Error ? err.message : 'network');
        }
      } while (pendingRefresh.current);
    } finally {
      refreshing.current = false;
    }
  }, [sessionId]);

  // changement de session (revanche) : repartir de zéro
  useEffect(() => {
    versionRef.current = 0;
    setState(null);
    setYou(null);
    setError(null);
  }, [sessionId]);

  // un token qui apparaît (join, reprise) => refetch immédiat avec ce token
  useEffect(() => {
    if (playerToken) void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerToken]);

  // fetch initial + poll de secours + retours de veille/réseau
  useEffect(() => {
    if (!sessionId) return;
    void refresh();
    const interval = setInterval(() => void refresh(), POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onVisible);
    };
  }, [sessionId, refresh]);

  // realtime : 'sync' {v} => refetch si le serveur est en avance
  useEffect(() => {
    if (!sessionId) return;
    return subscribeTopic(`game:${sessionId}`, (e) => {
      if (e.event !== 'sync') return;
      const v = (e.payload.v as number) ?? 0;
      if (v > versionRef.current) void refresh();
    });
  }, [sessionId, refresh]);

  return { state, you, error, refresh, applyResponse };
}
