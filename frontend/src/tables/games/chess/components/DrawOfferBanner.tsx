/**
 * Bannière d'offre de nulle reçue : accepter / refuser.
 */

import ArcadeButton from '../../../components/ui/ArcadeButton';
import { useT } from '../../../i18n/useT';
import type { ChessTheme } from '../themes/types';

interface Props {
  theme: ChessTheme;
  onAccept: () => void;
  onDecline: () => void;
  disabled: boolean;
}

export default function DrawOfferBanner({ theme, onAccept, onDecline, disabled }: Props) {
  const t = useT();
  return (
    <div
      className="flex flex-col gap-3 rounded-2xl border p-4"
      style={{ borderColor: `${theme.hudAccent}66`, background: `${theme.hudAccent}14` }}
    >
      <div className="text-center font-display text-sm uppercase tracking-wider text-table-ink">
        {t('table.chess.draw.banner')}
      </div>
      <div className="flex gap-2">
        <ArcadeButton variant="accent" size="sm" className="flex-1" disabled={disabled} onClick={onAccept}>
          {t('table.chess.action.draw.accept')}
        </ArcadeButton>
        <ArcadeButton variant="ghost" size="sm" className="flex-1" disabled={disabled} onClick={onDecline}>
          {t('table.chess.action.draw.decline')}
        </ArcadeButton>
      </div>
    </div>
  );
}
