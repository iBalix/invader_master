/**
 * Session blackjack temps réel.
 *
 * Contrairement aux échecs (delta d'un coup), le signal 'sync' du blackjack
 * porte un SNAPSHOT COMPLET de la vue publique : N joueurs agissent en
 * parallèle (mises, jokers hors tour), un delta serait fragile. Le chemin
 * rapide applique donc le snapshot si sa version avance ; le GET /state ne
 * sert plus qu'au démarrage, à la reprise et au bloc privé `you`.
 *
 * `you` (contenu des jokers, token de revanche) est rafraîchi quand la vue
 * publique révèle un écart : mon compte de jokers public != mon contenu
 * privé connu, ou une revanche existe sans mon token.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRealtimeTopic } from '../../../hooks/useRealtimeTopic';
import { bjApi } from '../lib/bjApi';
import type { BjPublicState, BjStateResponse, BjYou } from '../lib/bjTypes';

const POLL_PLAYING_MS = 2_500;
const POLL_IDLE_MS = 10_000;

interface BjSyncPayload {
  snapshot?: BjPublicState;
}

export interface UseBjSessionResult {
  state: BjPublicState | null;
  you: BjYou | null;
  error: string | null;
  refresh: () => Promise<void>;
  applyResponse: (data: BjStateResponse) => void;
}

export function useBjSession(sessionId: string | null, playerToken: string | null): UseBjSessionResult {
  const [state, setState] = useState<BjPublicState | null>(null);
  const [you, setYou] = useState<BjYou | null>(null);
  const [error, setError] = useState<string | null>(null);
  const versionRef = useRef(0);
  const youRef = useRef<BjYou | null>(null);
  const tokenRef = useRef(playerToken);
  tokenRef.current = playerToken;
  const refreshing = useRef(false);
  const pendingRefresh = useRef(false);

  const applyResponse = useCallback((data: BjStateResponse) => {
    if (data.state.v >= versionRef.current) {
      versionRef.current = data.state.v;
      setState(data.state);
      if (data.you !== undefined) {
        youRef.current = data.you;
        setYou(data.you);
      }
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
          const data = await bjApi.state(sessionId, usedToken ?? undefined);
          if (data.state.v >= versionRef.current) {
            versionRef.current = data.state.v;
            setState(data.state);
            if (usedToken === tokenRef.current) {
              youRef.current = data.you;
              setYou(data.you);
            }
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
    youRef.current = null;
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
  const playing = state !== null && state.status !== 'lobby' && state.status !== 'end';
  const pollMs = playing ? POLL_PLAYING_MS : POLL_IDLE_MS;
  useEffect(() => {
    if (!sessionId) return;
    void refresh();
    const interval = setInterval(() => void refresh(), pollMs);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    const onOnline = () => void refresh();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
    };
  }, [sessionId, refresh, pollMs]);

  // realtime : snapshot complet appliqué directement s'il avance la version
  useRealtimeTopic(sessionId ? `game:${sessionId}` : null, (e) => {
    if (e.event !== 'sync') return;
    const snapshot = (e.payload as unknown as BjSyncPayload).snapshot;
    if (!snapshot || typeof snapshot.v !== 'number') {
      void refresh();
      return;
    }
    if (snapshot.v <= versionRef.current) return;
    versionRef.current = snapshot.v;
    setState(snapshot);

    // le bloc privé est-il périmé ? (jokers piochés/joués, revanche créée)
    const token = tokenRef.current;
    if (!token) return;
    const my = youRef.current;
    const mySeat = my ? snapshot.seats.find((s) => s.playerId === my.playerId) : null;
    const jokersStale = mySeat !== null && mySeat !== undefined && my !== null && mySeat.jokerCount !== my.jokers.length;
    const rematchStale =
      my !== null &&
      snapshot.rematch?.sessionId != null &&
      snapshot.rematch.offers.includes(my.playerId) &&
      my.rematch === null;
    if (my === null || jokersStale || rematchStale) void refresh();
  });

  return { state, you, error, refresh, applyResponse };
}
