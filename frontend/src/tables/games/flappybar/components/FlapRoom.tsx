/**
 * Salle d'attente (avant la manche 1) et entre-deux-manches (statut 'lobby'
 * avec lastRound). Le bouton "Nouvelle manche" est verrouillé jusqu'à
 * restartUnlockAt (anneau de progression calé sur l'horloge serveur), puis
 * ouvert à TOUS les joueurs actifs : le premier qui appuie relance.
 */

import { useEffect, useState } from 'react';
import { LogOut, Megaphone, Play, UserPlus } from 'lucide-react';
import ArcadeButton from '../../../components/ui/ArcadeButton';
import type { TFunction } from '../../../i18n/useT';
import { serverNow } from '../../../lib/clockSync';
import type { FlapPlayerView, FlapPublicState, FlapYou } from '../lib/flapTypes';
import type { FlapTheme } from '../themes/types';
import RoundResultsTable from './RoundResultsTable';

interface Props {
  state: FlapPublicState;
  you: FlapYou | null;
  theme: FlapTheme;
  busy: boolean;
  inviteSent: boolean;
  onStart: () => void;
  onInvite: () => void;
  onLeave: () => void;
  onJoin: () => void;
  t: TFunction;
}

const GOLD = '#E8C267';

function Badge({ color, children }: { color: string; children: string }) {
  return (
    <span className="rounded-full px-3 py-1 text-[16px] font-bold uppercase tracking-wider" style={{ background: `${color}22`, color }}>
      {children}
    </span>
  );
}

function PlayersList({
  players,
  myId,
  accent,
  columns,
  t,
}: {
  players: FlapPlayerView[];
  myId: string | null;
  accent: string;
  columns: 1 | 2;
  t: TFunction;
}) {
  const dense = players.length > 10;
  return (
    <div className={`grid gap-2 ${columns === 2 ? 'grid-cols-2' : 'grid-cols-1'}`}>
      {players.map((player) => (
        <div
          key={player.playerId}
          className="flex items-center justify-between gap-3 rounded-2xl bg-white/5 px-4"
          style={{ minHeight: dense ? 44 : 56 }}
        >
          <span className={`truncate font-semibold ${dense ? 'text-[22px]' : 'text-[28px]'}`} style={{ color: player.playerId === myId ? accent : '#ffffff' }}>
            {player.pseudo}
          </span>
          <span className="flex shrink-0 items-center gap-2">
            {player.isHost && <Badge color={GOLD}>{t('table.flap.room.host', 'hôte')}</Badge>}
            {player.status === 'pending' ? (
              <Badge color="#FBBF24">{t('table.flap.room.waitingNext', 'prochaine manche')}</Badge>
            ) : (
              <Badge color="#5ED9A1">{t('table.flap.room.connected', 'connecté')}</Badge>
            )}
          </span>
        </div>
      ))}
    </div>
  );
}

function NextRoundButton({
  unlockAt,
  lockedFrom,
  disabled,
  accent,
  onStart,
  t,
}: {
  unlockAt: number | null;
  lockedFrom: number;
  disabled: boolean;
  accent: string;
  onStart: () => void;
  t: TFunction;
}) {
  const [now, setNow] = useState(() => serverNow());
  useEffect(() => {
    const id = window.setInterval(() => setNow(serverNow()), 120);
    return () => window.clearInterval(id);
  }, []);
  const remaining = unlockAt !== null ? Math.max(0, unlockAt - now) : 0;
  const locked = remaining > 0;
  const total = unlockAt !== null ? Math.max(1, unlockAt - lockedFrom) : 1;
  const done = locked ? 1 - remaining / total : 1;
  const seconds = Math.ceil(remaining / 1000);
  return (
    <ArcadeButton
      variant="accent"
      size="xl"
      fullWidth
      className="min-h-[80px] text-[26px]"
      disabled={locked || disabled}
      onClick={onStart}
      icon={
        locked ? (
          <span
            className="flex h-12 w-12 items-center justify-center rounded-full"
            style={{ background: `conic-gradient(${accent} ${Math.round(done * 360)}deg, rgba(255,255,255,0.18) 0deg)` }}
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-black/70 text-[18px] font-bold text-white">{seconds}</span>
          </span>
        ) : (
          <Play className="h-7 w-7" />
        )
      }
    >
      {locked
        ? t('table.flap.room.nextIn', 'Nouvelle manche dans {seconds} s').replace('{seconds}', String(seconds))
        : t('table.flap.room.next', 'Nouvelle manche')}
    </ArcadeButton>
  );
}

export default function FlapRoom({ state, you, theme, busy, inviteSent, onStart, onInvite, onLeave, onJoin, t }: Props) {
  const accent = theme.palette.accent;
  const lastRound = state.lastRound;
  const myId = you?.playerId ?? null;
  const meActive = you !== null && you.status === 'active';
  const hostOnly = state.config.hostOnlyStart && you !== null && !you.isHost;
  const canStart = meActive && !hostOnly && !busy;

  const secondary = you && (
    <div className="flex gap-3">
      <button
        type="button"
        className="flex min-h-[72px] flex-1 items-center justify-center gap-2.5 rounded-2xl border-2 px-6 text-[22px] font-bold uppercase active:scale-95 disabled:opacity-50"
        style={{ borderColor: `${accent}66`, color: accent, background: `${accent}12` }}
        disabled={busy || inviteSent}
        onClick={onInvite}
      >
        <Megaphone className="h-6 w-6" />
        {inviteSent ? t('table.flap.room.invited', 'Invitation envoyée') : t('table.flap.room.invite', 'Inviter tout le bar')}
      </button>
      <button
        type="button"
        className="flex min-h-[72px] flex-1 items-center justify-center gap-2.5 rounded-2xl border border-white/20 px-6 text-[22px] font-bold uppercase text-white/75 active:scale-95"
        disabled={busy}
        onClick={onLeave}
      >
        <LogOut className="h-6 w-6" />
        {t('table.flap.room.leave', 'Quitter')}
      </button>
    </div>
  );

  const joinButton = you === null && (
    <ArcadeButton variant="accent" size="xl" fullWidth className="min-h-[80px] text-[26px]" icon={<UserPlus className="h-7 w-7" />} disabled={busy} onClick={onJoin}>
      {t('table.flap.lobby.join', 'Rejoindre')}
    </ArcadeButton>
  );

  const hostNote = hostOnly && (
    <div className="text-center text-[20px] text-white/60">{t('table.flap.room.hostOnly', "Seul l'hôte peut lancer la manche")}</div>
  );

  if (!lastRound) {
    return (
      <div data-flap-ui className="pointer-events-auto absolute inset-0 z-30 flex items-center justify-center">
        <div
          className="flap-pop flex w-[820px] max-w-[92vw] flex-col gap-6 rounded-3xl border-2 px-12 py-9"
          style={{ background: 'rgba(4,6,14,0.88)', borderColor: `${accent}66` }}
        >
          <div className="flex items-center justify-between gap-4">
            <span className="font-display text-[48px] uppercase tracking-wide" style={{ color: accent }}>
              {t('table.flap.room.waitingTitle', "Salle d'attente")}
            </span>
            <span className="rounded-full bg-white/10 px-4 py-1.5 font-display text-[26px] text-white/85">
              {state.players.length} / {state.config.maxPlayers}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="rounded-full px-4 py-1.5 text-[20px] font-bold uppercase" style={{ background: `${accent}1C`, color: accent }}>
              {t('table.flap.room.theme', 'Thème')} · {t(`table.flap.theme.${theme.id}`, theme.label)}
            </span>
            <span className="text-[20px] uppercase tracking-wider text-white/50">{t('table.flap.room.players', 'Joueurs')}</span>
          </div>
          <PlayersList players={state.players} myId={myId} accent={accent} columns={state.players.length > 6 ? 2 : 1} t={t} />
          {meActive && (
            <ArcadeButton variant="accent" size="xl" fullWidth className="min-h-[80px] text-[28px]" icon={<Play className="h-8 w-8" />} disabled={!canStart} onClick={onStart}>
              {t('table.flap.room.start', 'Lancer la partie')}
            </ArcadeButton>
          )}
          {hostNote}
          {joinButton}
          {secondary}
        </div>
      </div>
    );
  }

  return (
    <div data-flap-ui className="pointer-events-auto absolute inset-0 z-30 grid grid-cols-[2fr_1fr] gap-6 p-8" style={{ background: 'rgba(3,5,12,0.84)' }}>
      <div className="flap-pop min-h-0 rounded-3xl border border-white/10 bg-black/40 p-6">
        <RoundResultsTable ranking={lastRound.ranking} myPlayerId={myId} endedBy={lastRound.endedBy} accent={accent} t={t} />
      </div>
      <div className="flap-pop flex min-h-0 flex-col gap-5 rounded-3xl border-2 p-6" style={{ borderColor: `${accent}55`, background: 'rgba(4,6,14,0.72)' }}>
        <span className="font-display text-[40px] uppercase leading-none" style={{ color: accent }}>
          {t('table.flap.room.betweenTitle', 'Fin de la manche {round}').replace('{round}', String(lastRound.index))}
        </span>
        <span className="text-[20px] uppercase tracking-wider text-white/50">
          {t('table.flap.room.players', 'Joueurs')} · {state.players.length} / {state.config.maxPlayers}
        </span>
        <PlayersList players={state.players} myId={myId} accent={accent} columns={state.players.length > 10 ? 2 : 1} t={t} />
        <div className="mt-auto flex flex-col gap-3">
          {meActive && (
            <NextRoundButton unlockAt={state.restartUnlockAt} lockedFrom={lastRound.endedAt} disabled={!canStart} accent={accent} onStart={onStart} t={t} />
          )}
          {hostNote}
          {joinButton}
          {secondary}
        </div>
      </div>
    </div>
  );
}
