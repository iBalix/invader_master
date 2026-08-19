/**
 * Client du moteur de jeu : API publiques (sans auth), realtime Supabase,
 * synchronisation d'horloge et identité joueur persistée.
 */

import { createClient, type SupabaseClient, type RealtimeChannel } from '@supabase/supabase-js';

export const API_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

// ---------------------------------------------------------------------------
// Types (miroir des vues backend)
// ---------------------------------------------------------------------------

export type QuizStatus =
  | 'lobby' | 'rules' | 'announce' | 'question' | 'locked' | 'reveal'
  | 'leaderboard' | 'cinematic' | 'pause' | 'rewards' | 'end'
  // statuts battle
  | 'round_intro' | 'verdict' | 'round_end' | 'closing';

export type QuestionType = 'qcm' | 'estimation' | 'free_text';

export interface PublicQuestion {
  index: number;
  total: number;
  type: QuestionType;
  difficulty: string;
  points: number;
  theme: string | null;
  question?: string;
  answers?: string[];
  musicUrl?: string | null;
  videoYoutube?: string | null;
  imageQuestionUrl?: string | null;
  imageAnswerUrl?: string | null;
}

export interface PlayerResult {
  answered: boolean;
  correct: boolean;
  points: number;
  qd: boolean;
  value?: string | number;
  gap?: number;
}

export interface RevealData {
  cancelled?: boolean;
  correctIndex?: number;
  correctAnswer?: string;
  expectedNumber?: number;
  expectedAnswer?: string;
  percents?: number[];
  answeredCount: number;
  results: Record<string, PlayerResult>;
  fastest?: string | null;
  bestEstimations?: Array<{ pseudo: string; value: number; gap: number; points: number }>;
  special?: string | null;
}

export interface StandingEntry {
  pseudo: string;
  position: number;
  positionChange: number;
  device: string;
  score?: number;
}

export interface RewardsData {
  fastest: { pseudo: string; avgMs: number } | null;
  bestRatio: { pseudo: string; correct: number; answered: number } | null;
  bestStrike: { pseudo: string; strike: number } | null;
  bonnetDane: { pseudo: string; correct: number; answered: number } | null;
  revealed: number;
}

// --- battle royale ---

export interface BattleRevealData {
  cancelled?: boolean;
  correctIndex?: number;
  correctAnswer?: string;
  answeredCount: number;
  eliminated: Array<{ pseudo: string; reason: 'wrong' | 'timeout' }>;
  repechage: boolean;
  endRoundTie?: boolean;
  survivorsBefore: number;
  survivorsAfter: number;
  milestone: number | null;
  correctPseudos: string[];
  victory?: boolean;
}

export interface BattleStandingEntry {
  playerId: string;
  pseudo: string;
  score: number;
  position: number;
  positionChange: number;
  qualifiedForFinal: boolean;
  isSpectator: boolean;
  device: string;
}

export interface BattleRoundResult {
  roundNumber: number;
  entries: Array<{ pseudo: string; rank: number; bonus: number; survived: boolean }>;
}

export interface PublicBattle {
  roundNumber: number;
  isFinal: boolean;
  survivorCount: number;
  finalSize: number;
  verdictPending: boolean;
  reveal?: BattleRevealData;
  roundResult?: BattleRoundResult;
  generalStandings?: BattleStandingEntry[];
  finalStandings?: BattleStandingEntry[];
  winner?: { playerId: string; pseudo: string } | null;
}

export interface YouBattle {
  generalRank: number | null;
  eliminatedThisRound: boolean;
  roundRank: number | null;
  isFinalist: boolean;
  isSpectator: boolean;
  isFinal: boolean;
  roundNumber: number;
}

export interface PublicState {
  id: string;
  joinCode: string;
  mode: string;
  status: QuizStatus;
  quizName: string;
  v: number;
  serverNow: number;
  phaseStartedAt: number | null;
  phaseEndsAt: number | null;
  currentQuestionIndex: number;
  totalQuestions: number;
  config: {
    announceMs: number;
    questionMs: number;
    qdPerPlayer: number;
    showScores: boolean;
    wifiSsid: string;
    wifiPassword: string;
    pauseText: string;
    musicUrl: string | null;
    musicVolume?: number;
    sfxVolume?: number;
  };
  playerCount: number;
  players: Array<{ pseudo: string; device: string }>;
  question: PublicQuestion | null;
  qdFeed: string[];
  special: string | null;
  judging: boolean;
  reveal?: RevealData;
  standings?: StandingEntry[];
  cinematic?: { step: number };
  rewards?: RewardsData;
  endTexts?: { winnerText: string; endText: string };
  battle?: PublicBattle;
  ended: boolean;
}

export interface You {
  playerId: string;
  pseudo: string;
  score: number;
  status: string;
  qdLeft: number;
  qdActive: boolean;
  answered: boolean;
  strike: number;
  battle?: YouBattle;
}

// ---------------------------------------------------------------------------
// Fetch helpers
// ---------------------------------------------------------------------------

export class ApiError extends Error {
  httpStatus: number;
  constructor(message: string, httpStatus: number) {
    super(message);
    this.httpStatus = httpStatus;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  const body = (await res.json().catch(() => ({}))) as {
    status?: string;
    data?: T;
    items?: T;
    message?: string;
  };
  if (!res.ok || body.status === 'error') {
    throw new ApiError(body.message ?? `Erreur ${res.status}`, res.status);
  }
  return (body.data ?? body.items) as T;
}

export const gameApi = {
  current: () =>
    request<{ sessionId: string; joinCode: string; mode: string; gameStatus: string } | null>(
      '/public/game/current',
    ),
  state: (idOrCode: string, playerToken?: string) =>
    request<{ state: PublicState; you: You | null }>(
      `/public/game/${encodeURIComponent(idOrCode)}/state${
        playerToken ? `?playerToken=${encodeURIComponent(playerToken)}` : ''
      }`,
    ),
  join: (idOrCode: string, body: { pseudo?: string; device?: string; playerToken?: string }) =>
    request<{ playerToken: string; you: You; sessionId: string }>(
      `/public/game/${encodeURIComponent(idOrCode)}/join`,
      { method: 'POST', body: JSON.stringify(body) },
    ),
  leave: (idOrCode: string, playerToken: string) =>
    request<{ left: boolean }>(`/public/game/${encodeURIComponent(idOrCode)}/leave`, {
      method: 'POST',
      body: JSON.stringify({ playerToken }),
    }),
  answer: (
    idOrCode: string,
    body: {
      playerToken: string;
      questionIndex: number;
      answer: { choice?: number; number?: number; text?: string };
      elapsedMs: number | null;
    },
  ) =>
    request<{ recorded: boolean; already: boolean }>(
      `/public/game/${encodeURIComponent(idOrCode)}/answer`,
      { method: 'POST', body: JSON.stringify(body) },
    ),
  bonus: (idOrCode: string, body: { playerToken: string; questionIndex: number }) =>
    request<{ qdLeft: number }>(`/public/game/${encodeURIComponent(idOrCode)}/bonus`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
};

// ---------------------------------------------------------------------------
// Identité joueur (localStorage)
// ---------------------------------------------------------------------------

const IDENTITY_KEY = 'invader_game_identity';

export interface PlayerIdentity {
  sessionId: string;
  playerToken: string;
  pseudo: string;
}

export function loadIdentity(): PlayerIdentity | null {
  try {
    const raw = localStorage.getItem(IDENTITY_KEY);
    return raw ? (JSON.parse(raw) as PlayerIdentity) : null;
  } catch {
    return null;
  }
}

export function saveIdentity(identity: PlayerIdentity): void {
  localStorage.setItem(IDENTITY_KEY, JSON.stringify(identity));
}

export function clearIdentity(): void {
  localStorage.removeItem(IDENTITY_KEY);
}

// ---------------------------------------------------------------------------
// Horloge serveur : offset estimé via les réponses state (rtt/2)
// ---------------------------------------------------------------------------

let clockOffset = 0;
let bestRtt = Infinity;

export function updateClock(serverNow: number, t0: number, t1: number): void {
  const rtt = t1 - t0;
  // on garde l'échantillon au meilleur rtt (le plus fiable), avec un
  // rafraîchissement progressif pour absorber la dérive
  if (rtt <= bestRtt * 1.5) {
    bestRtt = Math.min(bestRtt, rtt);
    clockOffset = serverNow - (t0 + t1) / 2;
  }
}

export function serverNow(): number {
  return Date.now() + clockOffset;
}

// ---------------------------------------------------------------------------
// Realtime Supabase
// ---------------------------------------------------------------------------

let supabase: SupabaseClient | null = null;

function getSupabase(): SupabaseClient | null {
  if (supabase) return supabase;
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (!url || !key) return null;
  supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return supabase;
}

export interface GameEvent {
  event: string;
  payload: Record<string, unknown>;
}

export function subscribeToGame(
  sessionId: string,
  onEvent: (e: GameEvent) => void,
): () => void {
  const client = getSupabase();
  if (!client) return () => undefined;
  const channel: RealtimeChannel = client
    .channel(`game:${sessionId}`)
    .on('broadcast', { event: '*' }, (msg) => {
      onEvent({ event: msg.event, payload: (msg.payload ?? {}) as Record<string, unknown> });
    })
    .subscribe();
  return () => {
    void client.removeChannel(channel);
  };
}
