/**
 * Session Flappy Bar temps réel.
 *
 * Comme le blackjack, le signal 'sync' porte un SNAPSHOT COMPLET de la vue
 * publique : N joueurs meurent en parallèle, un delta serait fragile. Le
 * chemin rapide applique le snapshot s'il avance la version ; le GET /state
 * ne sert qu'au démarrage, à la reprise et au bloc privé `you`.
 *
 * Les flaps de la manche ne passent PAS par ici (WebSocket, cf. useFlapNet) :
 * l'état de session ne change qu'aux morts, aux départs et aux fins de manche.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRealtimeTopic } from '../../../hooks/useRealtimeTopic';
import { serverNow } from '../../../lib/clockSync';
import { flapApi } from '../lib/flapApi';
import type { FlapPublicState, FlapStateResponse, FlapYou } from '../lib/flapTypes';

const POLL_PLAYING_MS = 1_200;
const POLL_IDLE_MS = 10_000;

interface FlapSyncPayload {
  snapshot?: FlapPublicState;
}

/** comment le dernier état est arrivé (badge de diagnostic ?debug=1) */
export interface SyncInfo {
  via: 'realtime' | 'fetch';
  /** âge du snapshot à son application (ms, horloge serveur) */
  ageMs: number;
  at: number;
}

export interface UseFlapSessionResult {
  state: FlapPublicState | null;
  you: FlapYou | null;
  error: string | null;
  refresh: () => Promise<void>;
  applyResponse: (data: FlapStateResponse) => void;
  syncInfo: SyncInfo | null;
}

export function useFlapSession(sessionId: string | null, playerToken: string | null): UseFlapSessionResult {
  const [state, setState] = useState<FlapPublicState | null>(null);
  const [you, setYou] = useState<FlapYou | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [syncInfo, setSyncInfo] = useState<SyncInfo | null>(null);
  const versionRef = useRef(0);
  const youRef = useRef<FlapYou | null>(null);
  const tokenRef = useRef(playerToken);
  tokenRef.current = playerToken;
  const refreshing = useRef(false);
  const pendingRefresh = useRef(false);

  const applyResponse = useCallback((data: FlapStateResponse) => {
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
          const data = await flapApi.state(sessionId, usedToken ?? undefined);
          if (data.state.v >= versionRef.current) {
            if (data.state.v > versionRef.current) {
              setSyncInfo({ via: 'fetch', ageMs: 0, at: Date.now() });
            }
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

  // changement de session : repartir de zéro
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

  // fetch initial + poll de secours + retours de veille/réseau. La salle
  // d'attente sonde aussi vite qu'une manche : voir arriver un joueur ou
  // partir le compte à rebours ne doit jamais attendre un cycle long.
  const active = state !== null && state.status !== 'end';
  const pollMs = active ? POLL_PLAYING_MS : POLL_IDLE_MS;
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
    const snapshot = (e.payload as unknown as FlapSyncPayload).snapshot;
    if (!snapshot || typeof snapshot.v !== 'number') {
      void refresh();
      return;
    }
    if (snapshot.v <= versionRef.current) return;
    versionRef.current = snapshot.v;
    setState(snapshot);
    setSyncInfo({ via: 'realtime', ageMs: Math.max(0, serverNow() - snapshot.serverNow), at: Date.now() });

    // le bloc privé est-il périmé ? (mon résultat de manche, mon statut, une
    // manche qui commence ou finit)
    const token = tokenRef.current;
    if (!token) return;
    const my = youRef.current;
    if (my === null) {
      void refresh();
      return;
    }
    const mine = snapshot.players.find((p) => p.playerId === my.playerId);
    const statusStale = mine !== undefined && mine.status !== my.status;
    const inRoundNow = snapshot.round !== null && snapshot.round.participants.includes(my.playerId);
    const roundStale = inRoundNow !== my.inRound;
    const result = snapshot.round?.results[my.playerId];
    const resultStale = result !== undefined && my.result !== null && result.alive !== my.result.alive;
    if (mine === undefined || statusStale || roundStale || resultStale) void refresh();
  });

  return { state, you, error, refresh, applyResponse, syncInfo };
}
