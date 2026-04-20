/**
 * Recupere le catalogue de jeux via /public/games.
 *
 * Le payload contient categories, consoles et games (avec consoleLibrary,
 * categories, images...). On le passe brut au composant qui filtrera.
 */

import { useEffect, useState } from 'react';
import { publicApi } from '../lib/tablesApi';

export interface GameCategory {
  id: string;
  name: string;
  emoji?: string | null;
  iconUrl?: string | null;
  displayOrder?: number;
}

export interface Game {
  id: string;
  name: string;
  subtitle?: string | null;
  description?: string | null;
  fileName?: string | null;
  consoleId?: string;
  consoleName?: string | null;
  consoleLibrary?: string | null;
  consoleLogoUrl?: string | null;
  categories: string[];
  images: string[];
  gameType?: string | null;
  gameUrl?: string | null;
  multiplayer?: boolean;
  controllerCount?: number | null;
  displayOrder?: number;
}

export interface GamesPayload {
  categories: GameCategory[];
  consoles: Array<{ id: string; name: string; library?: string; logoUrl?: string }>;
  games: Game[];
}

interface State {
  loading: boolean;
  data: GamesPayload | null;
  error: string | null;
}

export function useGames(): State {
  const [state, setState] = useState<State>({ loading: true, data: null, error: null });

  useEffect(() => {
    let cancelled = false;
    publicApi
      .get<GamesPayload>('/games')
      .then((res) => {
        if (cancelled) return;
        setState({ loading: false, data: res.data, error: null });
      })
      .catch((err) => {
        if (cancelled) return;
        setState({
          loading: false,
          data: null,
          error: err?.response?.data?.error ?? 'Impossible de charger les jeux',
        });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
