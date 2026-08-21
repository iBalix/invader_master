/**
 * Saisie du pseudo avant de s'asseoir à une table (clavier tactile système).
 */

import { useState } from 'react';
import ArcadeButton from '../../../components/ui/ArcadeButton';
import ArcadeModal from '../../../components/ui/ArcadeModal';
import { useT } from '../../../i18n/useT';
import { getLastPseudo, isValidPseudo } from '../lib/identity';

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
    <ArcadeModal open={open} onClose={onClose} title={t('table.bj.lobby.join')} size="md">
      <div className="flex flex-col gap-5">
        <input
          value={pseudo}
          onChange={(e) => setPseudo(e.target.value)}
          maxLength={16}
          placeholder={t('table.bj.create.pseudoPlaceholder')}
          className="w-full rounded-2xl border border-white/15 bg-black/40 px-6 py-4 text-2xl text-table-ink outline-none placeholder:text-table-ink-muted focus:border-table-cyan/70"
        />
        <ArcadeButton
          variant="accent"
          size="xl"
          fullWidth
          disabled={busy || !isValidPseudo(pseudo)}
          onClick={() => onJoin(pseudo.trim())}
        >
          {t('table.bj.lobby.join')}
        </ArcadeButton>
      </div>
    </ArcadeModal>
  );
}
