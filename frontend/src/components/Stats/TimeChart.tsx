/**
 * Graphique sur un axe ordonne (jours, semaines, mois, heures...) : barres
 * simples, empilees ou cote a cote, lignes et aires, sur une seule echelle.
 *
 * Regles appliquees (guide dataviz) : barres fines a bout arrondi partant d'une
 * base commune, 2 px de fond entre segments empiles, grille pleine et discrete,
 * un seul axe Y, legende des que deux series, infobulle listant toutes les
 * series du point survole, navigable aux fleches du clavier.
 */

import { useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type RefObject } from 'react';
import { INK } from './theme';

export interface ChartSeries {
  key: string;
  label: string;
  color: string;
  values: Array<number | null>;
  kind: 'bar' | 'line' | 'area';
  /** Les barres partageant le meme identifiant sont empilees. */
  stack?: string;
  dashed?: boolean;
}

export interface RefLine {
  value: number;
  label: string;
}

interface TimeChartProps {
  /** Libelles d'axe, courts. */
  labels: string[];
  /** Libelles d'infobulle, complets (par defaut : `labels`). */
  longLabels?: string[];
  series: ChartSeries[];
  height?: number;
  /** Format des valeurs dans l'infobulle. */
  format: (value: number) => string;
  /** Format des graduations (par defaut : `format`). */
  axisFormat?: (value: number) => string;
  /** Seuils horizontaux (points morts, objectif). */
  refLines?: RefLine[];
  /** Ajoute une ligne de total des barres dans l'infobulle. */
  totalLabel?: string;
  /** Barres d'une serie unique colorees selon le signe (statut bon / mauvais). */
  signColors?: { positive: string; negative: string };
  /** Affiche la valeur du plus haut point au-dessus de lui. */
  annotateMax?: boolean;
  legend?: boolean;
  /** Nombre de graduations visees (2 pour une vignette). */
  tickCount?: number;
  ariaLabel: string;
}

export function useElementWidth<T extends HTMLElement>(): [RefObject<T>, number] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    setWidth(el.clientWidth);
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) setWidth(Math.round(entry.contentRect.width));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

/** Graduations rondes couvrant [min, max]. */
function niceScale(min: number, max: number, count = 5): { lo: number; hi: number; ticks: number[] } {
  let lo = min;
  let hi = max;
  if (hi - lo < 1e-9) hi = lo + 1;
  const raw = (hi - lo) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
  lo = Math.floor(lo / step + 1e-9) * step;
  hi = Math.ceil(hi / step - 1e-9) * step;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
  return { lo, hi, ticks };
}

/** Rectangle dont seul le bout "donnee" est arrondi. */
function barPath(x: number, top: number, w: number, h: number, roundTop: boolean, roundBottom: boolean): string {
  const r = Math.min(4, w / 2, h);
  const rt = roundTop ? r : 0;
  const rb = roundBottom ? r : 0;
  const right = x + w;
  const bottom = top + h;
  return [
    `M${x},${bottom - rb}`,
    `V${top + rt}`,
    rt ? `Q${x},${top} ${x + rt},${top}` : '',
    `H${right - rt}`,
    rt ? `Q${right},${top} ${right},${top + rt}` : '',
    `V${bottom - rb}`,
    rb ? `Q${right},${bottom} ${right - rb},${bottom}` : '',
    `H${x + rb}`,
    rb ? `Q${x},${bottom} ${x},${bottom - rb}` : '',
    'Z',
  ].join('');
}

const MARGIN_TOP = 16;
const MARGIN_BOTTOM = 26;
const MAX_BAR = 24;
const SEGMENT_GAP = 2;

export default function TimeChart({
  labels,
  longLabels,
  series,
  height = 280,
  format,
  axisFormat,
  refLines = [],
  totalLabel,
  signColors,
  annotateMax = false,
  legend,
  tickCount = 5,
  ariaLabel,
}: TimeChartProps) {
  const [containerRef, width] = useElementWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const n = labels.length;
  const tickFormat = axisFormat ?? format;

  const barSeries = useMemo(() => series.filter((s) => s.kind === 'bar'), [series]);
  const lineSeries = useMemo(() => series.filter((s) => s.kind !== 'bar'), [series]);

  // Groupes de barres : une pile par identifiant, une barre seule sinon.
  const groups = useMemo(() => {
    const ids: string[] = [];
    for (const s of barSeries) {
      const id = s.stack ?? `solo:${s.key}`;
      if (!ids.includes(id)) ids.push(id);
    }
    return ids;
  }, [barSeries]);

  // Empilement : pour chaque serie barre et chaque index, bornes [from, to] en valeur.
  const stacked = useMemo(() => {
    const bounds = new Map<string, Array<{ from: number; to: number } | null>>();
    const posTop = new Map<string, number[]>();
    const negTop = new Map<string, number[]>();
    for (const id of groups) {
      posTop.set(id, new Array(n).fill(0));
      negTop.set(id, new Array(n).fill(0));
    }
    for (const s of barSeries) {
      const id = s.stack ?? `solo:${s.key}`;
      const pos = posTop.get(id) as number[];
      const neg = negTop.get(id) as number[];
      bounds.set(
        s.key,
        s.values.map((v, i) => {
          if (v === null || v === 0 || !Number.isFinite(v)) return null;
          if (v > 0) {
            const from = pos[i];
            pos[i] += v;
            return { from, to: pos[i] };
          }
          const from = neg[i];
          neg[i] += v;
          return { from, to: neg[i] };
        }),
      );
    }
    return { bounds, posTop, negTop };
  }, [barSeries, groups, n]);

  const domain = useMemo(() => {
    let min = 0;
    let max = 0;
    for (const id of groups) {
      for (const v of stacked.posTop.get(id) ?? []) if (v > max) max = v;
      for (const v of stacked.negTop.get(id) ?? []) if (v < min) min = v;
    }
    for (const s of lineSeries) {
      for (const v of s.values) {
        if (v === null || !Number.isFinite(v)) continue;
        if (v > max) max = v;
        if (v < min) min = v;
      }
    }
    for (const line of refLines) {
      if (line.value > max) max = line.value;
      if (line.value < min) min = line.value;
    }
    // un peu d'air au-dessus du plus haut point pour son etiquette
    if (annotateMax) max *= 1.06;
    return niceScale(min, max, tickCount);
  }, [groups, stacked, lineSeries, refLines, annotateMax, tickCount]);

  const hasData = useMemo(
    () => series.some((s) => s.values.some((v) => v !== null && v !== 0 && Number.isFinite(v))),
    [series],
  );

  const marginLeft = useMemo(() => {
    const longest = domain.ticks.reduce((len, t) => Math.max(len, tickFormat(t).length), 0);
    return Math.max(34, Math.round(longest * 6.4) + 14);
  }, [domain, tickFormat]);

  // Les seuils sont nommes dans la marge droite : jamais par-dessus les donnees.
  const marginRight = useMemo(() => {
    if (refLines.length === 0) return 12;
    const longest = refLines.reduce((len, line) => Math.max(len, line.label.length), 0);
    return Math.round(longest * 6.1) + 16;
  }, [refLines]);

  const plotW = Math.max(0, width - marginLeft - marginRight);
  const plotH = height - MARGIN_TOP - MARGIN_BOTTOM;
  const band = n > 0 ? plotW / n : 0;
  const cx = (i: number) => marginLeft + (i + 0.5) * band;
  const y = (v: number) => MARGIN_TOP + plotH * (1 - (v - domain.lo) / (domain.hi - domain.lo));
  const zeroY = y(0);

  const k = Math.max(1, groups.length);
  const barW = band <= 0 ? 0 : Math.max(1, Math.min(MAX_BAR, (band * 0.72 - (k - 1) * SEGMENT_GAP) / k));
  const groupX = (i: number, g: number) => cx(i) - (k * barW + (k - 1) * SEGMENT_GAP) / 2 + g * (barW + SEGMENT_GAP);

  // Etiquettes d'axe X : au plus une tous les ~64 px.
  const xStep = n > 0 ? Math.max(1, Math.ceil(n / Math.max(1, Math.floor(plotW / 64)))) : 1;

  // Seuils : etiquettes ecartees d'au moins 13 px, dans l'ordre des lignes.
  const refLayout = useMemo(() => {
    const items = refLines
      .map((line) => ({ ...line, lineY: y(line.value), labelY: y(line.value) }))
      .sort((a, b) => b.lineY - a.lineY);
    for (let i = 1; i < items.length; i += 1) {
      if (items[i - 1].labelY - items[i].labelY < 12) items[i].labelY = items[i - 1].labelY - 12;
    }
    return items;
    // y depend de domain / height / plotH
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refLines, domain, height, plotH]);

  const maxPoint = useMemo(() => {
    if (!annotateMax || n === 0) return null;
    let best = -Infinity;
    let index = -1;
    for (let i = 0; i < n; i += 1) {
      let total = 0;
      for (const id of groups) total = Math.max(total, (stacked.posTop.get(id) as number[])[i]);
      if (barSeries.length === 0 && lineSeries[0]) total = lineSeries[0].values[i] ?? 0;
      if (total > best) {
        best = total;
        index = i;
      }
    }
    return index >= 0 && best > 0 ? { index, value: best } : null;
  }, [annotateMax, n, groups, stacked, barSeries, lineSeries]);

  const showLegend = legend ?? (series.length >= 2 || refLines.length > 0);

  const handleMove = (event: PointerEvent<SVGRectElement>) => {
    if (band <= 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const index = Math.floor((event.clientX - rect.left) / band);
    setHover(Math.max(0, Math.min(n - 1, index)));
  };

  const handleKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (n === 0) return;
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      setHover((h) => (h === null ? 0 : Math.min(n - 1, h + 1)));
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      setHover((h) => (h === null ? n - 1 : Math.max(0, h - 1)));
    } else if (event.key === 'Escape') {
      setHover(null);
    }
  };

  const tooltipRows = useMemo(() => {
    if (hover === null) return [];
    const rows = series
      .map((s) => ({ s, value: s.values[hover] }))
      .filter((row): row is { s: ChartSeries; value: number } => row.value !== null && Number.isFinite(row.value));
    // piles : meme ordre que la lecture visuelle, du haut vers le bas
    const isStack = barSeries.some((s) => s.stack) && barSeries.length > 1;
    return isStack ? [...rows].reverse() : rows;
  }, [hover, series, barSeries]);

  const tooltipTotal = useMemo(() => {
    if (hover === null || !totalLabel) return null;
    return barSeries.reduce((sum, s) => sum + (s.values[hover] ?? 0), 0);
  }, [hover, totalLabel, barSeries]);

  return (
    <div>
      {showLegend && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 mb-2">
          {series.map((s) => (
            <span key={s.key} className="inline-flex items-center gap-1.5 text-xs text-gray-600">
              {s.kind === 'line' ? (
                <svg width="16" height="8" aria-hidden="true">
                  <line x1="0" y1="4" x2="16" y2="4" stroke={s.color} strokeWidth="2" strokeLinecap="round" strokeDasharray={s.dashed ? '4 3' : undefined} />
                </svg>
              ) : (
                <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: s.color }} aria-hidden="true" />
              )}
              {s.label}
            </span>
          ))}
          {refLines.map((line) => (
            <span key={line.label} className="inline-flex items-center gap-1.5 text-xs text-gray-600">
              <svg width="16" height="8" aria-hidden="true">
                <line x1="0" y1="4" x2="16" y2="4" stroke="#6b7280" strokeWidth="1" strokeDasharray="4 3" />
              </svg>
              {line.label} · {format(line.value)}
            </span>
          ))}
        </div>
      )}

      <div
        ref={containerRef}
        className="relative outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 rounded-lg"
        style={{ height }}
        tabIndex={0}
        role="group"
        aria-label={`${ariaLabel}. Flèches gauche et droite pour parcourir les valeurs.`}
        onKeyDown={handleKey}
        onBlur={() => setHover(null)}
      >
        {width > 0 && !hasData && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-400">
            Aucune donnée sur la période
          </div>
        )}

        {width > 0 && hasData && (
          <svg width={width} height={height} role="img" aria-label={ariaLabel} className="block">
            {/* grille + graduations */}
            {domain.ticks.map((tick) => (
              <g key={tick}>
                <line x1={marginLeft} x2={width - marginRight} y1={y(tick)} y2={y(tick)} stroke={INK.grid} strokeWidth="1" />
                <text x={marginLeft - 8} y={y(tick)} dy="0.32em" textAnchor="end" fontSize="11" fill={INK.muted} style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {tickFormat(tick)}
                </text>
              </g>
            ))}

            {/* bande survolee (barres) */}
            {hover !== null && barSeries.length > 0 && (
              <rect x={marginLeft + hover * band} y={MARGIN_TOP} width={band} height={plotH} fill="#f3f4f6" />
            )}

            {/* barres */}
            {barSeries.map((s) => {
              const g = groups.indexOf(s.stack ?? `solo:${s.key}`);
              const bounds = stacked.bounds.get(s.key) ?? [];
              const id = s.stack ?? `solo:${s.key}`;
              const posTop = stacked.posTop.get(id) as number[];
              const negTop = stacked.negTop.get(id) as number[];
              return (
                <g key={s.key}>
                  {bounds.map((b, i) => {
                    if (!b) return null;
                    const up = b.to > b.from;
                    let top = up ? y(b.to) : y(b.from);
                    let h = Math.abs(y(b.from) - y(b.to));
                    // 2 px de fond entre segments : retire cote base, sauf au contact de la ligne zero
                    if (b.from !== 0 && h > SEGMENT_GAP + 1) {
                      h -= SEGMENT_GAP;
                      if (!up) top += SEGMENT_GAP;
                    }
                    const isEnd = up ? Math.abs(b.to - posTop[i]) < 1e-9 : Math.abs(b.to - negTop[i]) < 1e-9;
                    const fill = signColors ? (up ? signColors.positive : signColors.negative) : s.color;
                    return (
                      <path
                        key={i}
                        d={barPath(groupX(i, g), top, barW, Math.max(h, 1), up && isEnd, !up && isEnd)}
                        fill={fill}
                        opacity={hover === null || hover === i ? 1 : 0.55}
                      />
                    );
                  })}
                </g>
              );
            })}

            {/* ligne zero */}
            <line x1={marginLeft} x2={width - marginRight} y1={zeroY} y2={zeroY} stroke={INK.axis} strokeWidth="1" />

            {/* aires + lignes */}
            {lineSeries.map((s) => {
              const runs: Array<Array<[number, number]>> = [];
              let run: Array<[number, number]> = [];
              s.values.forEach((v, i) => {
                if (v === null || !Number.isFinite(v)) {
                  if (run.length) runs.push(run);
                  run = [];
                } else {
                  run.push([cx(i), y(v)]);
                }
              });
              if (run.length) runs.push(run);
              const lastRun = runs[runs.length - 1];
              const lastPoint = lastRun ? lastRun[lastRun.length - 1] : null;
              return (
                <g key={s.key}>
                  {s.kind === 'area' &&
                    runs.map((points, r) => (
                      <path
                        key={`a${r}`}
                        d={`M${points.map((p) => p.join(',')).join('L')}L${points[points.length - 1][0]},${zeroY}L${points[0][0]},${zeroY}Z`}
                        fill={s.color}
                        opacity="0.1"
                      />
                    ))}
                  {runs.map((points, r) => (
                    <path
                      key={`l${r}`}
                      d={`M${points.map((p) => p.join(',')).join('L')}`}
                      fill="none"
                      stroke={s.color}
                      strokeWidth="2"
                      strokeLinejoin="round"
                      strokeLinecap="round"
                      strokeDasharray={s.dashed ? '5 4' : undefined}
                    />
                  ))}
                  {lastPoint && hover === null && (
                    <circle cx={lastPoint[0]} cy={lastPoint[1]} r="4" fill={s.color} stroke={INK.surface} strokeWidth="2" />
                  )}
                </g>
              );
            })}

            {/* seuils : trait en pointilles sur le trace, nom dans la marge */}
            {refLayout.map((line) => (
              <g key={line.label}>
                <line x1={marginLeft} x2={width - marginRight} y1={line.lineY} y2={line.lineY} stroke="#6b7280" strokeWidth="1" strokeDasharray="5 4" />
                <text x={width - marginRight + 6} y={line.labelY} dy="0.32em" textAnchor="start" fontSize="10.5" fontWeight="500" fill={INK.secondary}>
                  {line.label}
                </text>
              </g>
            ))}

            {/* valeur du plus haut point */}
            {maxPoint && hover === null && (
              <text
                x={Math.min(Math.max(cx(maxPoint.index), marginLeft + 24), width - marginRight - 24)}
                y={y(maxPoint.value) - 7}
                textAnchor="middle"
                fontSize="11"
                fontWeight="600"
                fill={INK.primary}
                stroke={INK.surface}
                strokeWidth="3"
                paintOrder="stroke"
              >
                {format(maxPoint.value)}
              </text>
            )}

            {/* repere de survol (lignes) */}
            {hover !== null && lineSeries.length > 0 && (
              <g>
                {barSeries.length === 0 && (
                  <line x1={cx(hover)} x2={cx(hover)} y1={MARGIN_TOP} y2={MARGIN_TOP + plotH} stroke={INK.axis} strokeWidth="1" />
                )}
                {lineSeries.map((s) => {
                  const v = s.values[hover];
                  if (v === null || !Number.isFinite(v)) return null;
                  return <circle key={s.key} cx={cx(hover)} cy={y(v)} r="4" fill={s.color} stroke={INK.surface} strokeWidth="2" />;
                })}
              </g>
            )}

            {/* etiquettes X */}
            {labels.map((label, i) => {
              if (i % xStep !== 0) return null;
              const x = cx(i);
              const nearEnd = x > width - marginRight - 28;
              return (
                <text key={i} x={nearEnd ? width - marginRight : x} y={height - 8} textAnchor={nearEnd ? 'end' : 'middle'} fontSize="11" fill={INK.muted}>
                  {label}
                </text>
              );
            })}

            {/* zone de survol : toute la surface, jamais le trait seul */}
            <rect
              x={marginLeft}
              y={MARGIN_TOP}
              width={plotW}
              height={plotH}
              fill="transparent"
              onPointerMove={handleMove}
              onPointerLeave={() => setHover(null)}
            />
          </svg>
        )}

        {hover !== null && hasData && tooltipRows.length > 0 && (
          <div
            className="pointer-events-none absolute z-10 min-w-[168px] max-w-[280px] rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-lg"
            style={
              cx(hover) < width / 2
                ? { left: cx(hover) + Math.max(12, band / 2 + 6), top: 4 }
                : { right: width - cx(hover) + Math.max(12, band / 2 + 6), top: 4 }
            }
          >
            <p className="text-xs text-gray-500 mb-1.5">{(longLabels ?? labels)[hover]}</p>
            <div className="space-y-1">
              {tooltipRows.map(({ s, value }) => (
                <div key={s.key} className="flex items-center gap-2 text-xs">
                  <span
                    className="w-3 h-0.5 rounded-full shrink-0"
                    style={{ backgroundColor: signColors ? (value >= 0 ? signColors.positive : signColors.negative) : s.color }}
                  />
                  <span className="text-gray-500 truncate">{s.label}</span>
                  <span className="ml-auto pl-3 font-semibold text-gray-900 tabular-nums whitespace-nowrap">{format(value)}</span>
                </div>
              ))}
              {tooltipTotal !== null && tooltipRows.length > 1 && (
                <div className="flex items-center gap-2 text-xs border-t border-gray-100 pt-1 mt-1">
                  <span className="text-gray-500">{totalLabel}</span>
                  <span className="ml-auto pl-3 font-semibold text-gray-900 tabular-nums whitespace-nowrap">{format(tooltipTotal)}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** Jumeau "tableau" d'un graphique : memes series, en colonnes. */
export function seriesTable(
  firstColumn: string,
  rowLabels: string[],
  series: ChartSeries[],
  format: (value: number) => string,
): { columns: string[]; rows: string[][] } {
  return {
    columns: [firstColumn, ...series.map((s) => s.label)],
    rows: rowLabels.map((label, i) => [
      label,
      ...series.map((s) => {
        const v = s.values[i];
        return v === null || !Number.isFinite(v) ? '-' : format(v);
      }),
    ]),
  };
}
