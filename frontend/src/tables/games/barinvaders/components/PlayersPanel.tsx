/**
 * Panneau JOUEURS (colonne de droite, parties à 2 et plus) : classement live
 * de la manche, calculé par la boucle à partir des parties rejouées.
 * Rang, pseudo, score, canons restants, état (en jeu / GAME OVER / prochaine
 * manche). Ma ligne est surlignée. Après ma mort, toucher un joueur en vie
 * affiche sa partie à l'écran.
 *
 * Dalle vue de biais : lignes de 76 px, pseudo 30 px, score 24 px en police
 * de borne. Huit lignes tiennent sans défiler.
 */

import { Eye } from 'lucide-react';
import { useStore } from 'zustand';
import type { TFunction } from '../../../i18n/useT';
import { PLAYER_SPR } from '../sim/invSim';
import { INV_COLORS } from '../art/palette';
import type { InvBridge, PanelRow } from '../engine/bridge';
import { formatScore } from '../lib/format';
import SpriteIcon from './SpriteIcon';

interface Props {
  bridge: InvBridge;
  t: TFunction;
}

function Lives({ count }: { count: number }) {
  const shown = Math.min(count, 3);
  return (
    <span className="flex items-center gap-1.5">
      {Array.from({ length: shown }, (_, i) => (
        <SpriteIcon key={i} columns={PLAYER_SPR} color={INV_COLORS.green} scale={2} glow={false} />
      ))}
      {count > 3 && <span className="font-retro text-[14px] text-white/70">+{count - 3}</span>}
    </span>
  );
}

function Row({ row, rank, canWatch, onWatch, t }: { row: PanelRow; rank: number; canWatch: boolean; onWatch: () => void; t: TFunction }) {
  const accent = INV_COLORS.green;
  const dim = !row.alive && !row.isMe;
  return (
    <button
      type="button"
      disabled={!canWatch}
      onClick={onWatch}
      className="grid h-[76px] w-full grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border px-4 text-left"
      style={{
        background: row.watched ? `${INV_COLORS.cyan}1F` : row.isMe ? `${accent}14` : 'rgba(255,255,255,0.04)',
        borderColor: row.watched ? INV_COLORS.cyan : row.isMe ? `${accent}99` : 'rgba(255,255,255,0.08)',
        opacity: dim ? 0.55 : 1,
      }}
    >
      <span className="font-retro text-[20px]" style={{ color: rank === 1 ? '#E8C267' : 'rgba(255,255,255,0.55)' }}>
        {row.waiting ? '·' : rank}
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="flex items-center gap-2 truncate font-display text-[30px] uppercase leading-none text-white">
          {row.watched && <Eye className="h-6 w-6 shrink-0" style={{ color: INV_COLORS.cyan }} />}
          <span className="truncate">{row.pseudo}</span>
        </span>
        <span className="mt-1.5 flex items-center gap-2 text-[16px] font-bold uppercase tracking-wider">
          {row.waiting ? (
            <span className="text-amber-300">{t('table.inv.panel.next', 'prochaine manche')}</span>
          ) : row.alive ? (
            <>
              <Lives count={row.lives} />
              <span className="text-white/45">{t('table.inv.panel.wave', 'vague {wave}').replace('{wave}', String(row.wave))}</span>
            </>
          ) : (
            <span style={{ color: INV_COLORS.red }}>{t('table.inv.panel.over', 'game over')}</span>
          )}
        </span>
      </span>
      <span className="font-retro text-[24px] tabular-nums" style={{ color: row.alive ? '#ffffff' : 'rgba(255,255,255,0.7)' }}>
        {row.waiting ? '' : formatScore(row.score)}
      </span>
    </button>
  );
}

export default function PlayersPanel({ bridge, t }: Props) {
  const rows = useStore(bridge.store, (s) => s.panel);
  const phase = useStore(bridge.store, (s) => s.phase);
  const myId = useStore(bridge.store, (s) => s.myPlayerId);
  const watching = phase === 'over' || phase === 'spectating' || myId === null;
  const alive = rows.filter((r) => r.alive).length;
  let rank = 0;

  return (
    <div className="flex min-h-0 flex-col gap-3">
      <div className="flex items-baseline justify-between px-1">
        <span className="font-retro text-[22px] tracking-wider" style={{ color: INV_COLORS.green }}>
          {t('table.inv.panel.title', 'JOUEURS')}
        </span>
        <span className="text-[18px] font-bold uppercase tracking-wider text-white/55">
          {t('table.inv.panel.alive', '{count} en jeu').replace('{count}', String(alive))}
        </span>
      </div>
      <div className="flex flex-col gap-2">
        {rows.map((row) => {
          if (!row.waiting) rank += 1;
          return (
            <Row
              key={row.playerId}
              row={row}
              rank={rank}
              canWatch={watching && row.alive && !row.isMe}
              onWatch={() => bridge.store.setState({ watchId: row.playerId })}
              t={t}
            />
          );
        })}
      </div>
      {watching && alive > 0 && (
        <div className="px-1 text-[18px] text-white/55">{t('table.inv.panel.watchHint', 'Touche un joueur en jeu pour regarder sa partie')}</div>
      )}
    </div>
  );
}
