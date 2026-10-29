/**
 * Modale « Rejoindre » : pseudo saisi au clavier tactile, prérempli avec le
 * dernier pseudo de la dalle (partagé avec les autres jeux du bar).
 */

import { useEffect, useState } from 'react';
import { LogIn } from 'lucide-react';
import ArcadeButton from '../../../components/ui/ArcadeButton';
import ArcadeModal from '../../../components/ui/ArcadeModal';
import { useT } from '../../../i18n/useT';
import { getLastPseudo, isValidPseudo } from '../lib/identity';

interface Props {
  open: boolean;
  onSubmit: (pseudo: string) => void;
  onClose: () => void;
  busy?: boolean;
  error?: string | null;
}

export default function JoinPseudoModal({ open, onSubmit, onClose, busy = false, error = null }: Props) {
  const t = useT();
  const [pseudo, setPseudo] = useState<string>(() => getLastPseudo());

  // à chaque ouverture, on repart du dernier pseudo connu de la dalle
  useEffect(() => {
    if (open) setPseudo(getLastPseudo());
  }, [open]);

  const valid = isValidPseudo(pseudo);
  const showHint = pseudo.trim().length > 0 && !valid;

  function submit() {
    if (busy || !valid) return;
    onSubmit(pseudo.trim());
  }

  return (
    <ArcadeModal open={open} onClose={onClose} title={t('table.inv.join.title', 'Rejoindre la partie')} size="md">
      <div className="flex flex-col gap-5">
        <div>
          <input
            value={pseudo}
            onChange={(e) => setPseudo(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit();
            }}
            maxLength={16}
            placeholder={t('table.inv.create.pseudoPlaceholder', 'Ton pseudo')}
            className="h-[76px] w-full rounded-2xl border-2 border-white/15 bg-black/40 px-6 text-2xl text-table-ink outline-none placeholder:text-table-ink-muted focus:border-table-cyan/70"
          />
          {showHint && (
            <div className="mt-2 px-1 text-[20px] font-semibold text-table-ink-muted">
              {t('table.inv.create.pseudoInvalid', 'Entre 2 et 16 caractères')}
            </div>
          )}
        </div>

        {error && (
          <div className="rounded-2xl border border-red-500/40 bg-red-500/10 px-5 py-3 text-center text-[20px] font-semibold text-red-300">
            {error}
          </div>
        )}

        <ArcadeButton
          variant="accent"
          size="xl"
          fullWidth
          className="min-h-[72px]"
          icon={<LogIn className="h-7 w-7" />}
          disabled={busy || !valid}
          onClick={submit}
        >
          {t('table.inv.join.submit', 'Rejoindre')}
        </ArcadeButton>
      </div>
    </ArcadeModal>
  );
}
