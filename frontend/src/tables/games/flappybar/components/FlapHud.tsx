/**
 * HUD DOM par-dessus le canvas (pointer-events: none, sauf les boutons
 * marqués data-flap-ui) : compte à rebours, distance du focus en très gros,
 * pastille "en vol", mini-classement, bannière de mort, spectateur, attente,
 * palier, bouton quitter (confirmation seulement en vol).
 */

import { useEffect, useRef, useState, type RefObject } from 'react';
import { useStore } from 'zustand';
import { X } from 'lucide-react';
import ArcadeButton from '../../../components/ui/ArcadeButton';
import ArcadeModal from '../../../components/ui/ArcadeModal';
import type { TFunction } from '../../../i18n/useT';
import type { FlapSfx } from '../audio/flapSfx';
import type { FlapPublicState } from '../lib/flapTypes';
import { formatMeters } from '../lib/format';
import type { DeathInfo, FlapBridge, RankingRow } from '../phaser/bridge';
import type { FlapTheme } from '../themes/types';
import Countdown from './Countdown';
import RankingStrip from './RankingStrip';

interface Props {
  bridge: FlapBridge;
  state: FlapPublicState;
  theme: FlapTheme;
  sfxRef: RefObject<FlapSfx | null>;
  onQuit: () => void;
  t: TFunction;
}

const SHADOW = { textShadow: '0 3px 0 rgba(0,0,0,0.55), 0 0 24px rgba(0,0,0,0.45)' };
const DEATH_COMPACT_MS = 1800;
const MILESTONE_MS = 1400;

export default function FlapHud({ bridge, state, theme, sfxRef, onQuit, t }: Props) {
  const phase = useStore(bridge.store, (s) => s.phase);
  const round = useStore(bridge.store, (s) => s.round);
  const myId = useStore(bridge.store, (s) => s.myPlayerId);
  const meWaiting = useStore(bridge.store, (s) => (s.myPlayerId !== null ? s.players[s.myPlayerId]?.waiting ?? false : false));
  const meInRound = useStore(bridge.store, (s) => (s.myPlayerId !== null ? s.players[s.myPlayerId]?.inRound ?? false : false));
  const [distance, setDistance] = useState(0);
  const [rows, setRows] = useState<RankingRow[]>([]);
  const [death, setDeath] = useState<DeathInfo | null>(null);
  const [deathCompact, setDeathCompact] = useState(false);
  const [milestone, setMilestone] = useState<{ meters: number; key: number } | null>(null);
  const [quitOpen, setQuitOpen] = useState(false);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    const offs = [
      bridge.fromScene.on('distance', setDistance),
      bridge.fromScene.on('ranking', setRows),
      bridge.fromScene.on('death', (info) => {
        setDeath(info);
        setDeathCompact(false);
        timers.current.push(window.setTimeout(() => setDeathCompact(true), DEATH_COMPACT_MS));
      }),
      bridge.fromScene.on('milestone', (meters) => {
        setMilestone({ meters, key: Date.now() });
        timers.current.push(window.setTimeout(() => setMilestone(null), MILESTONE_MS));
      }),
    ];
    return () => {
      for (const off of offs) off();
      for (const id of timers.current) window.clearTimeout(id);
      timers.current = [];
    };
  }, [bridge]);

  // nouvelle manche : on repart propre
  const roundKey = round ? `${round.index}:${round.seed}` : '';
  useEffect(() => {
    setDeath(null);
    setDeathCompact(false);
    setDistance(0);
    setRows([]);
    setMilestone(null);
  }, [roundKey]);

  const playing = state.status === 'playing';
  const { accent, hudBg } = theme.palette;
  const alive = rows.filter((row) => row.alive).length;
  const showDistance = playing && phase !== 'idle' && phase !== 'countdown';
  const deadText = death ? t('table.flap.hud.dead', 'Tu es tombé à {meters} m').replace('{meters}', formatMeters(death.distanceM, 0)) : '';
  const deadSub = t('table.flap.hud.deadSub', 'Tu regardes les survivants');

  return (
    <>
      <div className="pointer-events-none absolute inset-0 z-20">
        {playing && round && (
          <Countdown key={round.startsAt} startsAt={round.startsAt} goLabel={t('table.flap.hud.go', 'GO')} accent={accent} sfxRef={sfxRef} />
        )}

        {showDistance && (
          <div className="absolute left-1/2 top-5 flex -translate-x-1/2 items-baseline gap-3">
            <span className="font-display text-[96px] leading-none text-white" style={SHADOW}>
              {distance}
            </span>
            <span className="font-display text-[40px] leading-none text-white/80" style={SHADOW}>
              {t('table.flap.hud.meters', 'm')}
            </span>
          </div>
        )}

        {playing && rows.length > 0 && (
          <div className="absolute left-6 top-6 rounded-full px-5 py-2 text-[28px] font-bold text-white" style={{ background: hudBg }}>
            {t('table.flap.hud.alive', '{alive} / {total} en vol').replace('{alive}', String(alive)).replace('{total}', String(rows.length))}
          </div>
        )}

        {playing && rows.length > 1 && <RankingStrip rows={rows} accent={accent} hudBg={hudBg} />}

        {playing && phase === 'countdown' && meInRound && (
          <div className="absolute bottom-24 left-1/2 -translate-x-1/2 rounded-full px-8 py-3 text-[26px] font-semibold text-white/85" style={{ background: hudBg }}>
            {t('table.flap.hud.tapHint', "Tape n'importe où pour voler")}
          </div>
        )}

        {playing && death && deathCompact && (
          <div className="absolute left-1/2 top-[150px] -translate-x-1/2 whitespace-nowrap rounded-full px-6 py-2 text-[24px] font-semibold text-white/85" style={{ background: hudBg }}>
            {deadText} · {deadSub}
          </div>
        )}
        {playing && death && !deathCompact && (
          <div className="flap-pop absolute left-1/2 top-[36%] flex -translate-x-1/2 flex-col items-center gap-3 rounded-3xl px-12 py-7 text-center" style={{ background: hudBg }}>
            <span className="font-display text-[52px] leading-none text-white" style={SHADOW}>
              {deadText}
            </span>
            <span className="text-[26px] text-white/80">{deadSub}</span>
          </div>
        )}

        {playing && myId === null && (
          <div className="absolute right-6 top-24 rounded-full px-5 py-2 text-[22px] font-bold uppercase text-white/75" style={{ background: hudBg }}>
            {t('table.flap.hud.spectator', 'Spectateur')}
          </div>
        )}

        {playing && myId !== null && (meWaiting || !meInRound) && (
          <div className="absolute bottom-24 left-1/2 -translate-x-1/2 rounded-full px-8 py-3 text-[26px] font-semibold text-white/85" style={{ background: hudBg }}>
            {t('table.flap.hud.waitingNext', 'Tu entres à la prochaine manche')}
          </div>
        )}

        {milestone && (
          <div
            key={milestone.key}
            className="flap-float-up absolute left-1/2 top-[26%] -translate-x-1/2 whitespace-nowrap font-display text-[72px] leading-none"
            style={{ color: accent, ...SHADOW }}
          >
            {t('table.flap.hud.milestone', '{meters} m !').replace('{meters}', String(milestone.meters))}
          </div>
        )}

        {playing && (
          <button
            type="button"
            data-flap-ui
            onClick={() => (phase === 'playing' ? setQuitOpen(true) : onQuit())}
            className="pointer-events-auto absolute right-6 top-6 flex min-h-[64px] items-center gap-2 rounded-full border border-white/15 px-6 font-display text-[24px] uppercase tracking-wider text-white/85 active:scale-95"
            style={{ background: hudBg }}
          >
            <X className="h-6 w-6" />
            {t('table.flap.quit', 'Quitter')}
          </button>
        )}
      </div>

      <div data-flap-ui>
        <ArcadeModal open={quitOpen} onClose={() => setQuitOpen(false)} title={t('table.flap.quitConfirm', 'Quitter la manche en cours ?')} size="md">
          <div className="flex flex-col gap-5">
            <p className="text-[22px] text-table-ink-soft">{t('table.flap.quitConfirmSub', 'Ton oiseau tombera et ta distance sera comptée')}</p>
            <div className="flex gap-3">
              <ArcadeButton
                variant="danger"
                size="xl"
                className="min-h-[72px] flex-1"
                onClick={() => {
                  setQuitOpen(false);
                  onQuit();
                }}
              >
                {t('table.flap.quit', 'Quitter')}
              </ArcadeButton>
              <ArcadeButton variant="ghost" size="xl" className="min-h-[72px] flex-1" onClick={() => setQuitOpen(false)}>
                {t('table.flap.cancel', 'Annuler')}
              </ArcadeButton>
            </div>
          </div>
        </ArcadeModal>
      </div>
    </>
  );
}
