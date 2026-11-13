/**
 * Briques d'interface de la section Stats : cartes, tuiles de chiffres cles,
 * controles de filtre. Meme langage que le reste du back-office (cartes
 * blanches, bordure gray-200, accent indigo).
 */

import { useState, type ReactNode } from 'react';
import { ArrowDownRight, ArrowUpRight, BarChart3, ChevronDown, Minus, Table2 } from 'lucide-react';
import { deltaRatio, fmtDelta } from './format';
import { ACCENT, ACCENT_SOFT } from './theme';

// ---------------------------------------------------------------------------
// Carte de graphique, avec bascule vers la vue tableau
// ---------------------------------------------------------------------------

export interface TableView {
  columns: string[];
  rows: string[][];
}

export function ChartCard({
  title,
  subtitle,
  actions,
  table,
  children,
  className = '',
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  /** Jumeau tableau du graphique : memes valeurs, lisibles sans survol. */
  table?: TableView;
  children: ReactNode;
  className?: string;
}) {
  const [showTable, setShowTable] = useState(false);

  return (
    <section className={`bg-white rounded-xl border border-gray-200 p-5 min-w-0 ${className}`}>
      <header className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          {subtitle && <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {actions}
          {table && (
            <button
              type="button"
              onClick={() => setShowTable((v) => !v)}
              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition"
              title={showTable ? 'Voir le graphique' : 'Voir les valeurs en tableau'}
              aria-label={showTable ? 'Voir le graphique' : 'Voir les valeurs en tableau'}
              aria-pressed={showTable}
            >
              {showTable ? <BarChart3 className="w-4 h-4" /> : <Table2 className="w-4 h-4" />}
            </button>
          )}
        </div>
      </header>

      {showTable && table ? (
        <div className="max-h-80 overflow-auto rounded-lg border border-gray-100">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-gray-50">
              <tr className="text-left text-xs uppercase tracking-wider text-gray-500">
                {table.columns.map((column, i) => (
                  <th key={column} className={`px-3 py-2 font-medium ${i > 0 ? 'text-right' : ''}`}>
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {table.rows.map((row, r) => (
                <tr key={r}>
                  {row.map((cell, c) => (
                    <td key={c} className={`px-3 py-1.5 ${c > 0 ? 'text-right tabular-nums text-gray-900' : 'text-gray-600'}`}>
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        children
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Evolution : fleche + signe + couleur (jamais la couleur seule)
// ---------------------------------------------------------------------------

export function DeltaBadge({
  current,
  previous,
  /** true quand une hausse est une mauvaise nouvelle (depenses, remises). */
  upIsBad = false,
  /** Ecart en points plutot qu'en pourcentage (pour une marge, un taux). */
  points = false,
}: {
  current: number;
  previous: number;
  upIsBad?: boolean;
  points?: boolean;
}) {
  if (points) {
    const diff = (current - previous) * 100;
    if (!Number.isFinite(diff)) return null;
    const flat = Math.abs(diff) < 0.05;
    const good = flat ? null : diff > 0 !== upIsBad;
    const Icon = flat ? Minus : diff > 0 ? ArrowUpRight : ArrowDownRight;
    return (
      <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${good === null ? 'text-gray-500' : good ? 'text-emerald-700' : 'text-red-600'}`}>
        <Icon className="w-3.5 h-3.5" aria-hidden="true" />
        {diff > 0 ? '+' : diff < 0 ? '-' : ''}
        {Math.abs(diff).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} pt
      </span>
    );
  }

  const ratio = deltaRatio(current, previous);
  if (ratio === null) return <span className="text-xs text-gray-400">sans comparaison</span>;
  const flat = Math.abs(ratio) < 0.0005;
  const good = flat ? null : ratio > 0 !== upIsBad;
  const Icon = flat ? Minus : ratio > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${good === null ? 'text-gray-500' : good ? 'text-emerald-700' : 'text-red-600'}`}>
      <Icon className="w-3.5 h-3.5" aria-hidden="true" />
      {fmtDelta(ratio)}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Tuile de chiffre cle
// ---------------------------------------------------------------------------

export function Sparkline({ values, height = 36 }: { values: number[]; height?: number }) {
  if (values.length < 2) return <div style={{ height }} />;
  const max = Math.max(...values, 0);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const w = 100;
  const points = values.map((v, i) => [(i / (values.length - 1)) * w, 2 + (1 - (v - min) / span) * (height - 4)] as const);
  const line = `M${points.map((p) => `${p[0].toFixed(2)},${p[1].toFixed(2)}`).join('L')}`;
  const last = points[points.length - 1];
  return (
    <div className="relative" style={{ height }} aria-hidden="true">
      <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" className="absolute inset-0 w-full h-full">
        <path d={`${line}L${w},${height}L0,${height}Z`} fill={ACCENT} opacity="0.08" />
        <path d={line} fill="none" stroke={ACCENT_SOFT} strokeWidth="1.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      </svg>
      {/* point final hors du SVG etire : il resterait ovale sinon */}
      <span
        className="absolute w-2 h-2 rounded-full ring-2 ring-white"
        style={{ backgroundColor: ACCENT, right: -2, top: last[1] - 4 }}
      />
    </div>
  );
}

export function StatTile({
  label,
  value,
  hint,
  delta,
  compareLabel,
  trend,
  tone,
}: {
  label: string;
  value: string;
  /** Precision sous la valeur (ex. "298 jours ouverts"). */
  hint?: ReactNode;
  delta?: ReactNode;
  compareLabel?: string;
  trend?: number[];
  /** Colore la valeur quand son signe est l'information (variation de tresorerie). */
  tone?: 'good' | 'bad';
}) {
  const valueColor = tone === 'good' ? 'text-emerald-700' : tone === 'bad' ? 'text-red-600' : 'text-gray-900';
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-col min-w-0">
      <p className="text-sm text-gray-500 truncate">{label}</p>
      <p className={`text-2xl font-semibold mt-1 whitespace-nowrap ${valueColor}`}>{value}</p>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1 min-h-[20px]">
        {delta}
        {delta && compareLabel && <span className="text-xs text-gray-400">{compareLabel}</span>}
      </div>
      {hint && <p className="text-xs text-gray-500 mt-1">{hint}</p>}
      {trend && trend.length > 1 && (
        <div className="mt-auto pt-3">
          <Sparkline values={trend} />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Controles
// ---------------------------------------------------------------------------

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
  ariaLabel: string;
}) {
  return (
    <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-0.5" role="group" aria-label={ariaLabel}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          aria-pressed={option.value === value}
          className={`px-3 py-1.5 text-sm rounded-md transition ${
            option.value === value ? 'bg-white text-gray-900 font-medium shadow-sm' : 'text-gray-500 hover:text-gray-800'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function FilterSelect({
  label,
  value,
  onChange,
  children,
  disabled,
  active = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
  disabled?: boolean;
  /** Met en avant un filtre qui restreint reellement les donnees. */
  active?: boolean;
}) {
  return (
    <label className="relative inline-flex items-center">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        className={`appearance-none rounded-lg border bg-white pl-3 pr-9 py-2 text-sm transition focus:outline-none focus:ring-2 focus:ring-primary-500/40 disabled:opacity-50 max-w-[230px] truncate ${
          active ? 'border-primary-500 text-gray-900 font-medium' : 'border-gray-300 text-gray-700'
        }`}
      >
        {children}
      </select>
      <ChevronDown className="w-4 h-4 text-gray-400 absolute right-2.5 pointer-events-none" aria-hidden="true" />
    </label>
  );
}

/** Zone de contenu : garde le rendu precedent, estompe, pendant un rechargement. */
export function Refreshing({ active, children }: { active: boolean; children: ReactNode }) {
  return (
    <div className={`transition-opacity duration-200 ${active ? 'opacity-50' : 'opacity-100'}`} aria-busy={active}>
      {children}
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="text-sm text-gray-400 py-8 text-center">{children}</p>;
}
