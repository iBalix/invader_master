/**
 * Carte d'une partie dans le lobby : préview du thème, joueurs présents,
 * remplissage, manche en cours. Le CTA dépend de la dalle : reprendre sa
 * place, rejoindre, ou regarder quand la partie est complète (le bouton
 * Rejoindre reste visible mais grisé : on comprend pourquoi on ne peut pas).
 */

import { Eye, LogIn, Play, Users } from 'lucide-react';
import ArcadeButton from '../../../components/ui/ArcadeButton';
import { useT } from '../../../i18n/useT';
import FlapThemePreview from './FlapThemePreview';
import type { FlapLobbyItem } from '../lib/flapTypes';

interface Props {
  item: FlapLobbyItem;
  /** cette dalle a déjà une place dans cette partie */
  isMine: boolean;
  onJoin: () => void;
  onResume: () => void;
  onWatch: () => void;
}

const ACCENT = '#FF3EA5';

function Pill({ children, tone = 'muted' }: { children: React.ReactNode; tone?: 'accent' | 'muted' | 'alert' }) {
  const cls =
    tone === 'accent'
      ? 'text-white'
      : tone === 'alert'
        ? 'bg-table-red/15 text-table-red'
        : 'bg-white/8 text-table-ink-muted';
  return (
    <span
      className={`inline-flex h-10 items-center gap-2 rounded-full px-4 font-display text-[20px] uppercase tracking-wider ${cls}`}
      style={tone === 'accent' ? { background: `${ACCENT}33`, color: ACCENT } : undefined}
    >
      {children}
    </span>
  );
}

export default function LobbyFlapCard({ item, isMine, onJoin, onResume, onWatch }: Props) {
  const t = useT();
  const full = item.playerCount >= item.maxPlayers;
  const playing = item.status === 'playing';

  return (
    <div className="flex items-center gap-6 rounded-3xl border border-white/12 bg-table-bg-elev/80 p-5">
      <FlapThemePreview themeId={item.theme} width={200} height={112} className="shrink-0" />

      <div className="min-w-0 flex-1">
        <div className="truncate font-display text-3xl uppercase tracking-wide text-table-ink">
          {item.pseudos.length > 0 ? item.pseudos.join(' · ') : item.joinCode}
        </div>
        <div className="mt-2.5 flex flex-wrap items-center gap-2.5">
          <Pill tone="accent">
            <Users className="h-5 w-5" />
            {t('table.flap.lobby.players').replace('{count}', String(item.playerCount)).replace('{max}', String(item.maxPlayers))}
          </Pill>
          {playing && <Pill>{t('table.flap.lobby.round').replace('{round}', String(item.roundsPlayed + 1))}</Pill>}
          {!playing && item.roundsPlayed > 0 && (
            <Pill>{t('table.flap.lobby.rounds').replace('{count}', String(item.roundsPlayed))}</Pill>
          )}
          {full && <Pill tone="alert">{t('table.flap.lobby.full')}</Pill>}
          <Pill>{t(`table.flap.theme.${item.theme}`, item.theme)}</Pill>
        </div>
      </div>

      {isMine ? (
        <ArcadeButton variant="primary" size="xl" className="min-h-[72px]" icon={<Play className="h-7 w-7" />} onClick={onResume}>
          {t('table.flap.lobby.resume')}
        </ArcadeButton>
      ) : item.joinable && !full ? (
        <ArcadeButton variant="accent" size="xl" className="min-h-[72px]" icon={<LogIn className="h-7 w-7" />} onClick={onJoin}>
          {t('table.flap.lobby.join')}
        </ArcadeButton>
      ) : (
        <div className="flex shrink-0 items-center gap-3">
          {full && (
            <ArcadeButton variant="accent" size="xl" className="min-h-[72px]" icon={<LogIn className="h-7 w-7" />} disabled>
              {t('table.flap.lobby.join')}
            </ArcadeButton>
          )}
          <ArcadeButton variant="cyan" size="xl" className="min-h-[72px]" icon={<Eye className="h-7 w-7" />} onClick={onWatch}>
            {t('table.flap.lobby.watch')}
          </ArcadeButton>
        </div>
      )}
    </div>
  );
}
