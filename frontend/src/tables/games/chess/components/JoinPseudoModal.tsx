/**
 * Saisie du pseudo avant de rejoindre une partie (clavier tactile système,
 * comme le join quiz depuis une borne).
 */

import { useState } from 'react';
import ArcadeButton from '../../../components/ui/ArcadeButton';
import ArcadeModal from '../../../components/ui/ArcadeModal';
import { useT } from '../../../i18n/useT';
import { getLastPseudo } from '../lib/identity';
import { isValidPseudo } from '../lib/pseudo';

interface Props {
  open: boolean;
  busy: boolean;
  onClose: () => void;
  onJoin: (pseudo: string) => void;
}

export default function JoinPseudoModal({ open, busy, onClose, onJoin }: Props) {
  const t = useT();
  const [pseudo, setPseudo] = useState<string>(() => getLastPseudo());

  return (
    <ArcadeModal open={open} onClose={onClose} title={t('table.chess.lobby.join')} size="md">
      <div className="flex flex-col gap-5">
        <input
          value={pseudo}
          onChange={(e) => setPseudo(e.target.value)}
          maxLength={16}
          placeholder={t('table.chess.create.pseudoPlaceholder')}
          className="w-full rounded-2xl border border-white/15 bg-black/40 px-5 py-3.5 text-xl text-table-ink outline-none placeholder:text-table-ink-muted focus:border-table-cyan/70"
        />
        <ArcadeButton
          variant="accent"
          size="lg"
          fullWidth
          disabled={busy || !isValidPseudo(pseudo)}
          onClick={() => onJoin(pseudo.trim())}
        >
          {t('table.chess.lobby.join')}
        </ArcadeButton>
      </div>
    </ArcadeModal>
  );
}
