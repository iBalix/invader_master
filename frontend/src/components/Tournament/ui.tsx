/**
 * Primitives de la console du gestionnaire d'événements, à l'identité arcade
 * des tournois (cf. game/tournament/arcade). Pensée pour le téléphone ou
 * l'iPad de l'animateur en plein service : cibles de 48 px minimum, une main,
 * le contenu en Inter pour la lecture rapide, la police pixel pour les
 * étiquettes seulement.
 */

import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import '../../game/tournament/arcade/arcade.css';

/** console étroite (mesurée sur SA largeur, pas sur la fenêtre : cf. labo) */
export const NarrowContext = createContext(false);

export function useMeasuredNarrow(threshold = 900): [React.RefObject<HTMLDivElement>, boolean] {
  const ref = useRef<HTMLDivElement>(null);
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.innerWidth < threshold);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setNarrow(e.contentRect.width < threshold));
    ro.observe(el);
    return () => ro.disconnect();
  }, [threshold]);
  return [ref, narrow];
}

type Variant = 'primary' | 'secondary' | 'warn' | 'danger' | 'success';

/** boutons de borne (cf. arcade.css) : aplat néon pour agir, contour pour le reste */
const VARIANTS: Record<Variant, string> = {
  primary: 'ia-btn--pink',
  secondary: 'ia-btn--ghost',
  warn: 'ia-btn--ghost-gold',
  danger: 'ia-btn--ghost-red',
  success: 'ia-btn--mint',
};

export function Btn({
  onClick,
  disabled,
  variant = 'secondary',
  children,
  full,
  big,
  title,
}: {
  onClick: () => void;
  disabled?: boolean;
  variant?: Variant;
  children: React.ReactNode;
  full?: boolean;
  big?: boolean;
  title?: string;
}) {
  const narrow = useContext(NarrowContext);
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`ia-btn ${VARIANTS[variant]} ${big ? 'min-h-[60px] text-base' : 'min-h-[48px] text-sm'} ${full || narrow ? 'w-full' : ''}`}
    >
      {children}
    </button>
  );
}

const CARD_TONES = {
  plain: 'ia-px--plain',
  amber: 'ia-px--amber',
  indigo: 'ia-px--violet',
  cyan: 'ia-px--cyan',
  gold: 'ia-px--gold',
  red: 'ia-px--red',
  mint: 'ia-px--mint',
} as const;

/** panneau à coins de pixels ; le titre est une étiquette de borne */
export function Card({
  title,
  right,
  children,
  tone,
}: {
  title?: React.ReactNode;
  right?: React.ReactNode;
  children: React.ReactNode;
  tone?: keyof typeof CARD_TONES;
}) {
  return (
    <div className={`ia-px ${CARD_TONES[tone ?? 'plain']} p-4`}>
      {(title || right) && (
        <div className="mb-3 flex items-center justify-between gap-3">
          {title && <h2 className="ia-pixel text-[13px] text-white">{title}</h2>}
          {right}
        </div>
      )}
      {children}
    </div>
  );
}

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  disabled,
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  return (
    <div className={`ia-px ia-px--deep flex flex-wrap gap-1 p-1.5 ${disabled ? 'opacity-40' : ''}`}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          disabled={disabled}
          onClick={() => onChange(o.value)}
          className={`ia-clip ia-clip--sm min-h-[44px] flex-1 px-3 text-sm font-bold transition ${
            value === o.value ? 'bg-ia-cyan text-ia-night' : 'text-ia-soft hover:bg-white/5'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="ia-pixel mb-1.5 block text-[11px] text-ia-muted">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-ia-muted">{hint}</span>}
    </label>
  );
}

export const inputClass = 'ia-input ia-clip';

export function NumberInput({
  value,
  onChange,
  min,
  max,
  step = 1,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  return (
    <input
      type="number"
      inputMode="decimal"
      className={`${inputClass} font-bold tabular-nums`}
      value={text}
      min={min}
      max={max}
      step={step}
      onChange={(e) => {
        setText(e.target.value);
        const n = Number(e.target.value.replace(',', '.'));
        if (e.target.value !== '' && Number.isFinite(n)) onChange(n);
      }}
      onBlur={() => setText(String(value))}
    />
  );
}

/** interrupteur : carré qui glisse dans une piste en pixels */
export function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="ia-px ia-px--deep flex min-h-[56px] w-full items-center justify-between gap-3 px-3 py-2 text-left"
    >
      <span>
        <span className="block text-sm font-bold text-ia-ink">{label}</span>
        {hint && <span className="block text-xs text-ia-muted">{hint}</span>}
      </span>
      <span className={`ia-clip ia-clip--sm relative h-8 w-14 shrink-0 transition ${checked ? 'bg-ia-mint' : 'bg-ia-line'}`}>
        <span className={`ia-clip ia-clip--sm absolute top-1 h-6 w-6 bg-ia-night transition-all ${checked ? 'left-7' : 'left-1'}`} />
      </span>
    </button>
  );
}

/** feuille d'actions (bas d'écran au téléphone), rendue dans un portail */
export function Sheet({ title, onClose, children }: { title: React.ReactNode; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return createPortal(
    <div className="fixed inset-0 z-[150] flex items-end justify-center bg-black/75 sm:items-center" onClick={onClose}>
      <div
        className="ia-px ia-px--violet max-h-[90dvh] w-full max-w-lg overflow-y-auto p-5 text-ia-ink"
        style={{ '--bg': '#140b2c' } as React.CSSProperties}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <h3 className="ia-display text-3xl text-white">{title}</h3>
          <button type="button" onClick={onClose} className="ia-btn ia-btn--ghost min-h-[44px] px-3 text-xs">
            Fermer
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

const BADGE_TONES = {
  slate: 'bg-white/10 text-ia-soft',
  indigo: 'bg-ia-violet/25 text-[#c7a8ff]',
  emerald: 'bg-ia-mint/20 text-ia-mint',
  amber: 'bg-ia-gold/15 text-ia-gold',
  rose: 'bg-ia-red/20 text-[#ff8ea3]',
  cyan: 'bg-ia-cyan/15 text-ia-cyan',
  violet: 'bg-ia-violet/25 text-[#c7a8ff]',
} as const;

/** puce d'état en police pixel */
export function Badge({ tone = 'slate', children }: { tone?: keyof typeof BADGE_TONES; children: React.ReactNode }) {
  return (
    <span className={`ia-pixel ia-clip ia-clip--sm inline-flex items-center gap-1 whitespace-nowrap px-2 py-1 text-[10px] leading-none ${BADGE_TONES[tone]}`}>
      {children}
    </span>
  );
}
