/**
 * Panneau latéral d'un joueur : identité (pseudo + table), pendule, indicateur
 * de trait, zone des prises. Le panneau du joueur au trait porte un liseré
 * lumineux de la couleur d'accent du thème.
 */

import { type ReactNode } from 'react';
import { useT } from '../../../i18n/useT';
import { parseHostname } from '../../../lib/hostname';
import CapturedTray from './CapturedTray';
import ChessClock from './ChessClock';
import type { ClockBaseline } from '../hooks/useChessClock';
import type { TrackedPiece } from '../lib/pieceTracker';
import type { ChessColor, ChessSeatView } from '../lib/chessTypes';
import type { ChessTheme } from '../themes/types';

interface Props {
  seat: ChessSeatView | null;
  color: ChessColor;
  isYou: boolean;
  isTurn: boolean;
  playing: boolean;
  theme: ChessTheme;
  reduced: boolean;
  clockBaseline: ClockBaseline | null;
  turn: ChessColor;
  clockRunning: boolean;
  onFlag?: () => void;
  /** pièces adverses capturées par CE joueur */
  captured: TrackedPiece[];
  capturedHiddenIds: ReadonlySet<string>;
  advantage: number;
  moveCount: number;
  children?: ReactNode;
}

function tableLabel(device: string): string | null {
  const identity = parseHostname(device);
  if (!identity) return null;
  return `Table ${identity.tableNumber}`;
}

export default function PlayerPanel({
  seat,
  color,
  isYou,
  isTurn,
  playing,
  theme,
  reduced,
  clockBaseline,
  turn,
  clockRunning,
  onFlag,
  captured,
  capturedHiddenIds,
  advantage,
  moveCount,
  children,
}: Props) {
  const t = useT();
  const table = seat ? tableLabel(seat.device) : null;
  const highlight = isTurn && playing;

  return (
    <div
      className="flex w-full max-w-[24rem] flex-col gap-4 rounded-3xl border bg-table-bg-elev/80 p-5 transition-colors duration-300"
      style={{
        borderColor: highlight ? theme.hudAccent : 'rgba(255,255,255,0.12)',
        boxShadow: highlight ? `0 0 0 2px ${theme.hudAccent}66, 0 0 26px ${theme.hudAccent}55` : undefined,
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="h-4 w-4 shrink-0 rounded-full border border-white/40" style={{ background: color === 'w' ? '#F5F2FF' : '#14101B' }} />
            <span className="truncate font-display text-2xl uppercase tracking-wide text-table-ink">
              {seat?.pseudo ?? '...'}
            </span>
          </div>
          <div className="mt-0.5 text-sm text-table-ink-muted">
            {table ?? ' '}
            {isYou && (
              <span className="ml-2 rounded-full bg-white/10 px-2 py-0.5 font-display text-xs uppercase tracking-wider text-table-ink-soft">
                {t('table.chess.you')}
              </span>
            )}
          </div>
        </div>
      </div>

      {clockBaseline ? (
        <ChessClock
          baseline={clockBaseline}
          side={color}
          turn={turn}
          running={clockRunning}
          theme={theme}
          reduced={reduced}
          onFlag={onFlag}
        />
      ) : (
        <div className="rounded-2xl border border-white/10 bg-black/25 px-5 py-2.5 text-center font-display text-2xl text-table-ink-soft">
          {t('table.chess.moves')} {Math.ceil(moveCount / 2)}
        </div>
      )}

      {highlight && (
        <div
          className="rounded-full px-4 py-1.5 text-center font-display text-sm uppercase tracking-[0.2em]"
          style={{ background: `${theme.hudAccent}22`, color: theme.hudAccent }}
        >
          {isYou
            ? t('table.chess.turn.you')
            : color === 'w'
              ? t('table.chess.turn.white')
              : t('table.chess.turn.black')}
        </div>
      )}

      <CapturedTray pieces={captured} theme={theme} hiddenIds={capturedHiddenIds} advantage={advantage} />

      {children}
    </div>
  );
}
