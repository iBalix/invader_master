/**
 * Mode démo hotseat local (?/table/games/chess/demo[?theme=pixel]) : une
 * partie chess.js sur la dalle, les deux camps jouables tour à tour. Sert la
 * QA visuelle (thèmes, animations, promotion, mat) sans backend ni adversaire.
 */

import { useMemo, useState } from 'react';
import { buildChess, uciToMoveInput } from '../lib/chessRules';
import type {
  ChessPublicState,
  ChessResult,
  ChessYou,
  PromotionPiece,
} from '../lib/chessTypes';

export interface DemoChess {
  state: ChessPublicState;
  you: ChessYou;
  submitMove: (from: string, to: string, promotion?: PromotionPiece) => void;
  reset: () => void;
}

export function useDemoChess(theme: string): DemoChess {
  const [moves, setMoves] = useState<string[]>([]);
  // instant de départ figé : donne une durée crédible au récap de fin
  const [startedAt] = useState(() => Date.now());
  const chess = useMemo(() => buildChess(moves), [moves]);

  const result = useMemo<ChessResult | null>(() => {
    if (chess.isCheckmate()) {
      return { winner: chess.turn() === 'w' ? 'b' : 'w', reason: 'checkmate' };
    }
    if (chess.isStalemate()) return { winner: null, reason: 'stalemate' };
    if (chess.isThreefoldRepetition()) return { winner: null, reason: 'repetition' };
    if (chess.isInsufficientMaterial()) return { winner: null, reason: 'insufficient_material' };
    if (chess.isDraw()) return { winner: null, reason: 'fifty_moves' };
    return null;
  }, [chess]);

  const lastUci = moves.length > 0 ? moves[moves.length - 1] : null;

  const state: ChessPublicState = {
    id: 'demo',
    joinCode: 'DEMO',
    mode: 'chess',
    status: result ? 'end' : 'playing',
    v: moves.length + 1,
    serverNow: Date.now(),
    phaseStartedAt: null,
    phaseEndsAt: null,
    startedAt,
    endedAt: result ? Date.now() : null,
    config: { clock: null, theme, creatorColor: 'w' },
    seats: {
      w: { pseudo: 'Blancs', device: 'DEMO' },
      b: { pseudo: 'Noirs', device: 'DEMO' },
    },
    fen: chess.fen(),
    moves,
    lastMove: lastUci ? { from: lastUci.slice(0, 2), to: lastUci.slice(2, 4) } : null,
    turn: chess.turn(),
    clocks: null,
    drawOffer: null,
    check: chess.inCheck(),
    rematch: { offers: { w: false, b: false }, sessionId: null },
    result,
    ended: result !== null,
  };

  const you: ChessYou = {
    playerId: 'demo',
    pseudo: 'Démo',
    color: chess.turn(),
    canMove: result === null,
    drawOfferFromOpponent: false,
    rematch: null,
  };

  return {
    state,
    you,
    submitMove: (from, to, promotion) => {
      const uci = `${from}${to}${promotion ?? ''}`;
      try {
        const clone = buildChess(moves);
        clone.move(uciToMoveInput(uci));
        setMoves((prev) => [...prev, uci]);
      } catch {
        /* coup illégal en démo : ignoré */
      }
    },
    reset: () => setMoves([]),
  };
}
