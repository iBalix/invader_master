/**
 * Attente d'un adversaire (status lobby). Le créateur peut annuler ; une
 * autre dalle arrivée ici sans siège peut rejoindre directement.
 */

import ArcadeButton from '../../../components/ui/ArcadeButton';
import RetroLoader from '../../../components/ui/RetroLoader';
import { useT } from '../../../i18n/useT';

interface Props {
  isCreator: boolean;
  canJoin: boolean;
  busy: boolean;
  onCancel: () => void;
  onJoin: () => void;
}

export default function WaitingOverlay({ isCreator, canJoin, busy, onCancel, onJoin }: Props) {
  const t = useT();
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
        <ArcadeButton variant="ghost" size="md" disabled={busy} onClick={onCancel}>
          {t('table.chess.waiting.cancel')}
        </ArcadeButton>
      )}
    </div>
  );
}
