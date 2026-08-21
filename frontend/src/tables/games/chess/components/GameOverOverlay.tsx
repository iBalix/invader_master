/**
 * Fin de partie : annonce du résultat puis récapitulatif de la partie
 * (joueurs et couleurs, vainqueur, raison, nombre de coups, durée, pièces
 * prises de chaque côté, temps restants), révélé en cascade.
 *
 * L'écran est ouvert par la page APRÈS l'animation du roi qui se couche :
 * on voit d'abord le plateau conclure, ensuite le bilan.
 */

import { motion } from 'framer-motion';
import { Crown, Scale } from 'lucide-react';
import ArcadeButton from '../../../components/ui/ArcadeButton';
import { useT, type TFunction } from '../../../i18n/useT';
import { formatClock } from '../hooks/useChessClock';
import type { TrackedPiece } from '../lib/pieceTracker';
import { opponentOf, type ChessColor, type ChessPublicState, type ChessYou } from '../lib/chessTypes';
import type { ChessTheme } from '../themes/types';

interface Props {
  state: ChessPublicState;
  you: ChessYou | null;
  theme: ChessTheme;
  busy: boolean;
  /** pièces noires prises par les blancs */
  capturedByWhite: TrackedPiece[];
  /** pièces blanches prises par les noirs */
  capturedByBlack: TrackedPiece[];
  onRematch: () => void;
  onJoinRematch: () => void;
  onSpectateRematch: () => void;
  onBackToLobby: () => void;
}

function titleOf(state: ChessPublicState, t: TFunction): string {
  switch (state.result?.reason) {
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

/** raison détaillée, en une ligne lisible par un joueur */
function reasonOf(state: ChessPublicState, t: TFunction): string | null {
  switch (state.result?.reason) {
    case 'repetition':
      return t('table.chess.end.reason.repetition');
    case 'fifty_moves':
      return t('table.chess.end.reason.fiftyMoves');
    case 'insufficient_material':
      return t('table.chess.end.reason.insufficient');
    case 'timeout_vs_insufficient':
      return t('table.chess.end.timeoutDraw');
    case 'draw_agreed':
      return t('table.chess.end.drawAgreed');
    case 'resign':
      return t('table.chess.end.reason.resign');
    case 'timeout':
      return t('table.chess.end.reason.timeout');
    case 'inactivity':
      return t('table.chess.end.reason.inactivity');
    default:
      return null;
  }
}

function outcomeOf(state: ChessPublicState, you: ChessYou | null, t: TFunction): string | null {
  const result = state.result;
  if (!result) return null;
  if (result.winner === null) return null;
  const winner =
    state.seats[result.winner]?.pseudo ??
    (result.winner === 'w' ? t('table.chess.end.winner.white') : t('table.chess.end.winner.black'));
  if (you) {
    return you.color === result.winner
      ? t('table.chess.end.youWin')
      : t('table.chess.end.youLose').replace('#winner#', winner);
  }
  return t('table.chess.end.wins').replace('#winner#', winner);
}

function formatDuration(ms: number, t: TFunction): string {
  const totalSec = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h} ${t('table.chess.end.hourShort')} ${m.toString().padStart(2, '0')}`;
  if (m > 0) return `${m} ${t('table.chess.end.minShort')} ${s.toString().padStart(2, '0')}`;
  return `${s} ${t('table.chess.end.secShort')}`;
}

export default function GameOverOverlay({
  state,
  you,
  theme,
  busy,
  capturedByWhite,
  capturedByBlack,
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
  const isDraw = result.winner === null && !aborted;

  const moveCount = Math.ceil(state.moves.length / 2);
  const duration =
    state.startedAt && state.endedAt ? formatDuration(state.endedAt - state.startedAt, t) : null;

  /** colonne d'un camp dans le récap */
  const side = (color: ChessColor) => {
    const seat = state.seats[color];
    const isWinner = result.winner === color;
    const captured = color === 'w' ? capturedByWhite : capturedByBlack;
    const clockMs = state.clocks ? (color === 'w' ? state.clocks.wMs : state.clocks.bMs) : null;
    return (
      <div
        className="flex flex-1 flex-col gap-2 rounded-2xl border p-4"
        style={{
          borderColor: isWinner ? theme.hudAccent : 'rgba(255,255,255,0.12)',
          background: isWinner ? `${theme.hudAccent}14` : 'rgba(255,255,255,0.03)',
        }}
      >
        <div className="flex items-center gap-2">
          <span
            className="h-3.5 w-3.5 shrink-0 rounded-full border border-white/40"
            style={{ background: color === 'w' ? '#F5F2FF' : '#14101B' }}
          />
          <span className="truncate font-display text-xl uppercase tracking-wide text-table-ink">
            {seat?.pseudo ?? '—'}
          </span>
          {isWinner && <Crown className="h-5 w-5 shrink-0" style={{ color: theme.hudAccent }} />}
        </div>
        <div className="flex min-h-[2rem] flex-wrap items-center gap-0.5">
          {captured.length === 0 ? (
            <span className="text-sm text-table-ink-muted">{t('table.chess.end.noCapture')}</span>
          ) : (
            captured.map((piece) => (
              <span key={piece.id} className="h-7 w-7">
                {theme.renderPiece(piece.type, piece.color, '100%')}
              </span>
            ))
          )}
        </div>
        {clockMs !== null && (
          <div className="font-display text-sm uppercase tracking-wider text-table-ink-muted">
            {t('table.chess.end.clockLeft')} {formatClock(clockMs)}
          </div>
        )}
      </div>
    );
  };

  const step = (delay: number) => ({
    initial: { opacity: 0, y: 14 },
    animate: { opacity: 1, y: 0 },
    transition: { delay, duration: 0.32 },
  });

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/72 px-8">
      <motion.div
        initial={{ scale: 0.94, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 300, damping: 26 }}
        className="flex w-full max-w-3xl flex-col items-center gap-5 rounded-3xl border border-white/15 bg-table-bg-elev/95 p-8"
        style={{ boxShadow: `0 0 60px ${theme.hudAccent}33` }}
      >
        {/* résultat */}
        <motion.div {...step(0.05)} className="flex flex-col items-center gap-2">
          {isDraw ? (
            <Scale className="h-16 w-16" style={{ color: theme.hudAccent }} />
          ) : result.winner !== null ? (
            <div className="h-20 w-20">{theme.renderPiece('k', result.winner, '100%')}</div>
          ) : null}
          <div className="text-center font-display text-5xl uppercase tracking-wider text-table-ink">
            {titleOf(state, t)}
          </div>
          {outcomeOf(state, you, t) && (
            <div
              className="font-display text-2xl uppercase tracking-wide"
              style={{ color: theme.hudAccent }}
            >
              {outcomeOf(state, you, t)}
            </div>
          )}
          {reasonOf(state, t) && (
            <div className="text-base text-table-ink-soft">{reasonOf(state, t)}</div>
          )}
        </motion.div>

        {/* récap : les deux camps */}
        {!aborted && (
          <motion.div {...step(0.18)} className="flex w-full gap-3">
            {side('w')}
            {side('b')}
          </motion.div>
        )}

        {/* récap : chiffres de la partie */}
        {!aborted && (
          <motion.div
            {...step(0.28)}
            className="flex w-full justify-center gap-8 rounded-2xl border border-white/10 bg-black/25 px-6 py-3"
          >
            <div className="text-center">
              <div className="font-display text-2xl tabular-nums text-table-ink">{moveCount}</div>
              <div className="text-xs uppercase tracking-wider text-table-ink-muted">
                {t('table.chess.end.moves')}
              </div>
            </div>
            {duration && (
              <div className="text-center">
                <div className="font-display text-2xl tabular-nums text-table-ink">{duration}</div>
                <div className="text-xs uppercase tracking-wider text-table-ink-muted">
                  {t('table.chess.end.duration')}
                </div>
              </div>
            )}
            <div className="text-center">
              <div className="font-display text-2xl tabular-nums text-table-ink">
                {capturedByWhite.length + capturedByBlack.length}
              </div>
              <div className="text-xs uppercase tracking-wider text-table-ink-muted">
                {t('table.chess.end.captures')}
              </div>
            </div>
          </motion.div>
        )}

        {/* actions */}
        <motion.div {...step(0.38)} className="flex w-full flex-col gap-3">
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
        </motion.div>
      </motion.div>
    </div>
  );
}

/** exporté pour la page : le roi du camp vaincu se couche (mat, abandon, drapeau) */
export function fallenKingColor(state: ChessPublicState): ChessColor | null {
  const result = state.result;
  if (!result || result.winner === null) return null;
  if (result.reason !== 'checkmate' && result.reason !== 'resign' && result.reason !== 'timeout') {
    return null;
  }
  return opponentOf(result.winner);
}
