/**
 * Detection d'une partie en cours sur le moteur de jeu (quiz / battle).
 *
 * Les bornes ne connaissent pas les sessions : elles interrogent l'endpoint
 * public et proposent de rejoindre tant qu'une partie tourne. Store partage au
 * niveau module (un seul fetch pour toutes les bornes montees dans la page).
 */

import { useEffect, useState } from 'react';

const API_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
const REFRESH_MS = 8000;

export interface LiveGame {
  sessionId: string;
  joinCode: string;
  mode: 'quiz' | 'battle';
  gameStatus: string;
}

let current: LiveGame | null = null;
let inFlight: Promise<void> | null = null;
let lastFetch = 0;
const listeners = new Set<(g: LiveGame | null) => void>();

async function fetchCurrent(): Promise<void> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const res = await fetch(`${API_URL}/public/game/current`);
      const body = (await res.json()) as { data?: LiveGame | null };
      current = body?.data ?? null;
    } catch {
      /* backend injoignable : on garde la derniere valeur connue */
    } finally {
      lastFetch = Date.now();
      inFlight = null;
      listeners.forEach((l) => l(current));
    }
  })();
  return inFlight;
}

export function useLiveGame(): LiveGame | null {
  const [game, setGame] = useState<LiveGame | null>(current);

  useEffect(() => {
    listeners.add(setGame);
    if (Date.now() - lastFetch > REFRESH_MS) void fetchCurrent();
    const interval = setInterval(() => void fetchCurrent(), REFRESH_MS);
    return () => {
      listeners.delete(setGame);
      clearInterval(interval);
    };
  }, []);

  return game;
}
