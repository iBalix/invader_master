/**
 * Session de tournoi (écrans, téléphones) : même protocole auto-réparant que
 * le quiz, avec un instantané COMPLET de la vue publique dans le signal
 * 'sync' (comme le blackjack). Un signal plus récent que notre version est
 * peint tel quel, sans GET : quarante téléphones ne relisent pas /state à
 * chaque inscription ou résultat.
 *
 * Filets : sondage de secours (10 s, 2 s si le canal est muet), relecture au
 * retour de veille et du réseau, relecture à la fin du compte à rebours.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { serverNow, subscribeToGame } from '../lib/gameClient';
import { tournamentApi } from './tournamentClient';
import type { TournamentPublicState, TournamentYou } from './tournamentTypes';

const POLL_MS = 10_000;
const POLL_SANS_TEMPS_REEL_MS = 2_000;

export interface UseTournamentSession {
  state: TournamentPublicState | null;
  you: TournamentYou | null;
  /** une réponse requêtée avec notre jeton est revenue sans « you » */
  youAbsent: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  apply: (data: { state: TournamentPublicState; you?: TournamentYou | null }) => void;
}

export function useTournamentSession(idOrCode: string | null, playerToken: string | null): UseTournamentSession {
  const [state, setState] = useState<TournamentPublicState | null>(null);
  const [you, setYou] = useState<TournamentYou | null>(null);
  const [youAbsent, setYouAbsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const versionRef = useRef(0);
  const tokenRef = useRef(playerToken);
  tokenRef.current = playerToken;
  const refreshing = useRef(false);
  const pending = useRef(false);
  const [tempsReel, setTempsReel] = useState(true);

  const apply = useCallback((data: { state: TournamentPublicState; you?: TournamentYou | null }) => {
    if (data.state.v >= versionRef.current) {
      versionRef.current = data.state.v;
      setState(data.state);
    }
    if (data.you !== undefined) {
      setYou(data.you);
      setYouAbsent(data.you === null && tokenRef.current !== null);
    }
  }, []);

  const refresh = useCallback(async () => {
    if (!idOrCode) return;
    if (refreshing.current) {
      pending.current = true;
      return;
    }
    refreshing.current = true;
    try {
      do {
        pending.current = false;
        const usedToken = tokenRef.current;
        try {
          const data = await tournamentApi.state(idOrCode, usedToken);
          if (data.state.v >= versionRef.current) {
            versionRef.current = data.state.v;
            setState(data.state);
          }
          // « you » seulement depuis une réponse faite avec le jeton COURANT
          if (usedToken !== null && usedToken === tokenRef.current) {
            setYou(data.you);
            setYouAbsent(data.you === null);
          }
          setError(null);
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Erreur réseau');
        }
      } while (pending.current);
    } finally {
      refreshing.current = false;
    }
  }, [idOrCode]);

  // changement de tournoi : repartir de zéro
  useEffect(() => {
    versionRef.current = 0;
    setState(null);
    setYou(null);
    setYouAbsent(false);
    setError(null);
  }, [idOrCode]);

  // un jeton qui apparaît (inscription, reprise) : relecture avec ce jeton
  useEffect(() => {
    setYouAbsent(false);
    if (playerToken) void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerToken]);

  useEffect(() => {
    if (!idOrCode) return;
    void refresh();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onVisible);
    };
  }, [idOrCode, refresh]);

  useEffect(() => {
    if (!idOrCode) return;
    const t = setInterval(() => void refresh(), tempsReel ? POLL_MS : POLL_SANS_TEMPS_REEL_MS);
    return () => clearInterval(t);
  }, [idOrCode, refresh, tempsReel]);

  // fin du compte à rebours (ou du podium) : le tirage se lit aussitôt
  const phaseEndsAt = state?.phaseEndsAt ?? null;
  useEffect(() => {
    if (!phaseEndsAt) return;
    const dans = phaseEndsAt - serverNow() + 250 + Math.random() * 450;
    if (dans < 0 || dans > 3 * 60 * 60_000) return;
    const version = versionRef.current;
    const t = window.setTimeout(() => {
      if (versionRef.current > version) return;
      void refresh();
    }, dans);
    return () => window.clearTimeout(t);
  }, [phaseEndsAt, refresh]);

  // temps réel : instantané complet appliqué s'il avance la version
  const sessionId = state?.id ?? null;
  useEffect(() => {
    if (!sessionId) return;
    return subscribeToGame(
      sessionId,
      (e) => {
        if (e.event !== 'sync') return;
        setTempsReel(true);
        const snapshot = e.payload.snapshot as TournamentPublicState | undefined;
        const v = (e.payload.v as number) ?? snapshot?.v ?? 0;
        if (v <= versionRef.current) return;
        if (snapshot && typeof snapshot.v === 'number') {
          versionRef.current = snapshot.v;
          setState(snapshot);
          return;
        }
        void refresh();
      },
      (vivant) => {
        setTempsReel(vivant);
        if (vivant) void refresh();
      },
    );
  }, [sessionId, refresh]);

  return { state, you, youAbsent, error, refresh, apply };
}

/** horloge serveur, re-rendue toutes les `stepMs` (rotation, comptes à rebours) */
export function useServerNow(stepMs = 500): number {
  const [now, setNow] = useState(() => serverNow());
  useEffect(() => {
    const t = setInterval(() => setNow(serverNow()), stepMs);
    return () => clearInterval(t);
  }, [stepMs]);
  return now;
}
