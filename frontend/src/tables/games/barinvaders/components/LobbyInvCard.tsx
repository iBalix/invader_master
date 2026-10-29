/**
 * Carte d'une partie dans le lobby : vignette d'envahisseurs, joueurs
 * présents, remplissage, manche en cours. Le CTA dépend de la dalle :
 * reprendre sa place, rejoindre, ou regarder quand la partie est complète
 * ou lancée (le bouton Rejoindre reste visible mais grisé : on comprend
 * pourquoi on ne peut pas).
 */

import { Eye, LogIn, Play, Users } from 'lucide-react';
import ArcadeButton from '../../../components/ui/ArcadeButton';
import { useT } from '../../../i18n/useT';
import { ALIEN_SPR } from '../sim/invSim';
import { INV_ACCENT, INV_COLORS } from '../art/palette';
import type { InvLobbyItem } from '../lib/invTypes';
import SpriteIcon from './SpriteIcon';

interface Props {
  item: InvLobbyItem;
  /** cette dalle a déjà une place dans cette partie */
  isMine: boolean;
  onJoin: () => void;
  onResume: () => void;
  onWatch: () => void;
}

function Pill({ children, tone = 'muted' }: { children: React.ReactNode; tone?: 'accent' | 'muted' | 'alert' }) {
  const cls = tone === 'alert' ? 'bg-table-red/15 text-table-red' : tone === 'accent' ? '' : 'bg-white/8 text-table-ink-muted';
  return (
    <span
      className={`inline-flex h-10 items-center gap-2 rounded-full px-4 font-display text-[20px] uppercase tracking-wider ${cls}`}
      style={tone === 'accent' ? { background: `${INV_ACCENT}26`, color: INV_ACCENT } : undefined}
    >
      {children}
    </span>
  );
}

export default function LobbyInvCard({ item, isMine, onJoin, onResume, onWatch }: Props) {
  const t = useT();
  const full = item.playerCount >= item.maxPlayers;
  const playing = item.status === 'playing';

  return (
    <div className="flex items-center gap-6 rounded-3xl border border-white/12 bg-table-bg-elev/80 p-5">
      <div className="flex h-[112px] w-[200px] shrink-0 flex-col items-center justify-center gap-3 rounded-2xl border border-white/10 bg-black">
        <div className="flex gap-3">
          <SpriteIcon columns={ALIEN_SPR[0][2]} color={INV_COLORS.white} scale={3} />
          <SpriteIcon columns={ALIEN_SPR[1][1]} color={INV_COLORS.white} scale={3} />
          <SpriteIcon columns={ALIEN_SPR[0][0]} color={INV_COLORS.white} scale={3} />
        </div>
        <div className="h-[3px] w-[150px]" style={{ background: INV_COLORS.green, boxShadow: `0 0 8px ${INV_COLORS.green}` }} />
      </div>

      <div className="min-w-0 flex-1">
        <div className="truncate font-display text-3xl uppercase tracking-wide text-table-ink">
          {item.pseudos.length > 0 ? item.pseudos.join(' · ') : item.joinCode}
        </div>
        <div className="mt-2.5 flex flex-wrap items-center gap-2.5">
          <Pill tone="accent">
            <Users className="h-5 w-5" />
            {t('table.inv.lobby.players', '{count} / {max} joueurs').replace('{count}', String(item.playerCount)).replace('{max}', String(item.maxPlayers))}
          </Pill>
          {playing && <Pill>{t('table.inv.lobby.round', 'Manche {round} en cours').replace('{round}', String(item.roundsPlayed + 1))}</Pill>}
          {!playing && item.roundsPlayed > 0 && (
            <Pill>{t('table.inv.lobby.rounds', '{count} manches jouées').replace('{count}', String(item.roundsPlayed))}</Pill>
          )}
          {full && <Pill tone="alert">{t('table.inv.lobby.full', 'Complet')}</Pill>}
        </div>
      </div>

      {isMine ? (
        <ArcadeButton variant="primary" size="xl" className="min-h-[72px]" icon={<Play className="h-7 w-7" />} onClick={onResume}>
          {t('table.inv.lobby.resume', 'Reprendre')}
        </ArcadeButton>
      ) : item.joinable && !full ? (
        <ArcadeButton variant="accent" size="xl" className="min-h-[72px]" icon={<LogIn className="h-7 w-7" />} onClick={onJoin}>
          {t('table.inv.lobby.join', 'Rejoindre')}
        </ArcadeButton>
      ) : (
        <div className="flex shrink-0 items-center gap-3">
          {full && (
            <ArcadeButton variant="accent" size="xl" className="min-h-[72px]" icon={<LogIn className="h-7 w-7" />} disabled>
              {t('table.inv.lobby.join', 'Rejoindre')}
            </ArcadeButton>
          )}
          <ArcadeButton variant="cyan" size="xl" className="min-h-[72px]" icon={<Eye className="h-7 w-7" />} onClick={onWatch}>
            {t('table.inv.lobby.watch', 'Regarder')}
          </ArcadeButton>
        </div>
      )}
    </div>
  );
}
