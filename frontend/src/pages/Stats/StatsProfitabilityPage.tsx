/**
 * Stats > Rentabilite : la vue longue, mois par mois depuis l'ouverture.
 * Chiffre d'affaires face aux points morts, saisonnalite annee par annee,
 * marge brute face a l'objectif, entrees et sorties de tresorerie.
 * Reprend la page "Suivi de rentabilite" de l'ancien rapport Looker Studio.
 */

import { useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, Settings2, Trash2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import StatsLayout, { useStatsMeta, useStatsQuery } from '../../components/Stats/StatsLayout';
import TimeChart, { seriesTable, type ChartSeries } from '../../components/Stats/TimeChart';
import { ChartCard, DeltaBadge, Refreshing, StatTile } from '../../components/Stats/ui';
import { COGS_CATEGORY, REVENUE_CATEGORY, fmtSigned, grossMargin } from '../../components/Stats/flux';
import {
  fmtEur,
  fmtEurAxis,
  fmtInt,
  fmtMonth,
  fmtMonthLong,
  fmtMonthName,
  fmtPct,
  monthsBetween,
} from '../../components/Stats/format';
import { ACCENT, INK, ORDINAL, SERIES_COLORS } from '../../components/Stats/theme';
import { useAuth } from '../../hooks/useAuth';
import { statsApi, type BreakEvenPoint, type OverviewStats, type StatsSettings } from '../../lib/statsApi';

const round2 = (v: number) => Math.round(v * 100) / 100;

interface MonthRow {
  month: string;
  ht: number;
  cash: number;
  openDays: number;
  inflow: number;
  outflow: number;
  revenue: number;
  cogs: number;
}

/** Une ligne par mois, du premier mois connu au dernier, sans trou. */
function buildMonths(overview: OverviewStats): MonthRow[] {
  const keys = [
    ...overview.salesMonthly.map((r) => r.month),
    ...overview.fluxMonthly.map((r) => r.month),
    ...overview.cashMonthly.map((r) => r.month),
  ].sort();
  if (keys.length === 0) return [];
  const rows = new Map<string, MonthRow>(
    monthsBetween(keys[0], keys[keys.length - 1]).map((month) => [
      month,
      { month, ht: 0, cash: 0, openDays: 0, inflow: 0, outflow: 0, revenue: 0, cogs: 0 },
    ]),
  );
  for (const r of overview.salesMonthly) {
    const row = rows.get(r.month) as MonthRow;
    row.ht = r.ht;
    row.openDays = r.openDays;
  }
  for (const r of overview.cashMonthly) (rows.get(r.month) as MonthRow).cash = r.inflow;
  for (const r of overview.fluxMonthly) {
    const row = rows.get(r.month) as MonthRow;
    row.inflow += r.inflow;
    row.outflow += r.outflow;
    if (r.category === REVENUE_CATEGORY) row.revenue += r.inflow + r.outflow;
    if (r.category === COGS_CATEGORY) row.cogs += -(r.inflow + r.outflow);
  }
  return [...rows.values()];
}

function marginOver(rows: MonthRow[]): number | null {
  return grossMargin(
    rows.reduce((s, r) => s + r.revenue, 0),
    rows.reduce((s, r) => s + r.cogs, 0),
  );
}

export default function StatsProfitabilityPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const meta = useStatsMeta();
  const overview = useStatsQuery('overview', () => statsApi.overview());
  const settings = useStatsQuery('settings', () => statsApi.settings());
  const [editing, setEditing] = useState(false);

  const model = useMemo(() => {
    if (!overview.data) return null;
    const all = buildMonths(overview.data);
    const firstSale = all.findIndex((r) => r.ht > 0);
    if (firstSale < 0) return null;
    // depuis l'ouverture : a partir du premier mois avec des ventes
    const open = all.slice(firstSale);

    const years = [...new Set(open.map((r) => r.month.slice(0, 4)))];
    const byYear = years.map((year) => {
      const rows = open.filter((r) => r.month.startsWith(year) && r.ht > 0);
      const ht = rows.reduce((s, r) => s + r.ht, 0);
      const openDays = rows.reduce((s, r) => s + r.openDays, 0);
      // comparaison honnete : uniquement les mois presents les deux annees
      const prevYear = String(Number(year) - 1);
      let cur = 0;
      let prev = 0;
      let shared = 0;
      for (const r of rows) {
        const twin = open.find((o) => o.month === `${prevYear}-${r.month.slice(5)}` && o.ht > 0);
        if (twin) {
          cur += r.ht;
          prev += twin.ht;
          shared += 1;
        }
      }
      return { year, ht, openDays, months: rows.length, cur, prev, shared, prevYear };
    });

    // derniers mois de marge : jusqu'au dernier mois ayant des encaissements
    const lastRevenue = [...open].reverse().findIndex((r) => r.revenue > 0);
    const withFlux = lastRevenue < 0 ? [] : open.slice(0, open.length - lastRevenue);
    const lastMonths = (n: number) => withFlux.slice(-n);

    return { all, open, years, byYear, withFlux, lastMonths };
  }, [overview.data]);

  const target = settings.data?.grossMarginTarget ?? null;
  const breakEven = settings.data?.breakEven ?? [];

  const loading = (!overview.data && overview.loading) || !model;

  return (
    <StatsLayout
      subtitle="Suivi de rentabilité : chiffre d'affaires face aux points morts, marge brute, trésorerie. Tout l'historique, au mois."
      meta={meta}
      loading={loading && !overview.error}
      error={overview.error}
      onRetry={overview.reload}
      filters={
        isAdmin && settings.data ? (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 hover:border-gray-400 transition"
          >
            <Settings2 className="w-4 h-4 text-gray-400" aria-hidden="true" />
            Modifier les objectifs
          </button>
        ) : undefined
      }
    >
      {model && (
        <Refreshing active={overview.loading}>
          <div className="space-y-8">
            <RevenueSection model={model} breakEven={breakEven} />
            <MarginSection model={model} target={target} />
            <CashSection months={model.all} />
          </div>
        </Refreshing>
      )}

      {editing && settings.data && (
        <ObjectivesDialog
          settings={settings.data}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            settings.reload();
          }}
        />
      )}
    </StatsLayout>
  );
}

type Model = {
  all: MonthRow[];
  open: MonthRow[];
  years: string[];
  byYear: Array<{
    year: string;
    ht: number;
    openDays: number;
    months: number;
    cur: number;
    prev: number;
    shared: number;
    prevYear: string;
  }>;
  withFlux: MonthRow[];
  lastMonths: (n: number) => MonthRow[];
};

function SectionTitle({ children }: { children: string }) {
  return <h2 className="text-lg font-semibold text-gray-900 mb-3">{children}</h2>;
}

// ---------------------------------------------------------------------------
// Chiffre d'affaires
// ---------------------------------------------------------------------------

function RevenueSection({ model, breakEven }: { model: Model; breakEven: BreakEvenPoint[] }) {
  const { open, byYear } = model;
  const labels = open.map((r) => fmtMonth(r.month));
  const longLabels = open.map((r) => fmtMonthLong(r.month));
  const totalHt = open.reduce((s, r) => s + r.ht, 0);
  const totalCash = open.reduce((s, r) => s + r.cash, 0);

  const series: ChartSeries[] = [
    { key: 'popina', label: 'Popina HT', color: ACCENT, values: open.map((r) => r.ht), kind: 'bar', stack: 'ca' },
    { key: 'cash', label: 'Espèces saisies', color: SERIES_COLORS[1], values: open.map((r) => r.cash), kind: 'bar', stack: 'ca' },
  ];

  // Douze derniers mois complets : le mois en cours, partiel, fausserait le decompte.
  const complete = open.slice(0, -1).slice(-12);
  const above = breakEven.map((point) => ({
    ...point,
    count: complete.filter((r) => r.ht + r.cash >= point.monthly).length,
  }));

  // Saisonnalite : une ligne par annee (les trois dernieres), janvier a decembre.
  const shownYears = byYear.slice(-3);
  const seasonal: ChartSeries[] = shownYears.map((y, i) => ({
    key: y.year,
    label: y.year,
    color: ORDINAL[ORDINAL.length - shownYears.length + i],
    kind: 'line' as const,
    values: Array.from({ length: 12 }, (_, m) => {
      const row = open.find((r) => r.month === `${y.year}-${String(m + 1).padStart(2, '0')}`);
      return row && row.ht > 0 ? round2(row.ht + row.cash) : null;
    }),
  }));
  const monthNames = Array.from({ length: 12 }, (_, m) => fmtMonthName(m + 1));

  return (
    <section>
      <SectionTitle>Chiffre d'affaires</SectionTitle>
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-5">
        <StatTile
          label="Depuis l'ouverture"
          value={fmtEur(totalHt)}
          hint={`Popina HT · plus ${fmtEur(totalCash)} d'espèces saisies`}
        />
        {byYear.slice(-3).map((y, i, list) => (
          <StatTile
            key={y.year}
            label={i === list.length - 1 ? `${y.year}, à ce jour` : y.year}
            value={fmtEur(y.ht)}
            delta={y.shared > 0 ? <DeltaBadge current={y.cur} previous={y.prev} /> : undefined}
            compareLabel={y.shared > 0 ? `vs ${y.prevYear}, sur les ${y.shared} mêmes mois` : undefined}
            hint={`${fmtEur(y.openDays > 0 ? y.ht / y.openDays : 0)} par jour ouvert · ${fmtInt(y.openDays)} jours`}
          />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-5">
        <ChartCard
          title="Chiffre d'affaires par mois"
          subtitle="Ventes Popina HT et espèces saisies en caisse. Pointillés : points morts."
          table={seriesTable('Mois', longLabels, series, fmtEur)}
        >
          <TimeChart
            ariaLabel="Chiffre d'affaires par mois depuis l'ouverture, comparé aux points morts"
            labels={labels}
            longLabels={longLabels}
            series={series}
            refLines={breakEven.map((point) => ({ label: point.label, value: point.monthly }))}
            format={fmtEur}
            axisFormat={fmtEurAxis}
            totalLabel="Total"
            annotateMax
            height={340}
          />
          {above.length > 0 && complete.length > 0 && (
            <dl className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
              {above.map((point) => (
                <div key={point.label} className="rounded-lg bg-gray-50 px-3 py-2">
                  <dt className="text-xs text-gray-500">
                    {point.label} · {fmtEur(point.monthly)} par mois
                  </dt>
                  <dd className="text-sm text-gray-900 mt-0.5">
                    <span className="font-semibold">
                      {point.count} mois sur {complete.length}
                    </span>{' '}
                    au-dessus, sur les {complete.length} derniers mois complets
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </ChartCard>

        <ChartCard
          title="Saisonnalité"
          subtitle="Chiffre d'affaires mensuel (Popina HT et espèces), une ligne par année."
          table={seriesTable('Mois', monthNames, seasonal, fmtEur)}
        >
          <TimeChart
            ariaLabel="Chiffre d'affaires mensuel, comparé d'une année sur l'autre"
            labels={monthNames}
            series={seasonal}
            format={fmtEur}
            axisFormat={fmtEurAxis}
            legend
            height={280}
          />
        </ChartCard>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Marge brute
// ---------------------------------------------------------------------------

function MarginSection({ model, target }: { model: Model; target: number | null }) {
  const { open, withFlux, lastMonths } = model;
  const labels = open.map((r) => fmtMonth(r.month));
  const longLabels = open.map((r) => fmtMonthLong(r.month));

  const monthly = open.map((r) => grossMargin(r.revenue, r.cogs));
  const rolling = open.map((_, i) => marginOver(open.slice(Math.max(0, i - 2), i + 1)));

  const span = (rows: MonthRow[]) =>
    rows.length === 0 ? '' : `${fmtMonth(rows[0].month)} à ${fmtMonth(rows[rows.length - 1].month)}`;

  const tiles = [
    { label: "Depuis l'ouverture", rows: withFlux },
    { label: '12 derniers mois', rows: lastMonths(12) },
    { label: '6 derniers mois', rows: lastMonths(6) },
    { label: '3 derniers mois', rows: lastMonths(3) },
  ];

  return (
    <section>
      <SectionTitle>Marge brute</SectionTitle>
      <div className="grid grid-cols-2 xl:grid-cols-5 gap-4 mb-5">
        {tiles.map((tile) => {
          const rate = marginOver(tile.rows);
          return (
            <StatTile
              key={tile.label}
              label={tile.label}
              value={rate === null ? '-' : fmtPct(rate)}
              delta={rate !== null && target !== null ? <DeltaBadge current={rate} previous={target} points /> : undefined}
              compareLabel="vs objectif"
              hint={span(tile.rows)}
            />
          );
        })}
        <StatTile label="Objectif" value={target === null ? '-' : fmtPct(target, 0)} hint="Marge brute visée" />
      </div>

      <ChartCard
        title="Marge brute par mois"
        subtitle="1 moins les achats de matières premières rapportés aux encaissements bancaires. Un gros réassort pèse sur le mois où il est payé : la ligne sur 3 mois glissants lisse cet effet."
        table={{
          columns: ['Mois', 'Encaissements', 'Matières premières', 'Marge du mois', 'Sur 3 mois glissants'],
          rows: open.map((r, i) => [
            longLabels[i],
            fmtEur(r.revenue),
            fmtEur(r.cogs),
            monthly[i] === null ? '-' : fmtPct(monthly[i] as number),
            rolling[i] === null ? '-' : fmtPct(rolling[i] as number),
          ]),
        }}
      >
        <TimeChart
          ariaLabel="Marge brute par mois depuis l'ouverture"
          labels={labels}
          longLabels={longLabels}
          series={[
            { key: 'margin', label: 'Marge du mois', color: ACCENT, values: monthly, kind: 'line' },
            { key: 'rolling', label: 'Sur 3 mois glissants', color: INK.primary, values: rolling, kind: 'line', dashed: true },
          ]}
          refLines={target !== null ? [{ label: 'Objectif', value: target }] : []}
          format={(v) => fmtPct(v)}
          axisFormat={(v) => fmtPct(v, 0)}
          height={300}
        />
      </ChartCard>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Tresorerie
// ---------------------------------------------------------------------------

function CashSection({ months }: { months: MonthRow[] }) {
  // toute l'historique bancaire, y compris les mois de travaux avant l'ouverture
  const firstFlux = months.findIndex((m) => m.inflow !== 0 || m.outflow !== 0);
  const rows = firstFlux < 0 ? [] : months.slice(firstFlux);
  const labels = rows.map((r) => fmtMonth(r.month));
  const longLabels = rows.map((r) => fmtMonthLong(r.month));

  const flows: ChartSeries[] = [
    { key: 'in', label: 'Entrées', color: ACCENT, values: rows.map((r) => round2(r.inflow)), kind: 'bar' },
    { key: 'out', label: 'Sorties', color: SERIES_COLORS[1], values: rows.map((r) => round2(-r.outflow)), kind: 'bar' },
  ];

  let running = 0;
  const cumulative = rows.map((r) => {
    running += r.inflow + r.outflow;
    return round2(running);
  });

  return (
    <section>
      <SectionTitle>Trésorerie</SectionTitle>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <ChartCard
          title="Entrées et sorties par mois"
          subtitle="Toutes les opérations bancaires importées de Tiime, apports et travaux compris."
          table={seriesTable('Mois', longLabels, flows, fmtEur)}
        >
          <TimeChart
            ariaLabel="Entrées et sorties bancaires par mois"
            labels={labels}
            longLabels={longLabels}
            series={flows}
            format={fmtEur}
            axisFormat={fmtEurAxis}
            legend
            height={300}
          />
        </ChartCard>
        <ChartCard
          title="Variation cumulée"
          subtitle="Cumul des entrées moins les sorties depuis la première opération importée."
          table={seriesTable(
            'Mois',
            longLabels,
            [{ key: 'cum', label: 'Cumul', color: ACCENT, values: cumulative, kind: 'area' }],
            fmtSigned,
          )}
        >
          <TimeChart
            ariaLabel="Variation cumulée de trésorerie"
            labels={labels}
            longLabels={longLabels}
            series={[{ key: 'cum', label: 'Cumul', color: ACCENT, values: cumulative, kind: 'area' }]}
            format={fmtSigned}
            axisFormat={fmtEurAxis}
            height={322}
          />
        </ChartCard>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Edition des objectifs (admin)
// ---------------------------------------------------------------------------

function ObjectivesDialog({
  settings,
  onClose,
  onSaved,
}: {
  settings: StatsSettings;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [points, setPoints] = useState<Array<{ label: string; monthly: string }>>(
    settings.breakEven.map((p) => ({ label: p.label, monthly: String(p.monthly) })),
  );
  const [target, setTarget] = useState(String(Math.round(settings.grossMarginTarget * 100)));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const parsed = points.map((p) => ({ label: p.label.trim(), monthly: Number(p.monthly) }));
  const targetValue = Number(target) / 100;
  const valid =
    parsed.every((p) => p.label !== '' && Number.isFinite(p.monthly) && p.monthly > 0) &&
    Number.isFinite(targetValue) &&
    targetValue > 0 &&
    targetValue < 1;

  const save = async () => {
    setSaving(true);
    try {
      await statsApi.saveSettings({ breakEven: parsed, grossMarginTarget: targetValue });
      toast.success('Objectifs enregistrés');
      onSaved();
    } catch (err) {
      const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(message ?? 'Enregistrement impossible');
    } finally {
      setSaving(false);
    }
  };

  const inputClass =
    'rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/40';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 p-4" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="objectives-title"
        className="w-full max-w-lg rounded-xl bg-white shadow-xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
          <h2 id="objectives-title" className="text-lg font-semibold text-gray-900">
            Objectifs
          </h2>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100" aria-label="Fermer">
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </header>

        <div className="px-5 py-4 space-y-5">
          {!settings.persisted && (
            <p className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800">
              Valeurs par défaut affichées. Pour pouvoir les modifier, appliquer la migration 057 dans Supabase
              (docs/migration-057-finance-stats-settings.sql).
            </p>
          )}

          <fieldset>
            <legend className="text-sm font-medium text-gray-900">Points morts</legend>
            <p className="text-xs text-gray-500 mt-0.5 mb-3">
              CA mensuel à atteindre. Tracés en pointillés sur les graphiques de CA : tel quel au mois, ramené à la semaine (× 12 / 52) et au jour (÷ 30).
            </p>
            <ul className="space-y-2">
              {points.map((point, i) => (
                <li key={i} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={point.label}
                    maxLength={30}
                    onChange={(event) => setPoints((list) => list.map((p, j) => (j === i ? { ...p, label: event.target.value } : p)))}
                    placeholder="Libellé, ex. PM 2027"
                    aria-label={`Libellé du point mort ${i + 1}`}
                    className={`${inputClass} flex-1 min-w-0`}
                  />
                  <div className="relative w-36">
                    <input
                      type="number"
                      min={1}
                      step={100}
                      value={point.monthly}
                      onChange={(event) => setPoints((list) => list.map((p, j) => (j === i ? { ...p, monthly: event.target.value } : p)))}
                      aria-label={`Montant mensuel du point mort ${i + 1}`}
                      className={`${inputClass} w-full pr-16 text-right tabular-nums`}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">€ / mois</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPoints((list) => list.filter((_, j) => j !== i))}
                    className="p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50"
                    aria-label={`Supprimer le point mort ${i + 1}`}
                  >
                    <Trash2 className="w-4 h-4" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
            {points.length < 6 && (
              <button
                type="button"
                onClick={() => setPoints((list) => [...list, { label: '', monthly: '' }])}
                className="mt-2 inline-flex items-center gap-1.5 text-sm text-primary-600 hover:underline"
              >
                <Plus className="w-4 h-4" aria-hidden="true" />
                Ajouter un point mort
              </button>
            )}
          </fieldset>

          <label className="block">
            <span className="text-sm font-medium text-gray-900">Marge brute visée</span>
            <div className="relative w-32 mt-2">
              <input
                type="number"
                min={1}
                max={99}
                value={target}
                onChange={(event) => setTarget(event.target.value)}
                className={`${inputClass} w-full pr-8 text-right tabular-nums`}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">%</span>
            </div>
          </label>
        </div>

        <footer className="flex justify-end gap-2 border-t border-gray-200 px-5 py-4">
          <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">
            Annuler
          </button>
          <button
            type="button"
            onClick={save}
            disabled={!valid || saving || !settings.persisted}
            className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-500 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
            Enregistrer
          </button>
        </footer>
      </div>
    </div>
  );
}
