/**
 * Graphiques "part d'un tout" et intensite de la section Stats : barres
 * classees, barre segmentee, carte de chaleur. Remplacent les camemberts de
 * l'ancien rapport : des barres sur une meme base se comparent bien plus
 * finement que des parts de disque.
 */

import { useState, type ReactNode } from 'react';
import { fmtPct } from './format';
import { ACCENT, SEQUENTIAL } from './theme';

// ---------------------------------------------------------------------------
// Barres classees
// ---------------------------------------------------------------------------

export interface RankedItem {
  key: string;
  label: string;
  value: number;
  /** Pastille de couleur quand l'entite en a une ailleurs sur la page. */
  color?: string;
  /** Precision sous le libelle. */
  sub?: string;
  /** Contenu a droite de la valeur (evolution). */
  trailing?: ReactNode;
  active?: boolean;
}

export function RankedBars({
  items,
  format,
  onSelect,
  limit = 8,
  showShare = true,
  barColor = ACCENT,
  emptyLabel = 'Aucune donnée sur la période',
}: {
  items: RankedItem[];
  format: (value: number) => string;
  onSelect?: (key: string) => void;
  /** Nombre de lignes avant "Tout afficher". */
  limit?: number;
  showShare?: boolean;
  /** Une seule serie : une seule couleur pour toutes les barres. */
  barColor?: string;
  emptyLabel?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  if (items.length === 0) return <p className="text-sm text-gray-400 py-6 text-center">{emptyLabel}</p>;

  const total = items.reduce((sum, item) => sum + Math.abs(item.value), 0);
  const max = Math.max(...items.map((item) => Math.abs(item.value)), 1e-9);
  const visible = expanded ? items : items.slice(0, limit);

  return (
    <div>
      <ul className="space-y-1">
        {visible.map((item) => {
          const share = total > 0 ? Math.abs(item.value) / total : 0;
          const body = (
            <>
              <div className="flex items-baseline gap-2">
                {item.color && <span className="w-2.5 h-2.5 rounded-sm shrink-0 self-center" style={{ backgroundColor: item.color }} aria-hidden="true" />}
                <span className="text-sm text-gray-800 truncate">{item.label}</span>
                <span className="ml-auto text-sm font-semibold text-gray-900 tabular-nums whitespace-nowrap">{format(item.value)}</span>
              </div>
              <div className="mt-1.5 flex items-center gap-3">
                <div className="h-1.5 flex-1 rounded-full bg-gray-100 overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${Math.max(1, (Math.abs(item.value) / max) * 100)}%`, backgroundColor: barColor }}
                  />
                </div>
                {showShare && <span className="w-11 text-right text-xs text-gray-500 tabular-nums">{fmtPct(share, share < 0.1 ? 1 : 0)}</span>}
                {item.trailing && <span className="w-[68px] text-right whitespace-nowrap leading-none">{item.trailing}</span>}
              </div>
              {item.sub && <p className="text-xs text-gray-500 mt-1">{item.sub}</p>}
            </>
          );
          return (
            <li key={item.key}>
              {onSelect ? (
                <button
                  type="button"
                  onClick={() => onSelect(item.key)}
                  aria-pressed={!!item.active}
                  className={`w-full text-left rounded-lg px-2 py-2 transition ${
                    item.active ? 'bg-primary-500/10 ring-1 ring-primary-500/30' : 'hover:bg-gray-50'
                  }`}
                >
                  {body}
                </button>
              ) : (
                <div className="px-2 py-2">{body}</div>
              )}
            </li>
          );
        })}
      </ul>
      {items.length > limit && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-2 ml-2 text-sm text-primary-600 hover:underline"
        >
          {expanded ? 'Réduire' : `Tout afficher (${items.length})`}
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Barre segmentee : un tout, au plus six parts
// ---------------------------------------------------------------------------

export interface Segment {
  key: string;
  label: string;
  value: number;
  color: string;
}

export function SegmentedBar({ segments, format }: { segments: Segment[]; format: (value: number) => string }) {
  const parts = segments.filter((s) => s.value > 0);
  const total = parts.reduce((sum, s) => sum + s.value, 0);
  if (total <= 0) return <p className="text-sm text-gray-400 py-6 text-center">Aucune donnée sur la période</p>;

  return (
    <div>
      <div className="flex gap-0.5 h-7" role="img" aria-label={parts.map((s) => `${s.label} ${fmtPct(s.value / total, 0)}`).join(', ')}>
        {parts.map((s) => {
          const share = s.value / total;
          return (
            <div
              key={s.key}
              className="rounded flex items-center px-2 min-w-[4px]"
              style={{ flexGrow: s.value, flexBasis: 0, backgroundColor: s.color }}
              title={`${s.label} : ${format(s.value)} (${fmtPct(share)})`}
            >
              {/* la part n'est imprimee que si elle tient dans son bloc */}
              {share >= 0.09 && <span className="text-xs font-semibold text-white">{fmtPct(share, 0)}</span>}
            </div>
          );
        })}
      </div>
      <ul className="mt-3 space-y-1.5">
        {parts.map((s) => (
          <li key={s.key} className="flex items-center gap-2 text-sm">
            <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: s.color }} aria-hidden="true" />
            <span className="text-gray-700 truncate">{s.label}</span>
            <span className="ml-auto font-semibold text-gray-900 tabular-nums">{format(s.value)}</span>
            <span className="w-12 text-right text-xs text-gray-500 tabular-nums">{fmtPct(s.value / total)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Carte de chaleur : lignes x colonnes, une teinte, clair -> fonce
// ---------------------------------------------------------------------------

export interface HeatCell {
  row: number;
  col: number;
  value: number;
  /** Texte d'infobulle complet. */
  detail: string;
}

export function Heatmap({
  rowLabels,
  colLabels,
  cells,
  ariaLabel,
  cellHeight = 28,
}: {
  rowLabels: string[];
  colLabels: string[];
  cells: HeatCell[];
  ariaLabel: string;
  cellHeight?: number;
}) {
  const [active, setActive] = useState<HeatCell | null>(null);
  const max = Math.max(...cells.map((c) => c.value), 0);
  const byPos = new Map(cells.map((c) => [`${c.row}:${c.col}`, c]));

  const colorOf = (value: number): string | null => {
    if (value <= 0 || max <= 0) return null;
    const index = Math.min(SEQUENTIAL.length - 1, Math.floor((value / max) * SEQUENTIAL.length));
    return SEQUENTIAL[index];
  };

  return (
    <div>
      <div
        className="grid gap-0.5"
        style={{ gridTemplateColumns: `36px repeat(${colLabels.length}, minmax(0, 1fr))` }}
        role="img"
        aria-label={ariaLabel}
        onPointerLeave={() => setActive(null)}
      >
        <span />
        {colLabels.map((label) => (
          <span key={label} className="text-[11px] text-gray-400 text-center pb-1">
            {label}
          </span>
        ))}
        {rowLabels.map((rowLabel, row) => (
          <RowCells
            key={rowLabel}
            rowLabel={rowLabel}
            row={row}
            cols={colLabels.length}
            byPos={byPos}
            colorOf={colorOf}
            active={active}
            onActive={setActive}
            cellHeight={cellHeight}
          />
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 mt-3 min-h-[20px]">
        <p className="text-xs text-gray-600" aria-live="polite">
          {active ? active.detail : 'Survolez une case pour le détail.'}
        </p>
        <div className="flex items-center gap-1.5 text-[11px] text-gray-400" aria-hidden="true">
          Moins
          {SEQUENTIAL.map((color) => (
            <span key={color} className="w-3.5 h-3.5 rounded-sm" style={{ backgroundColor: color }} />
          ))}
          Plus
        </div>
      </div>
    </div>
  );
}

function RowCells({
  rowLabel,
  row,
  cols,
  byPos,
  colorOf,
  active,
  onActive,
  cellHeight,
}: {
  rowLabel: string;
  row: number;
  cols: number;
  byPos: Map<string, HeatCell>;
  colorOf: (value: number) => string | null;
  active: HeatCell | null;
  onActive: (cell: HeatCell | null) => void;
  cellHeight: number;
}) {
  return (
    <>
      <span className="text-xs text-gray-500 self-center">{rowLabel}</span>
      {Array.from({ length: cols }, (_, col) => {
        const cell = byPos.get(`${row}:${col}`);
        const color = cell ? colorOf(cell.value) : null;
        const isActive = !!cell && active === cell;
        return (
          <span
            key={col}
            className={`rounded-[4px] ${isActive ? 'ring-2 ring-gray-900 ring-offset-1' : ''}`}
            style={{ backgroundColor: color ?? '#f9fafb', height: cellHeight }}
            onPointerEnter={() => onActive(cell ?? null)}
          />
        );
      })}
    </>
  );
}
