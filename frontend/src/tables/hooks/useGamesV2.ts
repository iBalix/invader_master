/**
 * Recupere le catalogue de jeux v2 via /public/games-v2.
 *
 * Difference avec useGames :
 *  - categories enrichies (iconName, color, textureUrl)
 *  - consoles avec displayName
 *  - games avec maxPlayers, youtube_*, control_*
 */

import { useEffect, useState } from 'react';
import { publicApi } from '../lib/tablesApi';

export interface GameCategoryV2 {
  id: string;
  name: string;
  nameEn?: string | null;
  displayOrder?: number;
  iconName?: string | null;
  color?: string | null;
  textureUrl?: string | null;
}

export interface GameConsoleV2 {
  id: string;
  name: string;
  displayName?: string | null;
  library?: string;
  logoUrl?: string | null;
}

export interface GameV2 {
  id: string;
  name: string;
  subtitle?: string | null;
  description?: string | null;
  fileName?: string | null;
  coverUrl?: string | null;
  consoleId?: string;
  consoleName?: string | null;
  consoleDisplayName?: string | null;
  consoleLibrary?: string | null;
  consoleLogoUrl?: string | null;
  categories: string[];
  images: string[];
  gameType?: string | null;
  gameUrl?: string | null;
  multiplayer?: boolean;
  controllerCount?: number | null;
  displayOrder?: number;
  maxPlayers?: number;
  youtubeVideoId?: string | null;
  youtubeStartSec?: number;
  youtubeDurationSec?: number | null;
  controlA?: string | null;
  controlB?: string | null;
  controlX?: string | null;
  controlY?: string | null;
  controlL?: string | null;
  controlR?: string | null;
  controlStart?: string | null;
  controlSelect?: string | null;
  specialNote?: string | null;
}

export interface GamesV2Payload {
  categories: GameCategoryV2[];
  consoles: GameConsoleV2[];
  games: GameV2[];
}

interface State {
  loading: boolean;
  data: GamesV2Payload | null;
  error: string | null;
}

export function useGamesV2(): State {
  const [state, setState] = useState<State>({ loading: true, data: null, error: null });

  useEffect(() => {
    let cancelled = false;
    publicApi
      .get<GamesV2Payload>('/games-v2')
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
