/**
 * Création d'une partie : pseudo, thème (choisi par le créateur pour toute
 * la session), nombre de joueurs max. Tout tient SANS SCROLL sur une dalle
 * 1080p : chaque groupe de choix vit dans son propre cadre, cibles 72 px.
 *
 * Modale 2xl : les cinq tuiles de thème font 176 x 99, elles ne tiendraient
 * pas sur une ligne dans une modale xl (896 px).
 */

import { useEffect, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import ArcadeButton from '../../../components/ui/ArcadeButton';
import ArcadeModal from '../../../components/ui/ArcadeModal';
import { useT } from '../../../i18n/useT';
import FlapThemePreview from './FlapThemePreview';
import { getLastPseudo, isValidPseudo } from '../lib/identity';
import {
  FLAP_DEFAULT_THEME,
  FLAP_MAX_PLAYERS,
  FLAP_PLAYER_CAP_CHOICES,
  FLAP_THEME_IDS,
  type CreateFlapInput,
  type FlapThemeId,
} from '../lib/flapTypes';

interface Props {
  open: boolean;
  onClose: () => void;
  onSubmit: (input: CreateFlapInput) => void;
  busy?: boolean;
  error?: string | null;
}

const CAP_CHOICES: readonly number[] = FLAP_PLAYER_CAP_CHOICES;

/** section encadrée de la modale : titre discret, contenu en dessous */
function Section({ title, children, className = '' }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-white/10 bg-white/[0.04] p-4 ${className}`}>
      <div className="mb-2.5 font-display text-[20px] uppercase tracking-[0.2em] text-table-cyan/80">{title}</div>
      {children}
    </div>
  );
}

/** groupe de choix encadré : les options vivent dans un cadre, cibles 72 px */
function Segment<T extends string | number>({
  options,
  value,
  onChange,
  render,
}: {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  render?: (v: T) => string;
}) {
  return (
    <div className="inline-flex gap-1.5 rounded-2xl border border-white/10 bg-black/35 p-1.5">
      {options.map((option) => (
        <button
          key={String(option)}
          type="button"
          className={`h-[72px] min-w-[112px] rounded-xl px-6 font-display text-2xl tracking-wide transition-colors ${
            option === value ? 'bg-table-cyan text-black' : 'text-white/70'
          }`}
          onClick={() => onChange(option)}
        >
          {render ? render(option) : String(option)}
        </button>
      ))}
    </div>
  );
}

export default function CreateFlapModal({ open, onClose, onSubmit, busy = false, error = null }: Props) {
  const t = useT();
  const [pseudo, setPseudo] = useState<string>(() => getLastPseudo());
  const [touched, setTouched] = useState(false);
  const [theme, setTheme] = useState<FlapThemeId>(FLAP_DEFAULT_THEME);
  const [maxPlayers, setMaxPlayers] = useState<number>(FLAP_MAX_PLAYERS);
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
    onSubmit({ pseudo: pseudo.trim(), theme, maxPlayers });
  }

  return (
    <ArcadeModal open={open} onClose={onClose} title={t('table.flap.create.title')} size="2xl" dense>
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-4">
          {/* pseudo */}
          <Section title={t('table.flap.create.pseudo')}>
            <input
              ref={pseudoRef}
              value={pseudo}
              onChange={(e) => setPseudo(e.target.value)}
              onBlur={() => setTouched(true)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submit();
              }}
              maxLength={16}
              placeholder={t('table.flap.create.pseudoPlaceholder')}
              className={`h-[72px] w-full rounded-2xl border-2 bg-black/40 px-5 text-2xl text-table-ink outline-none placeholder:text-table-ink-muted ${
                showPseudoError ? 'border-red-500/80' : 'border-white/15 focus:border-table-cyan/70'
              }`}
            />
            {/* hauteur réservée : la ligne d'erreur n'agrandit pas la modale */}
            <div className="mt-2 h-7 px-1 text-[20px] font-semibold leading-7 text-red-400">
              {showPseudoError ? t('table.flap.create.pseudoInvalid') : ''}
            </div>
          </Section>

          {/* joueurs max */}
          <Section title={t('table.flap.create.maxPlayers')}>
            <Segment options={CAP_CHOICES} value={maxPlayers} onChange={setMaxPlayers} />
          </Section>
        </div>

        {/* thème : cinq tuiles sur une ligne, libellé sous chacune */}
        <Section title={t('table.flap.create.theme')}>
          <div className="flex items-start justify-between gap-3">
            {FLAP_THEME_IDS.map((id) => {
              const selected = id === theme;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTheme(id)}
                  className={`flex flex-col items-center gap-2 rounded-2xl border-2 p-2 transition-colors ${
                    selected ? 'border-table-cyan bg-table-cyan/10' : 'border-transparent'
                  }`}
                >
                  <FlapThemePreview themeId={id} width={176} height={99} selected={selected} />
                  <span className={`text-[20px] font-bold uppercase leading-none ${selected ? 'text-table-cyan' : 'text-white/60'}`}>
                    {t(`table.flap.theme.${id}`)}
                  </span>
                </button>
              );
            })}
          </div>
        </Section>

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
          icon={<Plus className="h-7 w-7" />}
          disabled={busy}
          onClick={submit}
        >
          {t('table.flap.create.submit')}
        </ArcadeButton>
      </div>
    </ArcadeModal>
  );
}
