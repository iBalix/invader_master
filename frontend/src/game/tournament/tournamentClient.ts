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
  claim: (
    idOrCode: string,
    body: {
      playerToken: string;
      groupId?: string;
      matchId?: string;
      places: string[];
      loserGames?: 0 | 1 | 2 | null;
    },
  ) =>
    timed(() =>
      request<StateResponse>(`/public/tournament/${encodeURIComponent(idOrCode)}/claim`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    ),
};

// ---------------------------------------------------------------------------
// Identité : plusieurs personnes peuvent partager un téléphone, échecs compris.
// L'ancien format (un seul jeton) reste lisible.
// ---------------------------------------------------------------------------

const IDENTITY_KEY = 'invader_tournament_identity';

export interface IdentityEntry {
  playerToken: string;
  pseudo: string;
  savedAt: number;
}

interface PhoneBook {
  active: string | null;
  players: IdentityEntry[];
}

function isEntry(v: unknown): v is IdentityEntry {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return typeof o.playerToken === 'string' && typeof o.pseudo === 'string';
}

function readStore(): Record<string, unknown> {
  try {
    const raw = localStorage.getItem(IDENTITY_KEY);
    return raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function bookOf(value: unknown): PhoneBook {
  if (!value || typeof value !== 'object') return { active: null, players: [] };
  const v = value as Record<string, unknown>;
  if (Array.isArray(v.players)) {
    const players = v.players.filter(isEntry);
    const active = typeof v.active === 'string' && players.some((p) => p.playerToken === v.active) ? v.active : players[0]?.playerToken ?? null;
    return { active, players };
  }
  if (isEntry(v)) return { active: v.playerToken, players: [{ ...v, savedAt: v.savedAt ?? Date.now() }] };
  return { active: null, players: [] };
}

function newest(book: PhoneBook): number {
  return book.players.reduce((max, p) => Math.max(max, p.savedAt ?? 0), 0);
}

function writeStore(all: Record<string, unknown>): void {
  const entries = Object.entries(all)
    .map(([id, value]) => [id, bookOf(value)] as const)
    .sort((a, b) => newest(b[1]) - newest(a[1]))
    .slice(0, 10);
  try {
    localStorage.setItem(IDENTITY_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    /* stockage plein ou désactivé : l'inscription reste valable pour cet onglet */
  }
}

function writeBook(sessionId: string, book: PhoneBook): void {
  const all = readStore();
  all[sessionId] = book;
  writeStore(all);
}

export function listPhonePlayers(sessionId: string): IdentityEntry[] {
  return bookOf(readStore()[sessionId]).players;
}

export function loadTournamentIdentity(sessionId: string): IdentityEntry | null {
  const book = bookOf(readStore()[sessionId]);
  return book.players.find((p) => p.playerToken === book.active) ?? book.players[0] ?? null;
}

/** ajoute ou met à jour un inscrit de ce téléphone, et le rend actif */
export function saveTournamentIdentity(sessionId: string, playerToken: string, pseudo: string): void {
  const book = bookOf(readStore()[sessionId]);
  const existing = book.players.find((p) => p.playerToken === playerToken);
  if (existing) {
    existing.pseudo = pseudo;
    existing.savedAt = Date.now();
  } else {
    book.players.push({ playerToken, pseudo, savedAt: Date.now() });
  }
  book.active = playerToken;
  writeBook(sessionId, book);
}

export function selectPhonePlayer(sessionId: string, playerToken: string): void {
  const book = bookOf(readStore()[sessionId]);
  if (!book.players.some((p) => p.playerToken === playerToken)) return;
  book.active = playerToken;
  writeBook(sessionId, book);
}

/** retire un inscrit de ce téléphone. Renvoie le jeton encore actif, ou null. */
export function forgetPhonePlayer(sessionId: string, playerToken: string): string | null {
  const all = readStore();
  const book = bookOf(all[sessionId]);
  book.players = book.players.filter((p) => p.playerToken !== playerToken);
  if (book.players.length === 0) {
    delete all[sessionId];
    writeStore(all);
    return null;
  }
  if (!book.players.some((p) => p.playerToken === book.active)) book.active = book.players[0].playerToken;
  all[sessionId] = book;
  writeStore(all);
  return book.active;
}

export function clearTournamentIdentity(sessionId: string): void {
  const all = readStore();
  delete all[sessionId];
  writeStore(all);
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

/** « Match en 1 partie · Victoire 2 · Nul 1 · Défaite 0 », ou le résumé d'une salve */
export function formatSummary(state: {
  format?: string;
  game?: string;
  config: Pick<TournamentPublicState['config'], 'match' | 'points'> & {
    format?: string;
    game?: string;
    groupSize?: number;
    placementPoints?: number[];
    parallelSlots?: number;
    poolWinPoints?: number;
    grouping?: 'swiss' | 'random';
  };
}): string {
  const cfg = state.config;
  const formatKind = cfg.format ?? state.format;
  const game = cfg.game ?? state.game;
  if (formatKind === 'waves' || game === 'mariokart' || game === 'smash') {
    const slots = cfg.parallelSlots ?? 2;
    if (game === 'smash') {
      return `Matchs à 2 · ${cfg.poolWinPoints ?? 1} pt par victoire en poules · ${slots} en même temps`;
    }
    const bareme = (cfg.placementPoints ?? [4, 3, 2, 1]).join('/');
    return `Groupes de ${cfg.groupSize ?? 4} max · ${bareme} · ${slots} en même temps · ${cfg.grouping === 'random' ? 'tirage au sort' : 'selon le classement'}`;
  }
  const { match, points } = cfg;
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
  error_tournament_not_in_match: 'Tu ne joues pas ce match',
  error_tournament_claim_closed: 'Ce résultat ne peut plus être saisi',
  error_tournament_bad_result: 'Ordre ou score invalide',
};

export function tournamentErrorLabel(err: unknown): string {
  if (err instanceof ApiError) return ERROR_LABELS[err.message] ?? err.message;
  return 'Erreur réseau, réessaie';
}
