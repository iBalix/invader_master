/**
 * Pilule "spectateur" affichée à celui qui regarde sans jouer.
 */

import { Eye } from 'lucide-react';
import { useT } from '../../../i18n/useT';

export default function SpectatorBadge() {
  const t = useT();
  return (
    <div className="flex items-center gap-2 rounded-full border border-white/15 bg-black/45 px-4 py-2 font-display text-sm uppercase tracking-wider text-table-cyan">
      <Eye className="h-4 w-4" />
      {t('table.chess.spectator.badge')}
    </div>
  );
}
