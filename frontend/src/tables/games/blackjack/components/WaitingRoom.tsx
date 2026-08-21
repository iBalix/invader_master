/**
 * Salle d'attente : le créateur voit la table se remplir et lance quand il
 * veut (dès 2 joueurs). Les sièges s'allument à leur place définitive sur la
 * table rendue derrière. La table s'annule seule au bout de 15 minutes.
 */

import { Play, LogOut, Armchair } from 'lucide-react';
import ArcadeButton from '../../../components/ui/ArcadeButton';
import { estimateMinutes } from '../lib/bjTypes';
import type { BjPublicState, BjYou } from '../lib/bjTypes';
import type { BjTheme } from '../themes/types';
import type { TFunction } from '../../../i18n/useT';

interface Props {
  state: BjPublicState;
  you: BjYou | null;
  theme: BjTheme;
  busy: boolean;
  onLaunch: () => void;
  onLeave: () => void;
  onSit: () => void;
  t: TFunction;
}

export default function WaitingRoom({ state, you, theme, busy, onLaunch, onLeave, onSit, t }: Props) {
  const seatCount = state.seats.length;
  const creator = state.seats.find((s) => s.isCreator);
  const isCreator = you !== null && you.isCreator;
  const seated = you !== null && state.seats.some((s) => s.playerId === you.playerId);
  const canLaunch = isCreator && seatCount >= 2;
  const canSit = !seated && seatCount < state.config.maxSeats;
  const est = estimateMinutes(state.config.rounds, Math.max(2, seatCount));

  return (
    <div className="pointer-events-auto absolute left-1/2 top-[44%] z-30 -translate-x-1/2 -translate-y-1/2">
      <div
        className="bj-pop flex flex-col items-center gap-4 rounded-3xl border-2 px-10 py-7"
        style={{ background: 'rgba(4,6,14,0.88)', borderColor: theme.seatBorder, minWidth: 480 }}
      >
        <div className="font-display text-3xl font-black uppercase tracking-wide" style={{ color: theme.hudAccent }}>
          {t('table.bj.waiting.title')}
        </div>
        <div className="font-display text-xl font-bold text-white/90">
          {t('table.bj.waiting.count')
            .replace('{count}', String(seatCount))
            .replace('{max}', String(state.config.maxSeats))}
        </div>

        {/* rappel des réglages */}
        <div className="flex flex-wrap items-center justify-center gap-2 text-sm">
          <span className="rounded-full bg-white/8 px-3 py-1 font-semibold text-white/80">
            {t('table.bj.waiting.rounds').replace('{rounds}', String(state.config.rounds)).replace('{min}', String(est))}
          </span>
          <span className="rounded-full bg-white/8 px-3 py-1 font-semibold text-white/80">
            {t('table.bj.waiting.bets').replace('{min}', String(state.config.minBet)).replace('{max}', String(state.config.maxBet))}
          </span>
          <span className="rounded-full bg-white/8 px-3 py-1 font-semibold text-white/80">
            {t('table.bj.waiting.chips').replace('{chips}', String(state.config.startChips))}
          </span>
          <span className="rounded-full px-3 py-1 font-semibold" style={{ background: `${theme.hudAccent}1C`, color: theme.hudAccent }}>
            {t(theme.labelKey)}
          </span>
          {Object.values(state.config.jokersEnabled ?? {}).some((v) => v !== false) ? (
            <span className="rounded-full bg-white/8 px-3 py-1 font-semibold text-white/80">{t('table.bj.waiting.jokersOn')}</span>
          ) : (
            <span className="rounded-full bg-white/8 px-3 py-1 font-semibold text-white/80">{t('table.bj.waiting.jokersOff')}</span>
          )}
          {state.config.lateJoin && (
            <span className="rounded-full bg-white/8 px-3 py-1 font-semibold text-white/80">{t('table.bj.waiting.lateJoin')}</span>
          )}
        </div>

        {isCreator ? (
          <ArcadeButton
            variant="accent"
            size="lg"
            icon={<Play className="h-5 w-5" />}
            disabled={busy || !canLaunch}
            onClick={onLaunch}
          >
            {canLaunch ? t('table.bj.waiting.launch') : t('table.bj.waiting.needTwo')}
          </ArcadeButton>
        ) : seated ? (
          <div className="font-display text-base font-bold uppercase tracking-wide text-white/70">
            {t('table.bj.waiting.forCreator').replace('{pseudo}', creator?.pseudo ?? '?')}
          </div>
        ) : canSit ? (
          <ArcadeButton variant="accent" size="lg" icon={<Armchair className="h-5 w-5" />} disabled={busy} onClick={onSit}>
            {t('table.bj.waiting.sit')}
          </ArcadeButton>
        ) : (
          <div className="font-display text-base font-bold uppercase tracking-wide text-white/70">
            {t('table.bj.waiting.full')}
          </div>
        )}

        {seated && (
          <button
            className="flex items-center gap-2 rounded-xl border border-white/20 px-5 py-2 text-sm font-bold uppercase text-white/75 active:scale-95"
            disabled={busy}
            onClick={onLeave}
          >
            <LogOut className="h-4 w-4" />
            {t('table.bj.waiting.leave')}
          </button>
        )}
      </div>
    </div>
  );
}
