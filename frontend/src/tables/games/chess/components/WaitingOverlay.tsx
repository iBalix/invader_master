/**
 * Attente d'un adversaire (status lobby). Le créateur peut inviter tout le
 * bar (bandeau sur les dalles hors partie) ou annuler ; une autre dalle
 * arrivée ici sans siège peut rejoindre directement.
 */

import { useEffect, useRef, useState } from 'react';
import { Megaphone } from 'lucide-react';
import ArcadeButton from '../../../components/ui/ArcadeButton';
import RetroLoader from '../../../components/ui/RetroLoader';
import { useT } from '../../../i18n/useT';

interface Props {
  isCreator: boolean;
  canJoin: boolean;
  busy: boolean;
  onCancel: () => void;
  onJoin: () => void;
  onInvite: () => void;
}

export default function WaitingOverlay({ isCreator, canJoin, busy, onCancel, onJoin, onInvite }: Props) {
  const t = useT();
  // anti-spam local : grise le bouton 45 s (le serveur applique le même délai)
  const [inviteSent, setInviteSent] = useState(false);
  const timer = useRef<number | null>(null);
  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current);
  }, []);
  function handleInvite() {
    onInvite();
    setInviteSent(true);
    timer.current = window.setTimeout(() => setInviteSent(false), 45_000);
  }

  return (
    <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-7 bg-black/65 px-8 text-center">
      <RetroLoader label={t('table.chess.waiting.title')} accent="cyan" />
      <div className="max-w-md text-lg text-table-ink-soft">{t('table.chess.waiting.sub')}</div>
      {canJoin && (
        <ArcadeButton variant="accent" size="xl" disabled={busy} onClick={onJoin}>
          {t('table.chess.lobby.join')}
        </ArcadeButton>
      )}
      {isCreator && (
        <ArcadeButton
          variant="cyan"
          size="lg"
          icon={<Megaphone className="h-5 w-5" />}
          disabled={busy || inviteSent}
          onClick={handleInvite}
        >
          {inviteSent ? t('table.invite.sent') : t('table.invite.cta')}
        </ArcadeButton>
      )}
      {isCreator && (
        <ArcadeButton variant="ghost" size="md" disabled={busy} onClick={onCancel}>
          {t('table.chess.waiting.cancel')}
        </ArcadeButton>
      )}
    </div>
  );
}
