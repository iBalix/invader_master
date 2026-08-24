/**
 * Carte d'une partie dans le lobby : mini-préview du thème, joueurs, cadence,
 * CTA rejoindre / reprendre / regarder.
 */

import { Bot, Eye, Swords } from 'lucide-react';
import ArcadeButton from '../../../components/ui/ArcadeButton';
import { useT } from '../../../i18n/useT';
import ThemePreview from './ThemePreview';
import { getTheme } from '../themes';
import { clockLabel, type ChessLobbyItem } from '../lib/chessTypes';

interface Props {
  item: ChessLobbyItem;
  /** cette dalle a déjà un siège dans cette partie */
  isMine: boolean;
  onJoin: () => void;
  onResume: () => void;
  onWatch: () => void;
}

export default function LobbyGameCard({ item, isMine, onJoin, onResume, onWatch }: Props) {
  const t = useT();
  const theme = getTheme(item.theme);
  const cadence = clockLabel(item.clock) ?? t('table.chess.create.noClock');
  // toujours "blancs vs noirs" (et non créateur d'abord) : c'est la lecture
  // naturelle d'une partie d'échecs, avec une pastille par couleur
  const white = item.seats.w;
  const black = item.seats.b;

  return (
    <div className="flex items-center gap-5 rounded-3xl border border-white/12 bg-table-bg-elev/80 p-4">
      <ThemePreview theme={theme} size={88} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 font-display text-2xl uppercase tracking-wide text-table-ink">
          <span className="h-3.5 w-3.5 shrink-0 rounded-full border border-white/40 bg-[#F5F2FF]" />
          <span className="truncate">
            {white ?? <span className="text-table-ink-muted">{t('table.chess.lobby.waitingSeat')}</span>}
          </span>
          <span className="mx-1 text-table-ink-muted">vs</span>
          <span className="h-3.5 w-3.5 shrink-0 rounded-full border border-white/40 bg-[#14101B]" />
          <span className="truncate">
            {black ?? <span className="text-table-ink-muted">{t('table.chess.lobby.waitingSeat')}</span>}
          </span>
        </div>
        <div className="mt-1.5 flex items-center gap-2 text-sm text-table-ink-soft">
          <span
            className="rounded-full px-2.5 py-0.5 font-display uppercase tracking-wider"
            style={{ background: `${theme.hudAccent}22`, color: theme.hudAccent }}
          >
            {cadence}
          </span>
          <span className="rounded-full bg-white/8 px-2.5 py-0.5 font-display uppercase tracking-wider text-table-ink-muted">
            {t(theme.labelKey)}
          </span>
          {item.ai !== null && (
            <span className="flex items-center gap-1.5 rounded-full bg-table-cyan/15 px-2.5 py-0.5 font-display uppercase tracking-wider text-table-cyan">
              <Bot className="h-4 w-4" />
              {t(`table.chess.create.ai.level${item.ai}`)}
            </span>
          )}
          {item.status === 'playing' && (
            <span className="text-table-ink-muted">
              {t('table.chess.lobby.moves')} {Math.ceil(item.moveCount / 2)}
            </span>
          )}
        </div>
      </div>
      {isMine ? (
        <ArcadeButton variant="primary" size="lg" icon={<Swords className="h-5 w-5" />} onClick={onResume}>
          {t('table.chess.lobby.resume')}
        </ArcadeButton>
      ) : item.status === 'lobby' && item.ai === null ? (
        <ArcadeButton variant="accent" size="lg" icon={<Swords className="h-5 w-5" />} onClick={onJoin}>
          {t('table.chess.lobby.join')}
        </ArcadeButton>
      ) : (
        <ArcadeButton variant="cyan" size="lg" icon={<Eye className="h-5 w-5" />} onClick={onWatch}>
          {t('table.chess.lobby.watch')}
        </ArcadeButton>
      )}
    </div>
  );
}
