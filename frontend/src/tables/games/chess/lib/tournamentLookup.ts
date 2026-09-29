/**
 * Tournoi vu depuis les dalles d'échecs : ce pseudo participe-t-il au tournoi
 * en cours, contre qui doit-il jouer, cette partie comptera-t-elle ?
 *
 * Tout est INDICATIF : le serveur revérifie à la fin de la partie (deux
 * joueurs appariés dans la ronde en cours, match non décidé, partie créée
 * après le tirage). Le jeu d'échecs lui-même ne connaît pas le tournoi.
 */

import { publicApi } from '../../../lib/tablesApi';

export type TournamentHint =
  | 'registration'
  | 'play'
  | 'playing'
  | 'wait_bye'
  | 'bonus'
  | 'done'
  | 'next_round'
  | 'round_done'
  | 'left'
  | 'final';

export interface TournamentLookup {
  tournament: { id: string; joinCode: string; title: string; phase: string; round: number | null; gameLabel: string };
  player: { id: string; pseudo: string; exact: boolean; status: string; rank: number | null; points: number };
  hint: TournamentHint;
  match: {
    id: string;
    board: number;
    kind: string;
    opponent: string | null;
    color: 'w' | 'b' | null;
    status: string;
    score: { me: number; them: number };
    games: number;
    countsForMe: boolean;
  } | null;
  opponentCheck: { pseudo: string; counts: boolean; expected: string | null } | null;
}

export interface ChessTournamentContext {
  tournament: { id: string; title: string; round: number | null };
  counted: boolean;
  pending: boolean;
  reason: string | null;
  match: {
    id: string;
    board: number;
    kind: string;
    status: string;
    decided: boolean;
    score: { w: number; b: number };
    points: { w: number; b: number } | null;
    remaining: number;
  } | null;
}

export type LobbyTournamentInfo = { title: string; round: number | null; opponent: string | null; hint: TournamentHint } | null;

export const tournamentLookupApi = {
  async lookup(pseudo: string, opponent?: string | null): Promise<TournamentLookup | null> {
    const { data } = await publicApi.get('/tournament/lookup', {
      params: { game: 'chess', pseudo, ...(opponent ? { opponent } : {}) },
    });
    return (data?.data ?? null) as TournamentLookup | null;
  },
  async lookupMany(pseudos: string[]): Promise<Record<string, LobbyTournamentInfo>> {
    if (pseudos.length === 0) return {};
    const { data } = await publicApi.get('/tournament/lookup-many', {
      params: { game: 'chess', pseudos: pseudos.join(',') },
    });
    return (data?.data ?? {}) as Record<string, LobbyTournamentInfo>;
  },
  async gameContext(chessId: string): Promise<ChessTournamentContext | null> {
    const { data } = await publicApi.get(`/tournament/chess-game/${encodeURIComponent(chessId)}`);
    return (data?.data ?? null) as ChessTournamentContext | null;
  },
};

export function fmtHalf(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ',');
}
