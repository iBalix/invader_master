/**
 * Vues échecs : ce que voient les clients.
 * Règle d'or : la vue publique ne contient JAMAIS les player_token (le topic
 * realtime et GET /state sans token sont accessibles aux spectateurs).
 */

import { Chess } from 'chess.js';
import {
  chessStateOf,
  opponentOf,
  seatColorOf,
  type ChessClockConfig,
  type ChessColor,
  type ChessConfig,
  type ChessResult,
} from './types.js';
import type { PlayerRow, SessionRow } from '../types.js';

export interface ChessSeatView {
  pseudo: string;
  device: string;
}

export interface ChessPublicState {
  id: string;
  joinCode: string;
  mode: 'chess';
  status: 'lobby' | 'playing' | 'end';
  v: number;
  serverNow: number;
  phaseStartedAt: number | null;
  phaseEndsAt: number | null;
  /** bornes de la partie, pour la durée affichée dans le récap de fin */
  startedAt: number | null;
  endedAt: number | null;
  config: { clock: ChessClockConfig | null; theme: string; creatorColor: ChessColor; ai: { level: number } | null };
  seats: { w: ChessSeatView | null; b: ChessSeatView | null };
  fen: string;
  /** historique complet en UCI (rejouable par chess.js côté client) */
  moves: string[];
  lastMove: { from: string; to: string } | null;
  turn: ChessColor;
  /** restants DÉCOMPTÉS à serverNow (le client interpole depuis là) */
  clocks: { wMs: number; bMs: number; running: boolean } | null;
  drawOffer: ChessColor | null;
  /** avancement des confirmations de depart, null hors du statut 'ready' */
  ready: { count: number; total: number } | null;
  check: boolean;
  rematch: { offers: { w: boolean; b: boolean }; sessionId: string | null };
  result: ChessResult | null;
  ended: boolean;
}

export function buildChessPublicState(session: SessionRow): ChessPublicState {
  const state = chessStateOf(session);
  const config = session.config as unknown as ChessConfig;
  const now = Date.now();
  const running = session.status === 'playing' && state.clocks !== null;

  let clocks: ChessPublicState['clocks'] = null;
  if (state.clocks) {
    let wMs = state.clocks.wMs;
    let bMs = state.clocks.bMs;
    if (running) {
      const elapsed = Math.max(0, now - new Date(state.clocks.lastMoveAt).getTime());
      if (state.turn === 'w') wMs = Math.max(0, wMs - elapsed);
      else bMs = Math.max(0, bMs - elapsed);
    }
    clocks = { wMs, bMs, running };
  }

  const lastUci = state.moves.length > 0 ? state.moves[state.moves.length - 1].uci : null;

  return {
    id: session.id,
    joinCode: session.join_code,
    mode: 'chess',
    status: session.status as ChessPublicState['status'],
    v: session.state_version,
    serverNow: now,
    phaseStartedAt: session.phase_started_at ? new Date(session.phase_started_at).getTime() : null,
    phaseEndsAt: session.phase_ends_at ? new Date(session.phase_ends_at).getTime() : null,
    startedAt: session.started_at ? new Date(session.started_at).getTime() : null,
    endedAt: session.ended_at ? new Date(session.ended_at).getTime() : null,
    config: {
      clock: config.clock,
      theme: config.theme,
      creatorColor: config.creatorColor,
      ai: config.ai ?? null,
    },
    seats: {
      w: state.seats.w ? { pseudo: state.seats.w.pseudo, device: state.seats.w.device } : null,
      b: state.seats.b ? { pseudo: state.seats.b.pseudo, device: state.seats.b.device } : null,
    },
    fen: state.fen,
    moves: state.moves.map((m) => m.uci),
    lastMove: lastUci ? { from: lastUci.slice(0, 2), to: lastUci.slice(2, 4) } : null,
    turn: state.turn,
    clocks,
    drawOffer: state.drawOffer?.by ?? null,
    // Confirmations de depart : « 1/2 » cote joueur. Non nul UNIQUEMENT pendant
    // l'attente, ce qui sert aussi de signal au client (« affiche l'ecran de
    // confirmation »). On ne sort que des compteurs, jamais les playerId.
    ready:
      state.readyBy !== undefined
        ? {
            count: (['w', 'b'] as const).filter((c) => {
              const seat = state.seats[c];
              return seat ? (state.readyBy ?? []).includes(seat.playerId) : false;
            }).length,
            total: (['w', 'b'] as const).filter((c) => state.seats[c]).length,
          }
        : null,
    // la FEN suffit pour l'échec (pas besoin de rejouer l'historique)
    check: new Chess(state.fen).inCheck(),
    rematch: {
      offers: { w: state.rematch?.offers.w === true, b: state.rematch?.offers.b === true },
      sessionId: state.rematch?.sessionId ?? null,
    },
    result: state.result,
    ended: session.ended_at !== null,
  };
}

export interface ChessYou {
  playerId: string;
  pseudo: string;
  color: ChessColor;
  canMove: boolean;
  /** ai-je deja confirme « je suis pret » ? */
  readyVoted: boolean;
  drawOfferFromOpponent: boolean;
  /** posé quand la revanche est créée : de quoi rejoindre la nouvelle partie */
  rematch: { sessionId: string; playerToken: string; color: ChessColor } | null;
}

export function buildChessYou(session: SessionRow, player: PlayerRow): ChessYou | null {
  const state = chessStateOf(session);
  const color = seatColorOf(state, player.id);
  if (!color) return null;
  const rematch = state.rematch;
  const newColor = opponentOf(color); // couleurs inversées dans la revanche
  return {
    playerId: player.id,
    pseudo: player.pseudo,
    color,
    canMove: session.status === 'playing' && state.turn === color,
    readyVoted: (state.readyBy ?? []).includes(player.id),
    drawOfferFromOpponent: state.drawOffer?.by === opponentOf(color),
    rematch:
      rematch?.sessionId && rematch.tokens
        ? {
            sessionId: rematch.sessionId,
            playerToken: rematch.tokens[newColor],
            color: newColor,
          }
        : null,
  };
}

export interface ChessLobbyItem {
  sessionId: string;
  joinCode: string;
  status: 'lobby' | 'playing';
  theme: string;
  clock: ChessClockConfig | null;
  creatorColor: ChessColor;
  seats: { w: string | null; b: string | null };
  moveCount: number;
  createdAt: string;
  /** partie solo : niveau de la machine, sinon null */
  ai: number | null;
}

export function buildChessLobbyItem(session: SessionRow): ChessLobbyItem {
  const state = chessStateOf(session);
  const config = session.config as unknown as ChessConfig;
  return {
    sessionId: session.id,
    joinCode: session.join_code,
    ai: config.ai?.level ?? null,
    status: session.status === 'lobby' ? 'lobby' : 'playing',
    theme: config.theme,
    clock: config.clock,
    creatorColor: config.creatorColor,
    seats: {
      w: state.seats.w?.pseudo ?? null,
      b: state.seats.b?.pseudo ?? null,
    },
    moveCount: state.moves.length,
    createdAt: session.created_at,
  };
}
