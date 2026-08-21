/**
 * Salle d'attente : le créateur voit la table se remplir et lance quand il
 * veut (dès 2 joueurs). Les sièges s'allument à leur place définitive sur la
 * table rendue derrière. La table s'annule seule au bout de 15 minutes.
 */

import { useEffect, useRef, useState } from 'react';
import { Play, LogOut, Armchair, Megaphone } from 'lucide-react';
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
  onInvite: () => void;
  t: TFunction;
}

export default function WaitingRoom({ state, you, theme, busy, onLaunch, onLeave, onSit, onInvite, t }: Props) {
  // anti-spam local : le bouton se grise 45 s après un envoi (le serveur
  // applique le même délai)
  const [inviteSent, setInviteSent] = useState(false);
  const inviteTimer = useRef<number | null>(null);
  useEffect(() => () => {
    if (inviteTimer.current) window.clearTimeout(inviteTimer.current);
  }, []);
  function handleInvite() {
    onInvite();
    setInviteSent(true);
    inviteTimer.current = window.setTimeout(() => setInviteSent(false), 45_000);
  }

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
        className="bj-pop flex flex-col items-center gap-6 rounded-3xl border-2 px-14 py-9"
        style={{ background: 'rgba(4,6,14,0.88)', borderColor: theme.seatBorder, minWidth: 660 }}
      >
        <div className="font-display text-5xl font-black uppercase tracking-wide" style={{ color: theme.hudAccent }}>
          {t('table.bj.waiting.title')}
        </div>
        <div className="font-display text-3xl font-bold text-white/90">
          {t('table.bj.waiting.count')
            .replace('{count}', String(seatCount))
            .replace('{max}', String(state.config.maxSeats))}
        </div>

        {/* rappel des réglages */}
        <div className="flex max-w-[640px] flex-wrap items-center justify-center gap-2.5 text-lg">
          <span className="rounded-full bg-white/8 px-4 py-1.5 font-semibold text-white/80">
            {t('table.bj.waiting.rounds').replace('{rounds}', String(state.config.rounds)).replace('{min}', String(est))}
          </span>
          <span className="rounded-full bg-white/8 px-4 py-1.5 font-semibold text-white/80">
            {t('table.bj.waiting.bets').replace('{min}', String(state.config.minBet)).replace('{max}', String(state.config.maxBet))}
          </span>
          <span className="rounded-full bg-white/8 px-4 py-1.5 font-semibold text-white/80">
            {t('table.bj.waiting.chips').replace('{chips}', String(state.config.startChips))}
          </span>
          <span className="rounded-full px-4 py-1.5 font-semibold" style={{ background: `${theme.hudAccent}1C`, color: theme.hudAccent }}>
            {t(theme.labelKey)}
          </span>
          {Object.values(state.config.jokersEnabled ?? {}).some((v) => v !== false) ? (
            <span className="rounded-full bg-white/8 px-4 py-1.5 font-semibold text-white/80">{t('table.bj.waiting.jokersOn')}</span>
          ) : (
            <span className="rounded-full bg-white/8 px-4 py-1.5 font-semibold text-white/80">{t('table.bj.waiting.jokersOff')}</span>
          )}
        </div>

        {isCreator ? (
          <ArcadeButton
            variant="accent"
            size="xl"
            icon={<Play className="h-6 w-6" />}
            disabled={busy || !canLaunch}
            onClick={onLaunch}
          >
            {canLaunch ? t('table.bj.waiting.launch') : t('table.bj.waiting.needTwo')}
          </ArcadeButton>
        ) : seated ? (
          <div className="font-display text-2xl font-bold uppercase tracking-wide text-white/70">
            {t('table.bj.waiting.forCreator').replace('{pseudo}', creator?.pseudo ?? '?')}
          </div>
        ) : canSit ? (
          <ArcadeButton variant="accent" size="xl" icon={<Armchair className="h-6 w-6" />} disabled={busy} onClick={onSit}>
            {t('table.bj.waiting.sit')}
          </ArcadeButton>
        ) : (
          <div className="font-display text-2xl font-bold uppercase tracking-wide text-white/70">
            {t('table.bj.waiting.full')}
          </div>
        )}

        {seated && (
          <div className="flex items-center gap-3">
            <button
              className="flex items-center gap-2.5 rounded-2xl border-2 px-8 py-3.5 text-xl font-bold uppercase active:scale-95 disabled:opacity-50"
              style={{ borderColor: `${theme.hudAccent}66`, color: theme.hudAccent, background: `${theme.hudAccent}12` }}
              disabled={busy || inviteSent}
              onClick={handleInvite}
            >
              <Megaphone className="h-6 w-6" />
              {inviteSent ? t('table.invite.sent') : t('table.invite.cta')}
            </button>
            <button
              className="flex items-center gap-2.5 rounded-2xl border border-white/20 px-8 py-3.5 text-xl font-bold uppercase text-white/75 active:scale-95"
              disabled={busy}
              onClick={onLeave}
            >
              <LogOut className="h-6 w-6" />
              {t('table.bj.waiting.leave')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
