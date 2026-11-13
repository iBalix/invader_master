/**
 * Stats > Tresorerie : operations bancaires importees de Tiime. Variation de
 * tresorerie, depenses par categorie, marge brute, tiers, historique, et le
 * classement des operations encore sans categorie.
 */

import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Loader2, Search, Tags, X } from 'lucide-react';
import toast from 'react-hot-toast';
import StatsLayout, { resetStatsMeta, useStatsMeta, useStatsQuery } from '../../components/Stats/StatsLayout';
import TimeChart, { seriesTable, type ChartSeries } from '../../components/Stats/TimeChart';
import { RankedBars, type RankedItem } from '../../components/Stats/charts';
import { ChartCard, DeltaBadge, EmptyState, FilterSelect, Refreshing, StatTile } from '../../components/Stats/ui';
import {
  COMPARE_LABEL,
  DateRangeControl,
  OPENING_FALLBACK,
  resolveRange,
  useStatsFilters,
} from '../../components/Stats/filters';
import {
  fmtDayYear,
  fmtEur,
  fmtEur2,
  fmtEurAxis,
  fmtInt,
  fmtMonth,
  fmtMonthLong,
  fmtPct,
  monthsBetween,
} from '../../components/Stats/format';
import { ACCENT, BAD, GOOD, INK, OTHER_COLOR, OTHER_LABEL, buildColorMap, isColored } from '../../components/Stats/theme';
import { COGS_CATEGORY, REVENUE_CATEGORY, categoryLabel, fmtSigned, grossMargin } from '../../components/Stats/flux';
import { useAuth } from '../../hooks/useAuth';
import { statsApi, type CompareMode, type TransactionsPage, type TreasuryStats } from '../../lib/statsApi';

const ALL = '__all__';
const PAGE_SIZE = 15;

const round2 = (v: number) => Math.round(v * 100) / 100;

export default function StatsTreasuryPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const meta = useStatsMeta();
  const range = useStatsFilters((s) => s.treasury);
  const compare = useStatsFilters((s) => s.compare);
  const setRange = useStatsFilters((s) => s.setRange);
  const setCompare = useStatsFilters((s) => s.setCompare);

  /** ALL = pas de filtre ; '' = operations sans categorie. */
  const [category, setCategory] = useState<string>(ALL);
  const categoryFilter = category === ALL ? null : category;

  const opening = meta?.sales.first ?? OPENING_FALLBACK;
  const resolved = useMemo(() => resolveRange(range, opening), [range, opening]);

  const query = useStatsQuery<TreasuryStats>(`${resolved.from}|${resolved.to}|${compare}|${category}`, () =>
    statsApi.treasury({ ...resolved, compare, category: categoryFilter }),
  );
  const settings = useStatsQuery('settings', () => statsApi.settings());
  const data = query.data;
  // "Depuis l'ouverture" n'a rien avant elle : aucune comparaison possible.
  const comparable = range.preset !== 'all';
  const compareLabel = comparable ? COMPARE_LABEL[compare] : undefined;
  const filtered = categoryFilter !== null;

  // Couleurs : ordre de reference = depenses sur tout l'historique.
  const expenseOrder = useMemo(
    () => (meta?.fluxCategories ?? []).filter((c) => c.outflow < 0).map((c) => c.category),
    [meta],
  );
  const colorOf = useMemo(() => buildColorMap(expenseOrder), [expenseOrder]);

  const months = useMemo(() => (data ? monthsBetween(data.period.from.slice(0, 7), data.period.to.slice(0, 7)) : []), [data]);
  const monthLabels = useMemo(() => months.map(fmtMonth), [months]);
  const monthLongLabels = useMemo(() => months.map(fmtMonthLong), [months]);

  const series = useMemo(() => {
    if (!data) return null;
    const index = new Map(months.map((m, i) => [m, i]));
    const net = new Array<number>(months.length).fill(0);
    const byCategory = new Map<string, number[]>();
    const revenue = new Array<number>(months.length).fill(0);
    const cogs = new Array<number>(months.length).fill(0);

    for (const row of data.monthly) {
      const i = index.get(row.month);
      if (i === undefined) continue;
      net[i] += row.inflow + row.outflow;
      if (row.outflow < 0) {
        const values = byCategory.get(row.category) ?? new Array<number>(months.length).fill(0);
        values[i] += -row.outflow;
        byCategory.set(row.category, values);
      }
      if (row.category === REVENUE_CATEGORY) revenue[i] += row.inflow + row.outflow;
      if (row.category === COGS_CATEGORY) cogs[i] += -(row.inflow + row.outflow);
    }

    const totals = [...byCategory.entries()]
      .map(([key, values]) => ({ key, values: values.map(round2), total: round2(values.reduce((s, v) => s + v, 0)) }))
      .sort((a, b) => b.total - a.total);

    // marge du mois, et marge sur trois mois glissants (rapport des sommes)
    const margin = revenue.map((r, i) => grossMargin(r, cogs[i]));
    const rolling = revenue.map((_, i) => {
      let r = 0;
      let c = 0;
      for (let j = Math.max(0, i - 2); j <= i; j += 1) {
        r += revenue[j];
        c += cogs[j];
      }
      return grossMargin(r, c);
    });

    return { net: net.map(round2), totals, margin, rolling };
  }, [data, months]);

  const stackSeries = useMemo<ChartSeries[]>(() => {
    if (!series) return [];
    const present = new Map(series.totals.map((t) => [t.key, t.values]));
    const colored = expenseOrder.filter((key) => isColored(expenseOrder, key) && present.has(key));
    const out: ChartSeries[] = colored.map((key) => ({
      key,
      label: categoryLabel(key),
      color: colorOf(key),
      kind: 'bar' as const,
      stack: 'depenses',
      values: present.get(key) as number[],
    }));
    const rest = series.totals.filter((t) => !colored.includes(t.key));
    if (rest.length > 0) {
      out.push({
        key: OTHER_LABEL,
        label: OTHER_LABEL,
        color: OTHER_COLOR,
        kind: 'bar',
        stack: 'depenses',
        values: months.map((_, i) => round2(rest.reduce((sum, t) => sum + t.values[i], 0))),
      });
    }
    return out;
  }, [series, expenseOrder, colorOf, months]);

  const expenseItems = useMemo<RankedItem[]>(
    () =>
      (series?.totals ?? []).map((t) => ({
        key: t.key,
        label: categoryLabel(t.key),
        value: t.total,
        color: colorOf(t.key),
        active: categoryFilter === t.key,
      })),
    [series, colorOf, categoryFilter],
  );

  const cur = data?.totals.current;
  const prev = data?.totals.previous;
  const target = settings.data?.grossMarginTarget ?? null;

  const [labelFilter, setLabelFilter] = useState<string | null>(null);
  // un tiers choisi n'a plus de sens des que la periode ou la categorie change
  useEffect(() => setLabelFilter(null), [resolved.from, resolved.to, category]);

  const payees = useMemo<RankedItem[]>(() => {
    if (!data) return [];
    const byLabel = new Map<string, { net: number; rows: number; categories: Set<string> }>();
    for (const row of data.labels) {
      const entry = byLabel.get(row.label) ?? { net: 0, rows: 0, categories: new Set<string>() };
      entry.net += row.net;
      entry.rows += row.rows;
      entry.categories.add(row.category);
      byLabel.set(row.label, entry);
    }
    return [...byLabel.entries()]
      .filter(([, v]) => v.net < -0.005)
      .sort((a, b) => a[1].net - b[1].net)
      .map(([label, v]) => ({
        key: label,
        label: label || 'Sans libellé',
        value: round2(-v.net),
        sub: `${[...v.categories].map(categoryLabel).join(', ')} · ${fmtInt(v.rows)} opération${v.rows > 1 ? 's' : ''}`,
        active: labelFilter === label,
      }));
  }, [data, labelFilter]);

  return (
    <StatsLayout
      subtitle="Opérations bancaires Tiime : variation de trésorerie, dépenses par catégorie, marge brute."
      meta={meta}
      loading={!data && query.loading}
      error={query.error}
      onRetry={query.reload}
      filters={
        <>
          <DateRangeControl range={range} resolved={resolved} onChange={(next) => setRange('treasury', next)} />
          <FilterSelect label="Comparer à" value={compare} onChange={(v) => setCompare(v as CompareMode)} disabled={!comparable}>
            <option value="previous">Comparer à la période précédente</option>
            <option value="year">Comparer à la même période N-1</option>
          </FilterSelect>
          <FilterSelect label="Catégorie" value={category} active={filtered} onChange={setCategory}>
            <option value={ALL}>Toutes les catégories</option>
            {(meta?.fluxCategories ?? []).map((c) => (
              <option key={c.category || 'none'} value={c.category}>
                {categoryLabel(c.category)}
              </option>
            ))}
          </FilterSelect>
          {filtered && (
            <button
              type="button"
              onClick={() => setCategory(ALL)}
              className="inline-flex items-center gap-1 px-2 py-2 text-sm text-gray-500 hover:text-gray-900"
            >
              <X className="w-4 h-4" aria-hidden="true" />
              Retirer le filtre
            </button>
          )}
        </>
      }
    >
      {data && cur && prev && series && (
        <Refreshing active={query.loading}>
          <div className="space-y-5">
            <div className="grid grid-cols-2 xl:grid-cols-5 gap-4">
              <StatTile
                label="Variation de trésorerie"
                value={fmtSigned(cur.net)}
                tone={cur.net >= 0 ? 'good' : 'bad'}
                hint={comparable ? `${fmtSigned(prev.net)} sur la période de comparaison` : undefined}
              />
              <StatTile
                label="Entrées"
                value={fmtEur(cur.inflow)}
                delta={comparable ? <DeltaBadge current={cur.inflow} previous={prev.inflow} /> : undefined}
                compareLabel={compareLabel}
                hint={`${fmtInt(cur.rows)} opérations`}
              />
              <StatTile
                label="Sorties"
                value={fmtEur(Math.abs(cur.outflow))}
                delta={comparable ? <DeltaBadge current={Math.abs(cur.outflow)} previous={Math.abs(prev.outflow)} upIsBad /> : undefined}
                compareLabel={compareLabel}
              />
              <StatTile
                label="Encaissements"
                value={fmtEur(data.margin.current.revenue)}
                delta={comparable ? <DeltaBadge current={data.margin.current.revenue} previous={data.margin.previous.revenue} /> : undefined}
                compareLabel={compareLabel}
                hint={`Recettes déposées en banque${filtered ? ' · hors filtre' : ''}`}
              />
              <StatTile
                label="Marge brute"
                value={data.margin.current.rate === null ? '-' : fmtPct(data.margin.current.rate)}
                delta={
                  comparable && data.margin.current.rate !== null && data.margin.previous.rate !== null ? (
                    <DeltaBadge current={data.margin.current.rate} previous={data.margin.previous.rate} points />
                  ) : undefined
                }
                compareLabel={compareLabel}
                hint={`Matières premières : ${fmtEur(data.margin.current.cogs)}${target !== null ? ` · objectif ${fmtPct(target, 0)}` : ''}${filtered ? ' · hors filtre' : ''}`}
              />
            </div>

            <ChartCard
              title="Variation de trésorerie par mois"
              subtitle={`Entrées moins sorties${filtered ? ` de la catégorie ${categoryLabel(categoryFilter as string)}` : ', toutes catégories'}.`}
              table={seriesTable(
                'Mois',
                monthLongLabels,
                [{ key: 'net', label: 'Variation', color: ACCENT, values: series.net, kind: 'bar' }],
                fmtSigned,
              )}
            >
              <TimeChart
                ariaLabel="Variation de trésorerie par mois"
                labels={monthLabels}
                longLabels={monthLongLabels}
                series={[{ key: 'net', label: 'Variation', color: ACCENT, values: series.net, kind: 'bar' }]}
                signColors={{ positive: GOOD, negative: BAD }}
                format={fmtSigned}
                axisFormat={fmtEurAxis}
                height={280}
              />
            </ChartCard>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
              <ChartCard title="Dépenses par catégorie" subtitle="Cliquez une catégorie pour filtrer toute la page.">
                <RankedBars
                  items={expenseItems}
                  format={fmtEur}
                  limit={9}
                  onSelect={(key) => setCategory(categoryFilter === key ? ALL : key)}
                  emptyLabel="Aucune dépense sur la période"
                />
              </ChartCard>
              <ChartCard
                className="xl:col-span-2"
                title="Dépenses par mois"
                subtitle="Sorties d'argent empilées par catégorie."
                table={seriesTable('Mois', monthLongLabels, stackSeries, fmtEur)}
              >
                <TimeChart
                  ariaLabel="Dépenses par mois et par catégorie"
                  labels={monthLabels}
                  longLabels={monthLongLabels}
                  series={stackSeries}
                  format={fmtEur}
                  axisFormat={fmtEurAxis}
                  totalLabel="Total"
                  legend
                  height={320}
                />
              </ChartCard>
            </div>

            {!filtered && series.totals.length > 1 && (
              <ChartCard
                title="Chaque catégorie dans le temps"
                subtitle="Dépenses mensuelles, une vignette par catégorie. L'échelle est propre à chaque vignette."
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-x-6 gap-y-5">
                  {series.totals.map((t) => (
                    <div key={t.key} className="min-w-0">
                      <button
                        type="button"
                        onClick={() => setCategory(t.key)}
                        className="flex w-full items-baseline gap-2 text-left hover:underline"
                        title="Filtrer la page sur cette catégorie"
                      >
                        <span className="w-2.5 h-2.5 rounded-sm shrink-0 self-center" style={{ backgroundColor: colorOf(t.key) }} aria-hidden="true" />
                        <span className="text-sm font-medium text-gray-900 truncate">{categoryLabel(t.key)}</span>
                        <span className="ml-auto text-sm text-gray-500 tabular-nums whitespace-nowrap">{fmtEur(t.total)}</span>
                      </button>
                      <TimeChart
                        ariaLabel={`Dépenses mensuelles, ${categoryLabel(t.key)}`}
                        labels={monthLabels}
                        longLabels={monthLongLabels}
                        series={[{ key: t.key, label: categoryLabel(t.key), color: ACCENT, values: t.values, kind: 'bar' }]}
                        format={fmtEur}
                        axisFormat={fmtEurAxis}
                        tickCount={2}
                        height={120}
                      />
                    </div>
                  ))}
                </div>
              </ChartCard>
            )}

            {!filtered && (
              <ChartCard
                title="Marge brute par mois"
                subtitle="1 moins les achats de matières premières rapportés aux encaissements. Les avoirs fournisseurs viennent en déduction des achats."
                table={{
                  columns: ['Mois', 'Marge du mois', 'Sur 3 mois glissants'],
                  rows: monthLongLabels.map((label, i) => [
                    label,
                    series.margin[i] === null ? '-' : fmtPct(series.margin[i] as number),
                    series.rolling[i] === null ? '-' : fmtPct(series.rolling[i] as number),
                  ]),
                }}
              >
                <TimeChart
                  ariaLabel="Marge brute par mois"
                  labels={monthLabels}
                  longLabels={monthLongLabels}
                  series={[
                    { key: 'margin', label: 'Marge du mois', color: ACCENT, values: series.margin, kind: 'line' },
                    { key: 'rolling', label: 'Sur 3 mois glissants', color: INK.primary, values: series.rolling, kind: 'line', dashed: true },
                  ]}
                  refLines={target !== null ? [{ label: 'Objectif', value: target }] : []}
                  format={(v) => fmtPct(v)}
                  axisFormat={(v) => fmtPct(v, 0)}
                  height={280}
                />
              </ChartCard>
            )}

            {data.uncategorized.length > 0 && (
              <UncategorizedCard
                rows={data.uncategorized}
                categories={(meta?.fluxCategories ?? []).map((c) => c.category).filter((c) => c !== '')}
                canEdit={isAdmin}
                onDone={() => {
                  resetStatsMeta();
                  query.reload();
                }}
              />
            )}

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
              <ChartCard title="Principaux tiers payés" subtitle="Solde net versé à chaque tiers. Cliquez pour filtrer l'historique.">
                <RankedBars
                  items={payees}
                  format={fmtEur}
                  limit={10}
                  showShare={false}
                  onSelect={(key) => setLabelFilter(labelFilter === key ? null : key)}
                  emptyLabel="Aucun paiement sur la période"
                />
              </ChartCard>
              <TransactionsCard
                className="xl:col-span-2"
                from={resolved.from}
                to={resolved.to}
                category={categoryFilter}
                label={labelFilter}
                onClearLabel={() => setLabelFilter(null)}
                colorOf={colorOf}
              />
            </div>
          </div>
        </Refreshing>
      )}
    </StatsLayout>
  );
}

// ---------------------------------------------------------------------------
// Operations sans categorie
// ---------------------------------------------------------------------------

function UncategorizedCard({
  rows,
  categories,
  canEdit,
  onDone,
}: {
  rows: TreasuryStats['uncategorized'];
  categories: string[];
  canEdit: boolean;
  onDone: () => void;
}) {
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const count = rows.reduce((sum, row) => sum + row.rows, 0);
  const net = rows.reduce((sum, row) => sum + row.net, 0);
  const visible = expanded ? rows : rows.slice(0, 6);

  const apply = async (label: string) => {
    const category = choices[label];
    if (!category) return;
    setSaving(label);
    try {
      const result = await statsApi.categorize(label, category);
      toast.success(`${result.updated} opération${result.updated > 1 ? 's' : ''} classée${result.updated > 1 ? 's' : ''} en ${categoryLabel(category)}`);
      onDone();
    } catch (err) {
      const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(message ?? 'Classement impossible');
    } finally {
      setSaving(null);
    }
  };

  return (
    <ChartCard
      title="À catégoriser"
      subtitle={`${fmtInt(count)} opérations sans catégorie, toutes dates confondues, pour un solde de ${fmtSigned(net)}. Elles comptent dans les totaux sous « Non catégorisé ». Une fois un tiers classé, les prochains imports reprennent sa catégorie.`}
    >
      <ul className="divide-y divide-gray-100">
        {visible.map((row) => (
          <li key={row.label || 'sans-libelle'} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-2.5">
            <div className="min-w-0 flex-1 basis-56">
              <p className="text-sm font-medium text-gray-900 truncate">{row.label || 'Sans libellé'}</p>
              <p className="text-xs text-gray-500">
                {fmtInt(row.rows)} opération{row.rows > 1 ? 's' : ''} · dernière le {fmtDayYear(row.last)}
              </p>
            </div>
            <span className={`text-sm font-semibold tabular-nums whitespace-nowrap ${row.net >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
              {fmtSigned(row.net)}
            </span>
            {canEdit && row.label !== '' && (
              <div className="flex items-center gap-2">
                <FilterSelect
                  label={`Catégorie pour ${row.label}`}
                  value={choices[row.label] ?? ''}
                  onChange={(value) => setChoices((c) => ({ ...c, [row.label]: value }))}
                >
                  <option value="">Choisir une catégorie</option>
                  {categories.map((category) => (
                    <option key={category} value={category}>
                      {categoryLabel(category)}
                    </option>
                  ))}
                </FilterSelect>
                <button
                  type="button"
                  disabled={!choices[row.label] || saving !== null}
                  onClick={() => apply(row.label)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-3 py-2 text-sm font-medium text-white hover:bg-primary-500 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving === row.label ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Tags className="w-4 h-4" aria-hidden="true" />}
                  Classer
                </button>
              </div>
            )}
            {canEdit && row.label === '' && <span className="text-xs text-gray-500">Sans tiers : à libeller dans Tiime puis réimporter</span>}
          </li>
        ))}
      </ul>
      {rows.length > 6 && (
        <button type="button" onClick={() => setExpanded((v) => !v)} className="mt-2 text-sm text-primary-600 hover:underline">
          {expanded ? 'Réduire' : `Tout afficher (${rows.length} tiers)`}
        </button>
      )}
    </ChartCard>
  );
}

// ---------------------------------------------------------------------------
// Historique des operations
// ---------------------------------------------------------------------------

function TransactionsCard({
  className,
  from,
  to,
  category,
  label,
  onClearLabel,
  colorOf,
}: {
  className?: string;
  from: string;
  to: string;
  category: string | null;
  label: string | null;
  onClearLabel: () => void;
  colorOf: (category: string) => string;
}) {
  const [input, setInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  // la recherche part 300 ms apres la derniere frappe
  useEffect(() => {
    const timer = setTimeout(() => setSearch(input.trim()), 300);
    return () => clearTimeout(timer);
  }, [input]);
  useEffect(() => setPage(1), [from, to, category, label, search]);

  const query = useStatsQuery<TransactionsPage>(`${from}|${to}|${category ?? '*'}|${label ?? '*'}|${search}|${page}`, () =>
    statsApi.transactions({ from, to, category, label, search, page, pageSize: PAGE_SIZE }),
  );
  const data = query.data;
  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <ChartCard
      className={className}
      title="Historique"
      subtitle={data ? `${fmtInt(data.total)} opération${data.total > 1 ? 's' : ''} sur la période.` : undefined}
      actions={
        <label className="relative">
          <span className="sr-only">Rechercher une opération</span>
          <Search className="w-4 h-4 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" aria-hidden="true" />
          <input
            type="search"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Rechercher"
            className="w-44 rounded-lg border border-gray-300 pl-8 pr-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/40"
          />
        </label>
      }
    >
      {label !== null && (
        <p className="mb-3">
          <button
            type="button"
            onClick={onClearLabel}
            className="inline-flex items-center gap-1.5 rounded-full bg-primary-500/10 px-3 py-1 text-sm text-primary-600 hover:bg-primary-500/20"
          >
            Tiers : {label || 'Sans libellé'}
            <X className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </p>
      )}

      {query.error && <p className="text-sm text-red-600 py-4">Chargement impossible : {query.error}</p>}

      {data && data.items.length === 0 && <EmptyState>Aucune opération ne correspond.</EmptyState>}

      {data && data.items.length > 0 && (
        <Refreshing active={query.loading}>
          <div className="overflow-x-auto -mx-5">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left text-xs uppercase tracking-wider text-gray-500">
                  <th className="pl-5 pr-3 py-2.5 font-medium">Date</th>
                  <th className="px-3 py-2.5 font-medium">Tiers</th>
                  <th className="px-3 py-2.5 font-medium">Catégorie</th>
                  <th className="pl-3 pr-5 py-2.5 font-medium text-right">Montant</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.items.map((tx) => (
                  <tr key={tx.id} className="hover:bg-gray-50 transition">
                    <td className="pl-5 pr-3 py-2 text-gray-600 whitespace-nowrap tabular-nums">{fmtDayYear(tx.date)}</td>
                    <td className="px-3 py-2 max-w-[280px]">
                      <p className="font-medium text-gray-900 truncate">{tx.label || 'Sans libellé'}</p>
                      <p className="text-xs text-gray-500 truncate" title={tx.designation}>
                        {tx.designation}
                      </p>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5 text-gray-700">
                        <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: colorOf(tx.category) }} aria-hidden="true" />
                        {categoryLabel(tx.category)}
                      </span>
                    </td>
                    <td className={`pl-3 pr-5 py-2 text-right font-semibold tabular-nums whitespace-nowrap ${tx.amount >= 0 ? 'text-emerald-700' : 'text-gray-900'}`}>
                      {tx.amount > 0 ? '+' : tx.amount < 0 ? '-' : ''}
                      {fmtEur2(Math.abs(tx.amount))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-end gap-3 mt-3 text-sm text-gray-600">
            Page {fmtInt(page)} sur {fmtInt(pages)}
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40"
              aria-label="Page précédente"
            >
              <ChevronLeft className="w-4 h-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(pages, p + 1))}
              disabled={page >= pages}
              className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40"
              aria-label="Page suivante"
            >
              <ChevronRight className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </Refreshing>
      )}

      {!data && query.loading && (
        <div className="py-10 flex justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" aria-label="Chargement" />
        </div>
      )}
    </ChartCard>
  );
}
