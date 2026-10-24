/**
 * Recupere le catalogue de jeux via /public/games : categories (iconName,
 * color, textureUrl), consoles (displayName) et jeux (maxPlayers, youtube_*,
 * control_*).
 */

import { useEffect, useState } from 'react';
import { publicApi } from '../lib/tablesApi';
import { useLocaleStore } from '../i18n/localeStore';

export interface GameCategory {
  id: string;
  name: string;
  nameEn?: string | null;
  displayOrder?: number;
  iconName?: string | null;
  color?: string | null;
  textureUrl?: string | null;
}

export interface GameConsole {
  id: string;
  name: string;
  displayName?: string | null;
  library?: string;
  logoUrl?: string | null;
}

export interface Game {
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
  /**
   * Configurations de joueurs supportees ('1' | '2' | '3' | '4' | '4+').
   * Optionnel : absent tant que la migration 047 n'est pas appliquee, le filtre
   * retombe alors sur maxPlayers.
   */
  playerCounts?: string[];
  /** jeu reserve aux bornes de la salle : pas de lancement depuis une table */
  bornesOnly?: boolean;
  /**
   * Interrupteur du catalogue : false = masque de la liste des tables. Le
   * filtrage est fait cote serveur (GET /public/games ne renvoie que les
   * jeux actifs), la valeur n'est ici qu'indicative.
   * Optionnel : absent tant que la migration 050 n'est pas appliquee.
   */
  active?: boolean;
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

export interface GamesPayload {
  categories: GameCategory[];
  consoles: GameConsole[];
  games: Game[];
}

interface State {
  loading: boolean;
  data: GamesPayload | null;
  error: string | null;
}

export function useGames(): State {
  const locale = useLocaleStore((s) => s.locale);
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
    // relance au changement de langue : la locale voyage avec la requete
  }, [locale]);

  return state;
}
