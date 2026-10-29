/**
 * Création d'une partie : pseudo et nombre de joueurs max (un seul thème,
 * celui de la borne). Tout tient SANS SCROLL sur une dalle 1080p : chaque
 * groupe de choix vit dans son propre cadre, cibles 72 px.
 */

import { useEffect, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import ArcadeButton from '../../../components/ui/ArcadeButton';
import ArcadeModal from '../../../components/ui/ArcadeModal';
import { useT } from '../../../i18n/useT';
import { getLastPseudo, isValidPseudo } from '../lib/identity';
import type { CreateInvInput } from '../lib/invTypes';

interface Props {
  open: boolean;
  onClose: () => void;
  onSubmit: (input: CreateInvInput) => void;
  busy?: boolean;
  error?: string | null;
}

/** plafond du serveur (INV_MAX_PLAYERS) */
export const INV_MAX_PLAYERS = 8;
const CAP_CHOICES: readonly number[] = [2, 4, 6, 8];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
      <div className="mb-2.5 font-display text-[20px] uppercase tracking-[0.2em] text-table-cyan/80">{title}</div>
      {children}
    </div>
  );
}

function Segment({ options, value, onChange }: { options: readonly number[]; value: number; onChange: (v: number) => void }) {
  return (
    <div className="inline-flex gap-1.5 rounded-2xl border border-white/10 bg-black/35 p-1.5">
      {options.map((option) => (
        <button
          key={option}
          type="button"
          className={`h-[72px] min-w-[104px] rounded-xl px-6 font-display text-2xl tracking-wide transition-colors ${
            option === value ? 'bg-table-cyan text-black' : 'text-white/70'
          }`}
          onClick={() => onChange(option)}
        >
          {option}
        </button>
      ))}
    </div>
  );
}

export default function CreateInvModal({ open, onClose, onSubmit, busy = false, error = null }: Props) {
  const t = useT();
  const [pseudo, setPseudo] = useState<string>(() => getLastPseudo());
  const [touched, setTouched] = useState(false);
  const [maxPlayers, setMaxPlayers] = useState<number>(INV_MAX_PLAYERS);
  const pseudoRef = useRef<HTMLInputElement>(null);

  // à chaque ouverture : dernier pseudo de la dalle, validation remise à zéro
  useEffect(() => {
    if (open) {
      setPseudo(getLastPseudo());
      setTouched(false);
    }
  }, [open]);

  const valid = isValidPseudo(pseudo);
  const showPseudoError = touched && !valid;

  function submit() {
    if (busy) return;
    // pseudo manquant : on l'explique au lieu d'un bouton muet
    if (!valid) {
      setTouched(true);
      pseudoRef.current?.focus();
      return;
    }
    onSubmit({ pseudo: pseudo.trim(), maxPlayers });
  }

  return (
    <ArcadeModal open={open} onClose={onClose} title={t('table.inv.create.title', 'Nouvelle partie')} size="xl" dense>
      <div className="flex flex-col gap-4">
        <Section title={t('table.inv.create.pseudo', 'Ton pseudo')}>
          <input
            ref={pseudoRef}
            value={pseudo}
            onChange={(e) => setPseudo(e.target.value)}
            onBlur={() => setTouched(true)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit();
            }}
            maxLength={16}
            placeholder={t('table.inv.create.pseudoPlaceholder', 'Ton pseudo')}
            className={`h-[72px] w-full rounded-2xl border-2 bg-black/40 px-5 text-2xl text-table-ink outline-none placeholder:text-table-ink-muted ${
              showPseudoError ? 'border-red-500/80' : 'border-white/15 focus:border-table-cyan/70'
            }`}
          />
          {/* hauteur réservée : la ligne d'erreur n'agrandit pas la modale */}
          <div className="mt-2 h-7 px-1 text-[20px] font-semibold leading-7 text-red-400">
            {showPseudoError ? t('table.inv.create.pseudoInvalid', 'Entre 2 et 16 caractères') : ''}
          </div>
        </Section>

        <Section title={t('table.inv.create.maxPlayers', 'Joueurs max')}>
          <Segment options={CAP_CHOICES} value={maxPlayers} onChange={setMaxPlayers} />
        </Section>

        {error && (
          <div className="rounded-2xl border border-red-500/40 bg-red-500/10 px-5 py-3 text-center text-[20px] font-semibold text-red-300">
            {error}
          </div>
        )}

        <ArcadeButton variant="accent" size="xl" fullWidth className="min-h-[76px] text-[26px]" icon={<Plus className="h-7 w-7" />} disabled={busy} onClick={submit}>
          {t('table.inv.create.submit', 'Créer la partie')}
        </ArcadeButton>
      </div>
    </ArcadeModal>
  );
}
