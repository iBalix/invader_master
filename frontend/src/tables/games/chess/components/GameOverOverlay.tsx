/**
 * Écran de fin : résultat en grand, roi du vainqueur, raison, revanche
 * (proposer / en attente / rejoindre) et retour lobby. Un spectateur peut
 * suivre la revanche quand elle est créée.
 */

import { motion } from 'framer-motion';
import ArcadeButton from '../../../components/ui/ArcadeButton';
import NeonText from '../../../components/ui/NeonText';
import { useT, type TFunction } from '../../../i18n/useT';
import type { ChessPublicState, ChessYou } from '../lib/chessTypes';
import type { ChessTheme } from '../themes/types';

interface Props {
  state: ChessPublicState;
  you: ChessYou | null;
  theme: ChessTheme;
  busy: boolean;
  onRematch: () => void;
  onJoinRematch: () => void;
  onSpectateRematch: () => void;
  onBackToLobby: () => void;
}

function titleOf(state: ChessPublicState, t: TFunction): string {
  const reason = state.result?.reason;
  switch (reason) {
    case 'checkmate':
      return t('table.chess.end.checkmate');
    case 'stalemate':
      return t('table.chess.end.stalemate');
    case 'timeout':
      return t('table.chess.end.timeout');
    case 'resign':
      return t('table.chess.end.resign');
    case 'repetition':
    case 'fifty_moves':
    case 'insufficient_material':
    case 'timeout_vs_insufficient':
    case 'draw_agreed':
      return t('table.chess.end.draw');
    case 'lobby_expired':
    case 'cancelled':
      return t('table.chess.end.cancelled');
    case 'inactivity':
      return t('table.chess.end.inactivity');
    default:
      return t('table.chess.end.terminated');
  }
}

function subtitleOf(state: ChessPublicState, you: ChessYou | null, t: TFunction): string | null {
  const result = state.result;
  if (!result) return null;
  if (result.winner === null) {
    if (result.reason === 'draw_agreed') return t('table.chess.end.drawAgreed');
    if (result.reason === 'timeout_vs_insufficient') return t('table.chess.end.timeoutDraw');
    return null;
  }
  const winner = state.seats[result.winner]?.pseudo ?? (result.winner === 'w' ? t('table.chess.end.winner.white') : t('table.chess.end.winner.black'));
  if (you) {
    return you.color === result.winner
      ? t('table.chess.end.youWin')
      : t('table.chess.end.youLose').replace('#winner#', winner);
  }
  return t('table.chess.end.wins').replace('#winner#', winner);
}

export default function GameOverOverlay({
  state,
  you,
  theme,
  busy,
  onRematch,
  onJoinRematch,
  onSpectateRematch,
  onBackToLobby,
}: Props) {
  const t = useT();
  const result = state.result;
  if (!result) return null;

  const aborted =
    result.reason === 'cancelled' ||
    result.reason === 'lobby_expired' ||
    result.reason === 'terminated';
  const canRematch = you !== null && !aborted;
  const myOffer = you !== null && state.rematch.offers[you.color];
  const rematchReady = you?.rematch ?? null;

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/70 px-8">
      <motion.div
        initial={{ scale: 0.92, opacity: 0, y: 18 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 24 }}
        className="flex w-full max-w-2xl flex-col items-center gap-6 rounded-3xl border border-white/15 bg-table-bg-elev/95 p-10 text-center"
        style={{ boxShadow: `0 0 60px ${theme.hudAccent}33` }}
      >
        {result.winner !== null && (
          <div className="h-28 w-28">{theme.renderPiece('k', result.winner, '100%')}</div>
        )}
        <div className="font-display text-6xl uppercase tracking-wider text-table-ink">
          {titleOf(state, t)}
        </div>
        {subtitleOf(state, you, t) && (
          <NeonText color="cyan" glow className="font-display text-2xl uppercase tracking-wide">
            {subtitleOf(state, you, t)}
          </NeonText>
        )}

        <div className="mt-2 flex w-full flex-col gap-3">
          {canRematch && rematchReady && (
            <ArcadeButton variant="primary" size="lg" fullWidth disabled={busy} onClick={onJoinRematch}>
              {t('table.chess.end.rematch.join')}
            </ArcadeButton>
          )}
          {canRematch && !rematchReady && (
            <ArcadeButton
              variant="accent"
              size="lg"
              fullWidth
              disabled={busy || myOffer}
              onClick={onRematch}
            >
              {myOffer ? t('table.chess.end.rematch.waiting') : t('table.chess.end.rematch')}
            </ArcadeButton>
          )}
          {!you && state.rematch.sessionId && (
            <ArcadeButton variant="cyan" size="lg" fullWidth onClick={onSpectateRematch}>
              {t('table.chess.end.rematch.follow')}
            </ArcadeButton>
          )}
          <ArcadeButton variant="ghost" size="lg" fullWidth onClick={onBackToLobby}>
            {t('table.chess.end.backToLobby')}
          </ArcadeButton>
        </div>
      </motion.div>
    </div>
  );
}
