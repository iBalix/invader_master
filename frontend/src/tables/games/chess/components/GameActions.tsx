/**
 * Actions du joueur : abandonner / proposer nulle, avec confirmation tactile
 * en 2 temps (le bouton se transforme, auto-annulation après 5 s).
 */

import { useEffect, useState } from 'react';
import ArcadeButton from '../../../components/ui/ArcadeButton';
import { useT } from '../../../i18n/useT';

interface Props {
  onResign: () => void;
  onDrawOffer: () => void;
  drawOfferSent: boolean;
  disabled: boolean;
}

export default function GameActions({ onResign, onDrawOffer, drawOfferSent, disabled }: Props) {
  const t = useT();
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!confirming) return;
    const timer = window.setTimeout(() => setConfirming(false), 5000);
    return () => window.clearTimeout(timer);
  }, [confirming]);

  if (confirming) {
    return (
      <div className="flex items-center gap-2">
        <span className="flex-1 text-center font-display text-sm uppercase tracking-wider text-table-ink-soft">
          {t('table.chess.action.resign.confirm')}
        </span>
        <ArcadeButton
          variant="danger"
          size="sm"
          onClick={() => {
            setConfirming(false);
            onResign();
          }}
        >
          {t('table.chess.action.resign.yes')}
        </ArcadeButton>
        <ArcadeButton variant="ghost" size="sm" onClick={() => setConfirming(false)}>
          {t('table.chess.action.resign.no')}
        </ArcadeButton>
      </div>
    );
  }

  return (
    <div className="flex gap-2">
      <ArcadeButton
        variant="ghost"
        size="sm"
        className="flex-1"
        disabled={disabled || drawOfferSent}
        onClick={onDrawOffer}
      >
        {drawOfferSent ? t('table.chess.action.draw.sent') : t('table.chess.action.draw')}
      </ArcadeButton>
      <ArcadeButton
        variant="ghost"
        size="sm"
        className="flex-1 !border-table-red/40 !text-table-red"
        disabled={disabled}
        onClick={() => setConfirming(true)}
      >
        {t('table.chess.action.resign')}
      </ArcadeButton>
    </div>
  );
}
