/**
 * Calques DOM posés sur l'écran de la borne (pointer-events: none) : compte
 * à rebours, bandeau « TU REGARDES », mon bilan pendant mon GAME OVER (il
 * passe ensuite dans la colonne de gauche pour ne pas masquer la partie
 * regardée), spectateur ou arrivée en cours de manche. Le texte d'origine (« GAME OVER »,
 * « VAGUE 02 ») est écrit DANS l'écran par la boucle ; ces calques ne
 * portent que ce que la borne n'avait pas.
 */

import type { RefObject } from 'react';
import { useStore } from 'zustand';
import type { TFunction } from '../../../i18n/useT';
import type { InvSfxApi } from '../audio/invSfx';
import { INV_COLORS } from '../art/palette';
import type { InvBridge } from '../engine/bridge';
import { formatScore } from '../lib/format';
import type { InvPublicState, InvYou } from '../lib/invTypes';
import Countdown from './Countdown';

interface Props {
  bridge: InvBridge;
  state: InvPublicState;
  you: InvYou | null;
  sfxRef: RefObject<InvSfxApi | null>;
  t: TFunction;
}

function Tag({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <div
      className="inv-pop rounded-2xl border-2 px-7 py-3 text-center font-retro text-[22px] leading-snug"
      style={{ borderColor: color, color, background: 'rgba(0,0,0,0.78)', boxShadow: `0 0 22px ${color}55` }}
    >
      {children}
    </div>
  );
}

export default function ScreenOverlay({ bridge, state, you, sfxRef, t }: Props) {
  const phase = useStore(bridge.store, (s) => s.phase);
  const focusId = useStore(bridge.store, (s) => s.focusId);
  const me = useStore(bridge.store, (s) => s.me);
  const players = useStore(bridge.store, (s) => s.players);
  const round = state.round;
  const watched = focusId && focusId !== you?.playerId ? players[focusId]?.pseudo ?? null : null;
  const pending = you?.status === 'pending';
  const spectator = state.status === 'playing' && (!you || you.status === 'left');

  return (
    <div className="pointer-events-none absolute inset-[10px] z-10 overflow-hidden rounded-lg">
      {state.status === 'playing' && round && (
        <Countdown key={round.index} startsAt={round.startsAt} goLabel={t('table.inv.go', 'GO !')} accent={INV_COLORS.green} sfxRef={sfxRef} />
      )}

      {(phase === 'spectating' || phase === 'ended') && watched && (
        <div className="absolute inset-x-0 top-[132px] flex justify-center">
          <Tag color={INV_COLORS.cyan}>
            {t('table.inv.watching', 'TU REGARDES {pseudo}').replace('{pseudo}', watched.toUpperCase())}
          </Tag>
        </div>
      )}

      {phase === 'over' && (
        <div className="absolute inset-x-0 bottom-[96px] flex justify-center">
          <div className="inv-fade-in rounded-2xl border border-white/15 bg-black/80 px-8 py-4 text-center">
            <div className="text-[18px] font-bold uppercase tracking-widest text-white/55">{t('table.inv.myScore', 'Ton score')}</div>
            <div className="font-retro text-[40px] leading-tight" style={{ color: INV_COLORS.green }}>
              {formatScore(you?.result?.score ?? me.score)}
            </div>
            <div className="mt-1 text-[20px] text-white/70">
              {t('table.inv.mySummary', 'Vague {wave} · {kills} envahisseurs · {ufo} soucoupes')
                .replace('{wave}', String(you?.result?.wave ?? me.wave))
                .replace('{kills}', String(you?.result?.kills ?? me.kills))
                .replace('{ufo}', String(you?.result?.ufoHits ?? me.ufoHits))}
            </div>
          </div>
        </div>
      )}

      {state.status === 'playing' && pending && (
        <div className="absolute inset-x-0 bottom-[96px] flex justify-center">
          <Tag color="#FBBF24">{t('table.inv.pending', 'TU JOUES À LA PROCHAINE MANCHE')}</Tag>
        </div>
      )}

      {spectator && !watched && phase !== 'countdown' && (
        <div className="absolute inset-x-0 top-[132px] flex justify-center">
          <Tag color={INV_COLORS.cyan}>{t('table.inv.spectator', 'MODE SPECTATEUR')}</Tag>
        </div>
      )}
    </div>
  );
}
