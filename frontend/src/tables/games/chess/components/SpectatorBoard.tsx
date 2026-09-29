/**
 * Partie d'échecs en lecture seule, hors dalle : le projecteur du bar la
 * montre pendant un tournoi (« match en direct »).
 *
 * Deux couches, pour que le labo puisse la régler sans réseau :
 *   - SpectatorBoardView : pur, reçoit l'état public d'une partie ;
 *   - LiveChessBoard : l'alimente en direct (useChessSession sans jeton, le
 *     même protocole que les spectateurs des dalles).
 * Mêmes composants que la page de jeu (plateau, pièces suivies, panneaux et
 * pendules), sans aucune interaction : aucun coup ne peut partir d'ici.
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import ChessBoard from './ChessBoard';
import PlayerPanel from './PlayerPanel';
import { fallenKingColor } from './GameOverOverlay';
import { useChessSession } from '../hooks/useChessSession';
import { buildChess, kingSquare } from '../lib/chessRules';
import { trackPieces } from '../lib/pieceTracker';
import type { ChessColor, ChessPublicState } from '../lib/chessTypes';
import { getTheme } from '../themes';
import '../chess.css';

const NOOP = (): void => undefined;

export interface SpectatorBoardViewProps {
  state: ChessPublicState;
  boardSize: number;
  panelWidth: number;
  reduced?: boolean;
  /** contenu ajouté sous chaque panneau (infos tournoi du joueur) */
  panelExtra?: (side: ChessColor) => ReactNode;
}

export function SpectatorBoardView({ state, boardSize, panelWidth, reduced = false, panelExtra }: SpectatorBoardViewProps) {
  const theme = useMemo(() => getTheme(state.config.theme), [state.config.theme]);
  const moves = state.moves;
  const chess = useMemo(() => buildChess(moves), [moves]);
  const tracked = useMemo(() => trackPieces(moves), [moves]);
  const boardRef = useRef<HTMLDivElement>(null);

  // arrivée en cours de partie : positions finales directes, sans glisser
  // toutes les pièces depuis la position initiale
  const lenRef = useRef(-1);
  const [suppress, setSuppress] = useState(true);
  useEffect(() => {
    const prev = lenRef.current;
    lenRef.current = moves.length;
    if (prev === -1 || Math.abs(moves.length - prev) > 1) {
      setSuppress(true);
      const raf = requestAnimationFrame(() => requestAnimationFrame(() => setSuppress(false)));
      return () => cancelAnimationFrame(raf);
    }
    setSuppress(false);
    return undefined;
  }, [moves.length]);

  const lastUci = moves.length > 0 ? moves[moves.length - 1] : null;
  const lastMove = lastUci ? { from: lastUci.slice(0, 2), to: lastUci.slice(2, 4) } : null;
  const checkSquare = chess.inCheck() ? kingSquare(chess, chess.turn() as ChessColor) : null;
  const loser = fallenKingColor(state);
  const fallenKing = loser ? kingSquare(chess, loser) : null;
  const playing = state.status === 'playing' && !state.result;

  const clockBaseline = state.clocks
    ? { wMs: state.clocks.wMs, bMs: state.clocks.bMs, at: state.serverNow }
    : state.config.clock
      ? { wMs: state.config.clock.initialMs, bMs: state.config.clock.initialMs, at: state.serverNow }
      : null;
  const noHidden = useMemo(() => new Set<string>(), []);

  const panel = (side: ChessColor) => (
    <PlayerPanel
      width={panelWidth}
      seat={state.seats[side]}
      color={side}
      isYou={false}
      isTurn={state.turn === side}
      playing={playing}
      theme={theme}
      reduced={reduced}
      clockBaseline={clockBaseline}
      turn={state.turn}
      clockRunning={Boolean(state.clocks?.running)}
      captured={side === 'w' ? tracked.capturedByWhite : tracked.capturedByBlack}
      capturedHiddenIds={noHidden}
      advantage={side === 'w' ? Math.max(0, tracked.materialDiff) : Math.max(0, -tracked.materialDiff)}
      moveCount={moves.length}
    >
      {panelExtra?.(side)}
    </PlayerPanel>
  );

  return (
    <div className="flex items-center justify-center gap-6">
      {/* noirs à gauche, en haut du plateau ; blancs à droite, en bas */}
      <div className="flex self-stretch items-start">{panel('b')}</div>
      <ChessBoard
        boardRef={boardRef}
        boardSize={boardSize}
        orientation="white"
        theme={theme}
        reduced={reduced}
        pieces={tracked.pieces}
        selection={null}
        lastMove={lastMove}
        checkSquare={checkSquare}
        shakeSquare={null}
        fallenKingSquare={fallenKing}
        turnColor={chess.turn() as ChessColor}
        suppressAnim={suppress}
        promotion={null}
        onPromotionPick={NOOP}
        onSquareTap={NOOP}
      />
      <div className="flex self-stretch items-end">{panel('w')}</div>
    </div>
  );
}

export interface LiveChessBoardProps extends Omit<SpectatorBoardViewProps, 'state'> {
  chessId: string;
  /** rendu tant que la partie n'est pas chargée */
  fallback?: ReactNode;
  /** l'état de la partie suivie, pour l'habillage autour du plateau */
  onState?: (state: ChessPublicState | null) => void;
}

export function LiveChessBoard({ chessId, fallback = null, onState, ...rest }: LiveChessBoardProps) {
  const { state } = useChessSession(chessId, null);
  const onStateRef = useRef(onState);
  onStateRef.current = onState;
  useEffect(() => {
    onStateRef.current?.(state);
  }, [state]);
  if (!state) return <>{fallback}</>;
  return <SpectatorBoardView state={state} {...rest} />;
}
