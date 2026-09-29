/**
 * Tournoi : client public (téléphones, écrans), identité par session et
 * lectures dérivées de la vue publique (mon match, mon rang, libellés).
 */

import { API_URL, ApiError, updateClock } from '../lib/gameClient';
import type {
  ChessSide,
  TMatch,
  TournamentPublicState,
  TournamentYou,
  TRound,
  TStanding,
} from './tournamentTypes';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  const body = (await res.json().catch(() => ({}))) as { status?: string; data?: T; message?: string };
  if (!res.ok || body.status === 'error') {
    throw new ApiError(body.message ?? `Erreur ${res.status}`, res.status);
  }
  return body.data as T;
}

interface StateResponse {
  state: TournamentPublicState;
  you: TournamentYou | null;
}

/** horloge serveur calée sur chaque réponse d'état (comptes à rebours, rotation) */
async function timed<T extends { state?: { serverNow?: number } }>(p: () => Promise<T>): Promise<T> {
  const t0 = Date.now();
  const data = await p();
  const t1 = Date.now();
  if (typeof data?.state?.serverNow === 'number') updateClock(data.state.serverNow, t0, t1);
  return data;
}

export const tournamentApi = {
  current: () =>
    request<{ sessionId: string; joinCode: string; title: string; gameStatus: string } | null>(
      '/public/tournament/current',
    ),
  state: (idOrCode: string, playerToken?: string | null) =>
    timed(() =>
      request<StateResponse>(
        `/public/tournament/${encodeURIComponent(idOrCode)}/state${
          playerToken ? `?playerToken=${encodeURIComponent(playerToken)}` : ''
        }`,
      ),
    ),
  join: (idOrCode: string, body: { pseudo?: string; playerToken?: string; device?: string }) =>
    timed(() =>
      request<StateResponse & { playerToken: string; sessionId: string }>(
        `/public/tournament/${encodeURIComponent(idOrCode)}/join`,
        { method: 'POST', body: JSON.stringify(body) },
      ),
    ),
  leave: (idOrCode: string, playerToken: string) =>
    timed(() =>
      request<StateResponse>(`/public/tournament/${encodeURIComponent(idOrCode)}/leave`, {
        method: 'POST',
        body: JSON.stringify({ playerToken }),
      }),
    ),
  rejoin: (idOrCode: string, playerToken: string) =>
    timed(() =>
      request<StateResponse>(`/public/tournament/${encodeURIComponent(idOrCode)}/rejoin`, {
        method: 'POST',
        body: JSON.stringify({ playerToken }),
      }),
    ),
};

// ---------------------------------------------------------------------------
// Identité : UNE entrée par tournoi (l'identité du quiz est un emplacement
// unique, un quiz joué le même soir l'écraserait)
// ---------------------------------------------------------------------------

const IDENTITY_KEY = 'invader_tournament_identity';

interface IdentityEntry {
  playerToken: string;
  pseudo: string;
  savedAt: number;
}

function readAll(): Record<string, IdentityEntry> {
  try {
    const raw = localStorage.getItem(IDENTITY_KEY);
    return raw ? (JSON.parse(raw) as Record<string, IdentityEntry>) : {};
  } catch {
    return {};
  }
}

export function loadTournamentIdentity(sessionId: string): IdentityEntry | null {
  return readAll()[sessionId] ?? null;
}

export function saveTournamentIdentity(sessionId: string, playerToken: string, pseudo: string): void {
  const all = readAll();
  all[sessionId] = { playerToken, pseudo, savedAt: Date.now() };
  // 10 tournois au plus : les plus anciens partent
  const entries = Object.entries(all).sort((a, b) => b[1].savedAt - a[1].savedAt).slice(0, 10);
  try {
    localStorage.setItem(IDENTITY_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    /* stockage plein ou désactivé : l'inscription reste valable pour cet onglet */
  }
}

export function clearTournamentIdentity(sessionId: string): void {
  const all = readAll();
  delete all[sessionId];
  try {
    localStorage.setItem(IDENTITY_KEY, JSON.stringify(all));
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------------------
// Lectures dérivées
// ---------------------------------------------------------------------------

export function currentRoundOf(state: TournamentPublicState): TRound | null {
  return state.rounds[state.rounds.length - 1] ?? null;
}

export function pseudoOf(state: TournamentPublicState, playerId: string | null): string {
  if (!playerId) return '?';
  return state.players.find((p) => p.id === playerId)?.pseudo ?? '?';
}

export function standingOf(state: TournamentPublicState, playerId: string): TStanding | null {
  return state.standings.find((s) => s.playerId === playerId) ?? null;
}

/** match de ce joueur dans la ronde courante (en cours d'abord, sinon le dernier) */
export function myCurrentMatch(state: TournamentPublicState, playerId: string): TMatch | null {
  const round = currentRoundOf(state);
  if (!round) return null;
  const mine = round.matches.filter((m) => m.a === playerId || m.b === playerId);
  return mine.find((m) => m.status === 'pending' || m.status === 'playing') ?? mine[mine.length - 1] ?? null;
}

/** tous les matchs d'un joueur, du plus ancien au plus récent */
export function myMatches(state: TournamentPublicState, playerId: string): TMatch[] {
  return state.rounds.flatMap((r) => r.matches.filter((m) => m.a === playerId || m.b === playerId));
}

export function opponentOf(match: TMatch, playerId: string): string | null {
  return match.a === playerId ? match.b : match.a;
}

/** couleur conseillée de ce joueur dans le match (le blanc crée la partie) */
export function myColor(match: TMatch, playerId: string): ChessSide | null {
  if (!match.colorA) return null;
  if (match.a === playerId) return match.colorA;
  return match.colorA === 'w' ? 'b' : 'w';
}

export type MyOutcome = 'win' | 'loss' | 'draw' | 'bye' | 'cancelled' | null;

export function outcomeFor(match: TMatch, playerId: string): MyOutcome {
  if (!match.result) return null;
  if (match.result === 'cancelled') return 'cancelled';
  if (match.result === 'bye') return 'bye';
  if (match.result === 'draw') return 'draw';
  const aWins = match.result === 'a' || match.result === 'forfeit_a';
  const iAmA = match.a === playerId;
  return aWins === iAmA ? 'win' : 'loss';
}

/** points gagnés par ce joueur avec ce match (0 pour l'adversaire d'une partie bonus) */
export function pointsFor(match: TMatch, playerId: string): number {
  return match.a === playerId ? match.points.a : match.points.b;
}

export function fmtScore(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ',');
}

export function fmtPoints(n: number): string {
  const s = fmtScore(n);
  return `${s} pt${Math.abs(n) > 1 ? 's' : ''}`;
}

/** tant qu'aucun match n'est joué, tout le monde est 1er ex æquo : on ne l'affiche pas */
export function hasResults(state: Pick<TournamentPublicState, 'standings'>): boolean {
  return state.standings.some((x) => x.played > 0 || x.byes > 0 || x.adjustment !== 0);
}

export function rankLabel(rank: number): string {
  return rank === 1 ? '1er' : `${rank}e`;
}

/** « Match en 1 partie · Victoire 2 · Nul 1 · Défaite 0 » */
export function formatSummary(state: { config: Pick<TournamentPublicState['config'], 'match' | 'points'> }): string {
  const { match, points } = state.config;
  const format =
    match.games === 1
      ? 'Matchs en 1 partie'
      : match.decide === 'best_of'
        ? `Matchs au meilleur des ${match.games} parties`
        : `Matchs en ${match.games} parties`;
  const bareme = match.scoring === 'game' && match.games > 1 ? ' (par partie)' : '';
  return `${format} · Victoire ${fmtScore(points.win)} · Nul ${fmtScore(points.draw)} · Défaite ${fmtScore(points.loss)}${bareme}`;
}

export function roundLabel(state: TournamentPublicState, number: number | null): string {
  if (number === null) return '';
  return state.config.plannedRounds ? `Ronde ${number}/${state.config.plannedRounds}` : `Ronde ${number}`;
}

export function tournamentUrl(joinCode: string): string {
  return `${window.location.origin}/tournoi/${joinCode}`;
}

const ERROR_LABELS: Record<string, string> = {
  error_player_already_exists: 'Ce pseudo est déjà pris dans le tournoi !',
  error_player_invalid_name: 'Pseudo invalide (lettres, chiffres, espaces)',
  error_player_name_too_long: 'Pseudo trop long (16 caractères max)',
  error_registrations_closed: 'Les inscriptions sont fermées',
  error_tournament_full: 'Le tournoi est complet',
  error_tournament_over: 'Le tournoi est terminé',
  error_tournament_not_found: 'Tournoi introuvable',
  error_tournament_excluded: "L'animateur t'a retiré du tournoi",
  error_unknown_player: 'Joueur inconnu, réinscris-toi',
};

export function tournamentErrorLabel(err: unknown): string {
  if (err instanceof ApiError) return ERROR_LABELS[err.message] ?? err.message;
  return 'Erreur réseau, réessaie';
}
