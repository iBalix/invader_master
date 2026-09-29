/**
 * Primitives de la console du gestionnaire d'événements (fond sombre, pensée
 * pour le téléphone de l'animateur : cibles de 48 px minimum, une main).
 */

import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

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

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-indigo-500 text-white hover:bg-indigo-400',
  secondary: 'border border-white/15 text-slate-200 hover:bg-white/10',
  warn: 'border border-amber-400/40 bg-amber-500/15 text-amber-200 hover:bg-amber-500/25',
  danger: 'border border-rose-400/40 bg-rose-500/15 text-rose-300 hover:bg-rose-500/25',
  success: 'bg-emerald-500 text-white hover:bg-emerald-400',
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
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 font-semibold disabled:opacity-40 ${
        big ? 'min-h-[56px] text-base' : 'min-h-[48px] text-sm'
      } ${full || narrow ? 'w-full' : ''} ${VARIANTS[variant]}`}
    >
      {children}
    </button>
  );
}

export function Card({ title, right, children, tone }: { title?: React.ReactNode; right?: React.ReactNode; children: React.ReactNode; tone?: 'amber' | 'indigo' }) {
  const toneClass =
    tone === 'amber'
      ? 'border-amber-400/30 bg-amber-500/[0.07]'
      : tone === 'indigo'
        ? 'border-indigo-400/30 bg-indigo-500/[0.08]'
        : 'border-white/10 bg-white/5';
  return (
    <div className={`rounded-xl border p-4 ${toneClass}`}>
      {(title || right) && (
        <div className="mb-3 flex items-center justify-between gap-3">
          {title && <h2 className="font-bold text-slate-100">{title}</h2>}
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
    <div className={`flex flex-wrap gap-1 rounded-xl border border-white/10 bg-black/20 p-1 ${disabled ? 'opacity-40' : ''}`}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          disabled={disabled}
          onClick={() => onChange(o.value)}
          className={`min-h-[44px] flex-1 rounded-lg px-3 text-sm font-bold transition ${
            value === o.value ? 'bg-indigo-500 text-white' : 'text-slate-300 hover:bg-white/5'
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
      <span className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-400">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

export const inputClass =
  'min-h-[48px] w-full rounded-lg border border-white/15 bg-slate-900 px-3 text-base text-slate-100 outline-none placeholder:text-slate-600 focus:border-indigo-400';

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
      className={inputClass}
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

export function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex min-h-[48px] w-full items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-left"
    >
      <span>
        <span className="block text-sm font-semibold text-slate-100">{label}</span>
        {hint && <span className="block text-xs text-slate-500">{hint}</span>}
      </span>
      <span className={`relative h-7 w-12 shrink-0 rounded-full transition ${checked ? 'bg-indigo-500' : 'bg-white/15'}`}>
        <span className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-all ${checked ? 'left-6' : 'left-1'}`} />
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
    <div className="fixed inset-0 z-[150] flex items-end justify-center bg-black/70 sm:items-center" onClick={onClose}>
      <div
        className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-white/15 bg-slate-900 p-5 text-slate-100 shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <h3 className="text-lg font-black">{title}</h3>
          <button type="button" onClick={onClose} className="min-h-[40px] rounded-lg px-3 text-sm font-bold text-slate-400 hover:bg-white/10">
            Fermer
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

export function Badge({ tone = 'slate', children }: { tone?: 'slate' | 'indigo' | 'emerald' | 'amber' | 'rose' | 'cyan' | 'violet'; children: React.ReactNode }) {
  const tones = {
    slate: 'bg-white/10 text-slate-300',
    indigo: 'bg-indigo-500/20 text-indigo-300',
    emerald: 'bg-emerald-500/20 text-emerald-300',
    amber: 'bg-amber-500/20 text-amber-300',
    rose: 'bg-rose-500/20 text-rose-300',
    cyan: 'bg-cyan-500/20 text-cyan-300',
    violet: 'bg-violet-500/20 text-violet-300',
  };
  return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${tones[tone]}`}>{children}</span>;
}
