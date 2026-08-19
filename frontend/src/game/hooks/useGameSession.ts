/**
 * Hook central des surfaces de jeu (joueur, écrans, GM light).
 *
 * Protocole auto-réparant :
 * - les events realtime portent state_version : trou détecté => refetch
 * - refetch au retour de veille (visibilitychange) et à la reconnexion
 * - poll de secours toutes les 10 s
 * Les timers utilisent l'horloge serveur (offset estimé sur chaque fetch).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  gameApi,
  serverNow,
  subscribeToGame,
  updateClock,
  type GameEvent,
  type PublicState,
  type You,
} from '../lib/gameClient';

const POLL_MS = 10000;

export interface UseGameSessionOptions {
  playerToken?: string | null;
  onEvent?: (e: GameEvent) => void;
}

export function useGameSession(idOrCode: string | null, options: UseGameSessionOptions = {}) {
  const [state, setState] = useState<PublicState | null>(null);
  const [you, setYou] = useState<You | null>(null);
  const [error, setError] = useState<string | null>(null);
  const versionRef = useRef(0);
  const tokenRef = useRef(options.playerToken ?? null);
  tokenRef.current = options.playerToken ?? null;
  const onEventRef = useRef(options.onEvent);
  onEventRef.current = options.onEvent;
  const refreshing = useRef(false);
  const pendingRefresh = useRef(false);

  const refresh = useCallback(async () => {
    if (!idOrCode) return;
    // un refresh demandé pendant un refresh en vol n'est JAMAIS jeté : il est
    // mis en file et rejoué (sinon un sync realtime arrivant au mauvais moment
    // laisse le client bloqué sur la phase précédente jusqu'au poll suivant)
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
          const t0 = Date.now();
          const data = await gameApi.state(idOrCode, usedToken ?? undefined);
          const t1 = Date.now();
          updateClock(data.state.serverNow, t0, t1);
          if (data.state.v >= versionRef.current) {
            versionRef.current = data.state.v;
            setState(data.state);
            // "you" n'est mis à jour que par une réponse requêtée avec le token
            // COURANT : une requête partie sans token (ou avec un ancien) qui se
            // termine après un join ne doit pas écraser l'identité fraîche
            if (usedToken !== null && usedToken === tokenRef.current) setYou(data.you);
          }
          setError(null);
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Erreur réseau');
        }
      } while (pendingRefresh.current);
    } finally {
      refreshing.current = false;
    }
  }, [idOrCode]);

  // un token qui apparaît (join, reprise d'identité) => refetch immédiat avec ce token
  const token = options.playerToken ?? null;
  useEffect(() => {
    if (token) void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // fetch initial + poll de secours
  useEffect(() => {
    if (!idOrCode) return;
    versionRef.current = 0;
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
  }, [idOrCode, refresh]);

  // realtime : sync => refetch si version en avance ; autres events => callback
  useEffect(() => {
    const sessionId = state?.id;
    if (!sessionId) return;
    const unsubscribe = subscribeToGame(sessionId, (e) => {
      if (e.event === 'sync') {
        const v = (e.payload.v as number) ?? 0;
        if (v > versionRef.current) void refresh();
      } else {
        if (e.event === 'answered') {
          // patch opportuniste du compteur (écrans)
          setState((prev) =>
            prev && prev.currentQuestionIndex === (e.payload.qi as number)
              ? { ...prev }
              : prev,
          );
        }
        onEventRef.current?.(e);
      }
    });
    return unsubscribe;
  }, [state?.id, refresh]);

  return { state, you, error, refresh, setYou };
}

/** Compte à rebours basé horloge serveur ; re-render ~4x/s */
export function usePhaseCountdown(phaseEndsAt: number | null): number | null {
  const [remaining, setRemaining] = useState<number | null>(null);
  useEffect(() => {
    if (phaseEndsAt === null) {
      setRemaining(null);
      return;
    }
    const update = () => setRemaining(Math.max(0, phaseEndsAt - serverNow()));
    update();
    const interval = setInterval(update, 250);
    return () => clearInterval(interval);
  }, [phaseEndsAt]);
  return remaining;
}
