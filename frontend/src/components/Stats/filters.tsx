/**
 * Filtres de la section Stats : periode (preselections + plage libre), mode de
 * comparaison, base HT / TTC. L'etat est partage entre les pages et conserve
 * le temps de la session du navigateur, pour qu'un changement d'onglet ne
 * remette pas la periode a zero.
 */

import { useEffect, useRef, useState } from 'react';
import { CalendarDays, Check, ChevronDown } from 'lucide-react';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { CompareMode } from '../../lib/statsApi';
import { addDays, fmtDayYear, todayISO } from './format';

export type PresetKey = '7d' | '30d' | '90d' | 'month' | 'lastMonth' | 'ytd' | 'lastYear' | '12m' | 'all' | 'custom';

export interface RangeState {
  preset: PresetKey;
  /** Utilises uniquement quand preset = custom. */
  from: string;
  to: string;
}

export type Basis = 'ht' | 'ttc';
export type FilterScope = 'sales' | 'treasury';

interface StatsFiltersState {
  sales: RangeState;
  treasury: RangeState;
  compare: CompareMode;
  basis: Basis;
  setRange: (scope: FilterScope, range: RangeState) => void;
  setCompare: (compare: CompareMode) => void;
  setBasis: (basis: Basis) => void;
}

export const useStatsFilters = create<StatsFiltersState>()(
  persist(
    (set) => ({
      // memes periodes par defaut que l'ancien rapport : l'annee en cours pour
      // les ventes, tout l'historique pour la tresorerie
      sales: { preset: 'ytd', from: '', to: '' },
      treasury: { preset: 'all', from: '', to: '' },
      compare: 'previous',
      basis: 'ht',
      setRange: (scope, range) => set(scope === 'sales' ? { sales: range } : { treasury: range }),
      setCompare: (compare) => set({ compare }),
      setBasis: (basis) => set({ basis }),
    }),
    { name: 'invader-stats-filters', storage: createJSONStorage(() => sessionStorage) },
  ),
);

export const PRESETS: Array<{ key: Exclude<PresetKey, 'custom'>; label: string }> = [
  { key: '7d', label: '7 derniers jours' },
  { key: '30d', label: '30 derniers jours' },
  { key: '90d', label: '90 derniers jours' },
  { key: 'month', label: 'Ce mois-ci' },
  { key: 'lastMonth', label: 'Mois dernier' },
  { key: 'ytd', label: 'Cette année' },
  { key: '12m', label: '12 derniers mois' },
  { key: 'lastYear', label: 'Année dernière' },
  { key: 'all', label: "Depuis l'ouverture" },
];

/** Ouverture du bar, utilisee tant que /meta n'a pas repondu. */
export const OPENING_FALLBACK = '2024-02-23';

/** Traduit l'etat du filtre en dates fermes. */
export function resolveRange(range: RangeState, opening: string): { from: string; to: string } {
  const today = todayISO();
  const [year, month] = today.split('-').map(Number);
  switch (range.preset) {
    case '7d':
      return { from: addDays(today, -6), to: today };
    case '30d':
      return { from: addDays(today, -29), to: today };
    case '90d':
      return { from: addDays(today, -89), to: today };
    case 'month':
      return { from: `${today.slice(0, 7)}-01`, to: today };
    case 'lastMonth': {
      const firstOfThisMonth = `${today.slice(0, 7)}-01`;
      const lastOfPrev = addDays(firstOfThisMonth, -1);
      return { from: `${lastOfPrev.slice(0, 7)}-01`, to: lastOfPrev };
    }
    case 'ytd':
      return { from: `${year}-01-01`, to: today };
    case '12m':
      return { from: addDays(`${year - 1}-${String(month).padStart(2, '0')}-${today.slice(8)}`, 1), to: today };
    case 'lastYear':
      return { from: `${year - 1}-01-01`, to: `${year - 1}-12-31` };
    case 'all':
      return { from: opening, to: today };
    case 'custom':
    default:
      if (range.from && range.to && range.from <= range.to) return { from: range.from, to: range.to };
      return { from: `${year}-01-01`, to: today };
  }
}

export function presetLabel(preset: PresetKey): string {
  return PRESETS.find((p) => p.key === preset)?.label ?? 'Personnalisée';
}

export function DateRangeControl({
  range,
  resolved,
  onChange,
}: {
  range: RangeState;
  resolved: { from: string; to: string };
  onChange: (range: RangeState) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draftFrom, setDraftFrom] = useState(resolved.from);
  const [draftTo, setDraftTo] = useState(resolved.to);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    setDraftFrom(resolved.from);
    setDraftTo(resolved.to);
    const onDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
    // on ne resynchronise le brouillon qu'a l'ouverture
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const draftValid = !!draftFrom && !!draftTo && draftFrom <= draftTo;

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 hover:border-gray-400 transition focus:outline-none focus:ring-2 focus:ring-primary-500/40"
      >
        <CalendarDays className="w-4 h-4 text-gray-400" aria-hidden="true" />
        <span className="font-medium">{presetLabel(range.preset)}</span>
        <span className="text-gray-500 hidden sm:inline">
          {fmtDayYear(resolved.from)} au {fmtDayYear(resolved.to)}
        </span>
        <ChevronDown className="w-4 h-4 text-gray-400" aria-hidden="true" />
      </button>

      {open && (
        <div role="dialog" aria-label="Choisir la période" className="absolute left-0 z-30 mt-2 w-72 rounded-xl border border-gray-200 bg-white shadow-lg">
          <ul className="p-1">
            {PRESETS.map((preset) => {
              const selected = range.preset === preset.key;
              return (
                <li key={preset.key}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange({ preset: preset.key, from: '', to: '' });
                      setOpen(false);
                    }}
                    className={`w-full flex items-center justify-between rounded-lg px-3 py-2 text-sm text-left transition hover:bg-gray-50 ${
                      selected ? 'text-gray-900 font-medium' : 'text-gray-700'
                    }`}
                  >
                    {preset.label}
                    {selected && <Check className="w-4 h-4 text-primary-600" strokeWidth={3} aria-hidden="true" />}
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="border-t border-gray-100 p-3">
            <p className="text-xs font-medium text-gray-500 mb-2 flex items-center justify-between">
              Période personnalisée
              {range.preset === 'custom' && <Check className="w-4 h-4 text-primary-600" strokeWidth={3} aria-hidden="true" />}
            </p>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={draftFrom}
                max={draftTo || undefined}
                onChange={(event) => setDraftFrom(event.target.value)}
                aria-label="Date de début"
                className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/40"
              />
              <input
                type="date"
                value={draftTo}
                min={draftFrom || undefined}
                onChange={(event) => setDraftTo(event.target.value)}
                aria-label="Date de fin"
                className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/40"
              />
            </div>
            <button
              type="button"
              disabled={!draftValid}
              onClick={() => {
                onChange({ preset: 'custom', from: draftFrom, to: draftTo });
                setOpen(false);
              }}
              className="mt-2 w-full rounded-lg bg-primary-600 px-3 py-2 text-sm font-medium text-white hover:bg-primary-500 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Appliquer
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export const COMPARE_LABEL: Record<CompareMode, string> = {
  previous: 'vs période précédente',
  year: 'vs même période N-1',
};
