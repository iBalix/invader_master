/**
 * Carte d'une table dans le lobby : préview du thème, joueurs assis, places
 * restantes, mises, manches et durée estimée AU NOMBRE DE JOUEURS ASSIS.
 */

import { Eye, Armchair, Play } from 'lucide-react';
import ArcadeButton from '../../../components/ui/ArcadeButton';
import { useT } from '../../../i18n/useT';
import BjThemePreview from './BjThemePreview';
import { getBjTheme } from '../themes';
import { estimateMinutes, type BjLobbyItem } from '../lib/bjTypes';

interface Props {
  item: BjLobbyItem;
  /** cette dalle a déjà un siège dans cette partie */
  isMine: boolean;
  onJoin: () => void;
  onResume: () => void;
  onWatch: () => void;
}

export default function LobbyTableCard({ item, isMine, onJoin, onResume, onWatch }: Props) {
  const t = useT();
  const theme = getBjTheme(item.theme);
  const est = estimateMinutes(item.rounds, Math.max(2, item.seatCount));
  const freeSeats = item.maxSeats - item.seatCount;

  return (
    <div className="flex items-center gap-6 rounded-3xl border border-white/12 bg-table-bg-elev/80 p-5">
      <BjThemePreview theme={theme} size={112} />
      <div className="min-w-0 flex-1">
        <div className="truncate font-display text-3xl uppercase tracking-wide text-table-ink">
          {item.pseudos.length > 0 ? item.pseudos.join(' · ') : t('table.bj.lobby.emptyTable')}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2.5 text-lg text-table-ink-soft">
          <span
            className="rounded-full px-3.5 py-1 font-display uppercase tracking-wider"
            style={{ background: `${theme.hudAccent}22`, color: theme.hudAccent }}
          >
            {item.status === 'lobby'
              ? t('table.bj.lobby.seatsFree').replace('{count}', String(freeSeats))
              : t('table.bj.lobby.roundOf').replace('{round}', String(item.roundIndex + 1)).replace('{rounds}', String(item.rounds))}
          </span>
          <span className="rounded-full bg-white/8 px-3.5 py-1 font-display uppercase tracking-wider text-table-ink-muted">
            {t('table.bj.lobby.bets').replace('{min}', String(item.minBet)).replace('{max}', String(item.maxBet))}
          </span>
          <span className="rounded-full bg-white/8 px-3.5 py-1 font-display uppercase tracking-wider text-table-ink-muted">
            {t('table.bj.lobby.estimate').replace('{rounds}', String(item.rounds)).replace('{min}', String(est))}
          </span>
          <span className="rounded-full bg-white/8 px-3.5 py-1 font-display uppercase tracking-wider text-table-ink-muted">
            {t(theme.labelKey)}
          </span>
        </div>
      </div>
      {isMine ? (
        <ArcadeButton variant="primary" size="xl" icon={<Play className="h-6 w-6" />} onClick={onResume}>
          {t('table.bj.lobby.resume')}
        </ArcadeButton>
      ) : item.joinable ? (
        <ArcadeButton variant="accent" size="xl" icon={<Armchair className="h-6 w-6" />} onClick={onJoin}>
          {t('table.bj.lobby.join')}
        </ArcadeButton>
      ) : (
        <ArcadeButton variant="cyan" size="xl" icon={<Eye className="h-6 w-6" />} onClick={onWatch}>
          {t('table.bj.lobby.watch')}
        </ArcadeButton>
      )}
    </div>
  );
}
