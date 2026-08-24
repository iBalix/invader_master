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
  /** Optionnel : nom court affiche borne (jeux v2). Si undefined, fallback sur consoleName. */
  consoleDisplayName?: string | null;
  consoleLibrary?: string | null;
  consoleLogoUrl?: string | null;
  categories: string[];
  /**
   * Jeu reserve aux bornes de la salle : pas de lancement depuis une table.
   * Calcule par le serveur sur le nom NON traduit de la categorie, cf.
   * backend/src/routes/public.ts (la categorie s'appelle "Bornes" en francais
   * et "Arcades" en anglais).
   */
  bornesOnly?: boolean;
  images: string[];
  gameType?: string | null;
  gameUrl?: string | null;
  multiplayer?: boolean;
  controllerCount?: number | null;
  displayOrder?: number;
  /** v2 only — preview YouTube avec fade vers cover dans LaunchGameModal */
  youtubeVideoId?: string | null;
  youtubeStartSec?: number;
  youtubeDurationSec?: number | null;
  /** v2 only — schema manette SNES */
  controlA?: string | null;
  controlB?: string | null;
  controlX?: string | null;
  controlY?: string | null;
  controlL?: string | null;
  controlR?: string | null;
  controlStart?: string | null;
  controlSelect?: string | null;
  /** v2 only — mention speciale affichee dans la modale de lancement */
  specialNote?: string | null;
  /** v2 only — cover bullet path */
  coverUrl?: string | null;
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
