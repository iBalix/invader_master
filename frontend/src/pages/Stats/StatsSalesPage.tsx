/**
 * Stats > Ventes : tout ce que raconte l'export produits Popina (CA, tickets,
 * categories, produits, heures, jours, remises) plus les especes saisies en
 * caisse. Reprend et etend la page "ventes" de l'ancien rapport Looker Studio.
 */

import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Search, X } from 'lucide-react';
import StatsLayout, { useStatsMeta, useStatsQuery } from '../../components/Stats/StatsLayout';
import TimeChart, { seriesTable, type ChartSeries, type RefLine } from '../../components/Stats/TimeChart';
import { Heatmap, RankedBars, SegmentedBar, type HeatCell, type RankedItem } from '../../components/Stats/charts';
import { ChartCard, DeltaBadge, EmptyState, FilterSelect, Refreshing, Segmented, StatTile } from '../../components/Stats/ui';
import {
  COMPARE_LABEL,
  DateRangeControl,
  OPENING_FALLBACK,
  resolveRange,
  useStatsFilters,
} from '../../components/Stats/filters';
import {
  GRANULARITY_LABEL,
  WEEKDAYS,
  WEEKDAYS_SHORT,
  autoGranularity,
  bucketKey,
  buildBuckets,
  deltaRatio,
  fmtEur,
  fmtEur2,
  fmtEurAxis,
  fmtInt,
  fmtPct,
  movingAverage,
  parseISO,
  type Granularity,
} from '../../components/Stats/format';
import { ACCENT, INK, OTHER_COLOR, OTHER_LABEL, SERIES_COLORS, buildColorMap, isColored } from '../../components/Stats/theme';
import { statsApi, type CompareMode, type SalesProductRow, type SalesStats } from '../../lib/statsApi';

type Amounts = { ht: number; ttc: number };
type PrevAmounts = { prevHt: number; prevTtc: number };

const round2 = (v: number) => Math.round(v * 100) / 100;

/** Regroupe des lignes journalieres dans les intervalles d'une granularite. */
function sumByBucket<T extends { date: string }>(
  rows: T[],
  index: Map<string, number>,
  size: number,
  granularity: Granularity,
  pick: (row: T) => number,
): number[] {
  const out = new Array<number>(size).fill(0);
  for (const row of rows) {
    const i = index.get(bucketKey(row.date, granularity));
    if (i !== undefined) out[i] += pick(row);
  }
  return out.map(round2);
}

export default function StatsSalesPage() {
  const meta = useStatsMeta();
  const range = useStatsFilters((s) => s.sales);
  const compare = useStatsFilters((s) => s.compare);
  const basis = useStatsFilters((s) => s.basis);
  const setRange = useStatsFilters((s) => s.setRange);
  const setCompare = useStatsFilters((s) => s.setCompare);
  const setBasis = useStatsFilters((s) => s.setBasis);

  const [parent, setParent] = useState('');
  const [cat, setCat] = useState('');
  const [granularityChoice, setGranularityChoice] = useState<Granularity | 'auto'>('auto');

  const opening = meta?.sales.first ?? OPENING_FALLBACK;
  const resolved = useMemo(() => resolveRange(range, opening), [range, opening]);

  const query = useStatsQuery<SalesStats>(`${resolved.from}|${resolved.to}|${compare}|${parent}|${cat}`, () =>
    statsApi.sales({ ...resolved, compare, parent: parent || null, cat: cat || null }),
  );
  const settings = useStatsQuery('settings', () => statsApi.settings());
  const data = query.data;

  const amount = (row: Amounts) => (basis === 'ht' ? row.ht : row.ttc);
  const prevAmount = (row: PrevAmounts) => (basis === 'ht' ? row.prevHt : row.prevTtc);
  const basisLabel = basis === 'ht' ? 'HT' : 'TTC';
  // "Depuis l'ouverture" n'a rien avant elle : aucune comparaison possible.
  const comparable = range.preset !== 'all';
  const compareLabel = comparable ? COMPARE_LABEL[compare] : undefined;
  const filtered = parent !== '' || cat !== '';
  const delta = (current: number, previous: number, upIsBad = false) =>
    comparable ? <DeltaBadge current={current} previous={previous} upIsBad={upIsBad} /> : undefined;

  const parentOrder = useMemo(() => (meta?.salesCategories ?? []).map((c) => c.parent), [meta]);
  const colorOf = useMemo(() => buildColorMap(parentOrder), [parentOrder]);
  const subCategories = useMemo(
    () => meta?.salesCategories.find((c) => c.parent === parent)?.cats ?? [],
    [meta, parent],
  );

  const granularity: Granularity =
    granularityChoice === 'auto' ? autoGranularity(data?.period.days ?? 1) : granularityChoice;

  // --- serie temporelle principale -----------------------------------------
  const main = useMemo(() => {
    if (!data) return null;
    const buckets = buildBuckets(data.period.from, data.period.to, granularity);
    const index = new Map(buckets.map((b, i) => [b.key, i]));
    const popina = sumByBucket(data.daily, index, buckets.length, granularity, amount);
    const cash = sumByBucket(data.cash.daily, index, buckets.length, granularity, (c) => c.inflow);
    const remises = sumByBucket(data.daily, index, buckets.length, granularity, (d) => d.remises);
    const cashOut = sumByBucket(data.cash.daily, index, buckets.length, granularity, (c) => c.outflow);
    return { buckets, index, popina, cash, remises, cashOut };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, granularity, basis]);

  const withCash = !filtered && !!data && data.cash.current.inflow > 0;

  // Dernier jour reellement importe : au-dela, ce n'est pas "zero vente" mais
  // "pas encore de donnee". Les courbes de tendance s'arretent la.
  const lastImported = meta?.sales.last ?? null;

  const mainSeries = useMemo<ChartSeries[]>(() => {
    if (!main) return [];
    const series: ChartSeries[] = [
      { key: 'popina', label: `Popina ${basisLabel}`, color: ACCENT, values: main.popina, kind: 'bar', stack: 'ca' },
    ];
    if (withCash) {
      series.push({ key: 'cash', label: 'Espèces saisies', color: SERIES_COLORS[1], values: main.cash, kind: 'bar', stack: 'ca' });
    }
    if (granularity === 'day' && main.buckets.length >= 14) {
      const totals = main.popina.map((v, i) => v + (withCash ? main.cash[i] : 0));
      const average = movingAverage(totals, 7).map(round2);
      series.push({
        key: 'avg',
        label: 'Moyenne glissante 7 jours',
        color: INK.primary,
        values: average.map((v, i) => (lastImported && main.buckets[i].key > lastImported ? null : v)),
        kind: 'line',
      });
    }
    return series;
  }, [main, withCash, granularity, basisLabel, lastImported]);

  // Les points morts portent sur le CA total HT : sans objet des qu'on filtre.
  const refLines = useMemo<RefLine[]>(() => {
    if (filtered || basis !== 'ht' || !settings.data) return [];
    const factor = granularity === 'month' ? 1 : granularity === 'week' ? 12 / 52 : 1 / 30;
    return settings.data.breakEven.map((point) => ({ label: point.label, value: Math.round(point.monthly * factor) }));
  }, [filtered, basis, settings.data, granularity]);

  // --- categories ----------------------------------------------------------
  const categoryChart = useMemo(() => {
    if (!data || !main) return null;
    // au jour le jour sur une longue periode, les piles deviennent illisibles
    const g: Granularity = granularity === 'day' && main.buckets.length > 45 ? 'week' : granularity;
    const buckets = g === granularity ? main.buckets : buildBuckets(data.period.from, data.period.to, g);
    const index = new Map(buckets.map((b, i) => [b.key, i]));
    const present = new Set(data.dailyByParent.map((row) => row.parent));
    const keys = parentOrder.filter((p) => present.has(p));
    const colored = keys.filter((p) => isColored(parentOrder, p));
    const others = keys.filter((p) => !isColored(parentOrder, p));

    const series: ChartSeries[] = colored.map((p) => ({
      key: p,
      label: p,
      color: colorOf(p),
      kind: 'bar' as const,
      stack: 'cat',
      values: sumByBucket(
        data.dailyByParent.filter((row) => row.parent === p),
        index,
        buckets.length,
        g,
        amount,
      ),
    }));
    if (others.length > 0) {
      const set = new Set(others);
      series.push({
        key: OTHER_LABEL,
        label: OTHER_LABEL,
        color: OTHER_COLOR,
        kind: 'bar',
        stack: 'cat',
        values: sumByBucket(
          data.dailyByParent.filter((row) => set.has(row.parent)),
          index,
          buckets.length,
          g,
          amount,
        ),
      });
    }
    return { buckets, series, granularity: g };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, main, granularity, parentOrder, colorOf, basis]);

  const breakdown = useMemo<RankedItem[]>(() => {
    if (!data) return [];
    if (parent) {
      // une categorie est choisie : on descend aux sous-categories
      return data.categories
        .filter((row) => Math.abs(amount(row)) >= 0.005)
        .sort((a, b) => amount(b) - amount(a))
        .map((row) => ({
          key: row.cat,
          label: row.cat || 'Sans sous-catégorie',
          value: amount(row),
          active: cat === row.cat,
          trailing: delta(amount(row), prevAmount(row)),
        }));
    }
    const byParent = new Map<string, { cur: number; prev: number }>();
    for (const row of data.categories) {
      const entry = byParent.get(row.parent) ?? { cur: 0, prev: 0 };
      entry.cur += amount(row);
      entry.prev += prevAmount(row);
      byParent.set(row.parent, entry);
    }
    return [...byParent.entries()]
      .filter(([, v]) => Math.abs(v.cur) >= 0.005)
      .sort((a, b) => b[1].cur - a[1].cur)
      .map(([key, v]) => ({
        key,
        label: key,
        value: round2(v.cur),
        color: colorOf(key),
        trailing: delta(v.cur, v.prev),
      }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, parent, cat, colorOf, basis, comparable]);

  // --- heures et jours -----------------------------------------------------
  const timing = useMemo(() => {
    if (!data) return null;
    const active = data.hours.filter((h) => amount(h) > 0);
    if (active.length === 0) return null;
    // ordre de service : la soiree continue apres minuit, on ne coupe pas a 0h
    const service = (h: number) => (h + 24 - 6) % 24;
    const positions = active.map((h) => service(h.hour));
    const first = Math.min(...positions);
    const last = Math.max(...positions);
    const hours = Array.from({ length: last - first + 1 }, (_, i) => (first + i + 6) % 24);
    const col = new Map(hours.map((h, i) => [h, i]));
    const total = active.reduce((sum, h) => sum + amount(h), 0);

    const cells: HeatCell[] = active.map((h) => ({
      row: h.dow,
      col: col.get(h.hour) as number,
      value: amount(h),
      detail: `${WEEKDAYS[h.dow]} de ${h.hour}h à ${(h.hour + 1) % 24}h : ${fmtEur(amount(h))}, soit ${fmtPct(amount(h) / total)} du CA, sur ${fmtInt(h.tickets)} tickets`,
    }));

    const byHour = hours.map((hour) => round2(active.filter((h) => h.hour === hour).reduce((s, h) => s + amount(h), 0)));
    const byDow = WEEKDAYS.map((_, dow) => round2(active.filter((h) => h.dow === dow).reduce((s, h) => s + amount(h), 0)));
    // jours ouverts par jour de semaine, pour une moyenne honnete
    const openByDow = new Array<number>(7).fill(0);
    for (const day of data.daily) {
      if (day.lines > 0) openByDow[(new Date(parseISO(day.date)).getUTCDay() + 6) % 7] += 1;
    }
    const avgByDow = byDow.map((v, i) => (openByDow[i] > 0 ? round2(v / openByDow[i]) : 0));
    return { hours, cells, byHour, byDow, avgByDow, openByDow, total };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, basis]);

  // --- tuiles --------------------------------------------------------------
  const trend = useMemo(() => {
    if (!data) return null;
    const g: Granularity = data.period.days <= 62 ? 'day' : data.period.days <= 500 ? 'week' : 'month';
    const until = lastImported && lastImported < data.period.to && lastImported >= data.period.from ? lastImported : data.period.to;
    const buckets = buildBuckets(data.period.from, until, g);
    const index = new Map(buckets.map((b, i) => [b.key, i]));
    const ca = sumByBucket(data.daily, index, buckets.length, g, amount);
    const tickets = sumByBucket(data.daily, index, buckets.length, g, (d) => d.tickets);
    const qty = sumByBucket(data.daily, index, buckets.length, g, (d) => d.qty);
    return { ca, tickets, qty, basket: ca.map((v, i) => (tickets[i] > 0 ? v / tickets[i] : 0)) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, basis, lastImported]);

  const cur = data?.totals.current;
  const prev = data?.totals.previous;
  const ratio = (a: number, b: number) => (b > 0 ? a / b : 0);

  return (
    <StatsLayout
      subtitle="Ventes Popina : chiffre d'affaires, tickets, catégories, produits, heures et jours."
      meta={meta}
      loading={!data && query.loading}
      error={query.error}
      onRetry={query.reload}
      filters={
        <>
          <DateRangeControl range={range} resolved={resolved} onChange={(next) => setRange('sales', next)} />
          <FilterSelect label="Comparer à" value={compare} onChange={(v) => setCompare(v as CompareMode)} disabled={!comparable}>
            <option value="previous">Comparer à la période précédente</option>
            <option value="year">Comparer à la même période N-1</option>
          </FilterSelect>
          <FilterSelect
            label="Catégorie"
            value={parent}
            active={parent !== ''}
            onChange={(v) => {
              setParent(v);
              setCat('');
            }}
          >
            <option value="">Toutes les catégories</option>
            {(meta?.salesCategories ?? []).map((c) => (
              <option key={c.parent} value={c.parent}>
                {c.parent}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect label="Sous-catégorie" value={cat} active={cat !== ''} onChange={setCat} disabled={!parent}>
            <option value="">{parent ? 'Toutes les sous-catégories' : 'Sous-catégorie'}</option>
            {subCategories.map((c) => (
              <option key={c.cat} value={c.cat}>
                {c.cat}
              </option>
            ))}
          </FilterSelect>
          <Segmented
            ariaLabel="Montants hors taxes ou toutes taxes"
            value={basis}
            onChange={setBasis}
            options={[
              { value: 'ht', label: 'HT' },
              { value: 'ttc', label: 'TTC' },
            ]}
          />
          {filtered && (
            <button
              type="button"
              onClick={() => {
                setParent('');
                setCat('');
              }}
              className="inline-flex items-center gap-1 px-2 py-2 text-sm text-gray-500 hover:text-gray-900"
            >
              <X className="w-4 h-4" aria-hidden="true" />
              Retirer le filtre
            </button>
          )}
        </>
      }
    >
      {data && cur && prev && main && (
        <Refreshing active={query.loading}>
          <div className="space-y-5">
            {/* chiffres cles */}
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
              <StatTile
                label={`Chiffre d'affaires ${basisLabel}`}
                value={fmtEur(amount(cur))}
                delta={delta(amount(cur), amount(prev))}
                compareLabel={compareLabel}
                trend={trend?.ca}
              />
              <StatTile
                label="Tickets"
                value={fmtInt(cur.tickets)}
                delta={delta(cur.tickets, prev.tickets)}
                compareLabel={compareLabel}
                hint={data.period.from < '2026-01-01' ? 'Avant 2026 : tickets reconstitués, à 1 ou 2 % près' : undefined}
                trend={trend?.tickets}
              />
              <StatTile
                label="Panier moyen"
                value={fmtEur2(ratio(amount(cur), cur.tickets))}
                delta={delta(ratio(amount(cur), cur.tickets), ratio(amount(prev), prev.tickets))}
                compareLabel={compareLabel}
                trend={trend?.basket}
              />
              <StatTile
                label="Articles vendus"
                value={fmtInt(cur.qty)}
                delta={delta(cur.qty, prev.qty)}
                compareLabel={compareLabel}
                trend={trend?.qty}
              />
              <StatTile
                label="CA moyen par jour ouvert"
                value={fmtEur(ratio(amount(cur), cur.openDays))}
                delta={delta(ratio(amount(cur), cur.openDays), ratio(amount(prev), prev.openDays))}
                compareLabel={compareLabel}
                hint={`${fmtInt(cur.openDays)} jours avec ventes sur ${fmtInt(data.period.days)}`}
              />
              <StatTile
                label="Prix moyen par article"
                value={fmtEur2(ratio(amount(cur), cur.qty))}
                delta={delta(ratio(amount(cur), cur.qty), ratio(amount(prev), prev.qty))}
                compareLabel={compareLabel}
                hint={`${ratio(cur.qty, cur.tickets).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} articles par ticket`}
              />
              <StatTile
                label="Remises accordées"
                value={fmtEur(cur.remises)}
                delta={delta(cur.remises, prev.remises, true)}
                compareLabel={compareLabel}
                hint={`${fmtPct(ratio(cur.remises, cur.brut))} du CA avant remise`}
              />
              <StatTile
                label="Espèces saisies en caisse"
                value={fmtEur(data.cash.current.inflow)}
                delta={delta(data.cash.current.inflow, data.cash.previous.inflow)}
                compareLabel={compareLabel}
                hint={`Sorties : ${fmtEur(Math.abs(data.cash.current.outflow))}${filtered ? ' · non filtré par catégorie' : ''}`}
              />
            </div>

            {/* chiffre d'affaires dans le temps */}
            <ChartCard
              title="Chiffre d'affaires"
              subtitle={
                withCash
                  ? `Ventes Popina ${basisLabel} et espèces saisies sur la page Comptabilité.${refLines.length ? ' Pointillés : points morts.' : ''}`
                  : `Ventes Popina ${basisLabel}${filtered ? ' de la sélection' : ''}.`
              }
              actions={
                <Segmented
                  ariaLabel="Regroupement dans le temps"
                  value={granularity}
                  onChange={setGranularityChoice}
                  options={(['day', 'week', 'month'] as Granularity[]).map((g) => ({ value: g, label: GRANULARITY_LABEL[g] }))}
                />
              }
              table={seriesTable(
                GRANULARITY_LABEL[granularity],
                main.buckets.map((b) => b.longLabel),
                mainSeries,
                fmtEur,
              )}
            >
              <TimeChart
                ariaLabel={`Chiffre d'affaires par ${GRANULARITY_LABEL[granularity].toLowerCase()}`}
                labels={main.buckets.map((b) => b.label)}
                longLabels={main.buckets.map((b) => b.longLabel)}
                series={mainSeries}
                format={fmtEur}
                axisFormat={fmtEurAxis}
                refLines={refLines}
                totalLabel="Total"
                annotateMax
                height={320}
              />
            </ChartCard>

            {/* categories */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
              {categoryChart && (
                <ChartCard
                  className="xl:col-span-2"
                  title="Catégories dans le temps"
                  subtitle={`CA ${basisLabel} par ${GRANULARITY_LABEL[categoryChart.granularity].toLowerCase()}, empilé par catégorie.`}
                  table={seriesTable(
                    GRANULARITY_LABEL[categoryChart.granularity],
                    categoryChart.buckets.map((b) => b.longLabel),
                    categoryChart.series,
                    fmtEur,
                  )}
                >
                  <TimeChart
                    ariaLabel="Chiffre d'affaires par catégorie dans le temps"
                    labels={categoryChart.buckets.map((b) => b.label)}
                    longLabels={categoryChart.buckets.map((b) => b.longLabel)}
                    series={categoryChart.series}
                    format={fmtEur}
                    axisFormat={fmtEurAxis}
                    totalLabel="Total"
                    legend
                    height={300}
                  />
                </ChartCard>
              )}
              <ChartCard
                title={parent ? `Sous-catégories de ${parent}` : 'Répartition par catégorie'}
                subtitle={parent ? 'Cliquez pour isoler une sous-catégorie.' : 'Cliquez une catégorie pour filtrer toute la page.'}
              >
                <RankedBars
                  items={breakdown}
                  format={fmtEur}
                  limit={9}
                  onSelect={(key) => {
                    if (parent) setCat(cat === key ? '' : key);
                    else setParent(key);
                  }}
                />
              </ChartCard>
            </div>

            {/* produits */}
            <ProductsCard data={data} basis={basis} colorOf={colorOf} compareLabel={compareLabel} />

            {/* quand vend-on */}
            {timing && (
              <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
                <ChartCard
                  className="xl:col-span-2"
                  title="Quand vend-on ?"
                  subtitle={`CA ${basisLabel} par jour de la semaine et par heure d'encaissement.`}
                  table={{
                    columns: ['Jour', ...timing.hours.map((h) => `${h}h`)],
                    rows: WEEKDAYS.map((day, dow) => [
                      day,
                      ...timing.hours.map((_, col) => {
                        const cell = timing.cells.find((c) => c.row === dow && c.col === col);
                        return cell ? fmtEur(cell.value) : '-';
                      }),
                    ]),
                  }}
                >
                  <Heatmap
                    ariaLabel="Carte de chaleur du chiffre d'affaires par jour de la semaine et par heure"
                    rowLabels={WEEKDAYS_SHORT}
                    colLabels={timing.hours.map((h) => `${h}h`)}
                    cells={timing.cells}
                    cellHeight={46}
                  />
                </ChartCard>

                <div className="grid grid-cols-1 gap-5">
                  <ChartCard
                    title="Par heure"
                    subtitle={`CA ${basisLabel} cumulé sur la période, par heure d'encaissement.`}
                    table={{
                      columns: ['Heure', `CA ${basisLabel}`, 'Part'],
                      rows: timing.hours.map((h, i) => [`${h}h`, fmtEur(timing.byHour[i]), fmtPct(timing.byHour[i] / timing.total)]),
                    }}
                  >
                    <TimeChart
                      ariaLabel="Chiffre d'affaires par heure"
                      labels={timing.hours.map((h) => `${h}h`)}
                      longLabels={timing.hours.map((h) => `De ${h}h à ${(h + 1) % 24}h`)}
                      series={[{ key: 'hour', label: `CA ${basisLabel}`, color: ACCENT, values: timing.byHour, kind: 'bar' }]}
                      format={fmtEur}
                      axisFormat={fmtEurAxis}
                      annotateMax
                      height={150}
                    />
                  </ChartCard>
                  <ChartCard
                    title="Par jour de la semaine"
                    subtitle={`CA ${basisLabel} moyen d'un jour ouvert.`}
                    table={{
                      columns: ['Jour', 'Moyenne', 'Jours ouverts', 'Total', 'Part'],
                      rows: WEEKDAYS.map((day, i) => [
                        day,
                        fmtEur(timing.avgByDow[i]),
                        fmtInt(timing.openByDow[i]),
                        fmtEur(timing.byDow[i]),
                        fmtPct(timing.byDow[i] / timing.total),
                      ]),
                    }}
                  >
                    <TimeChart
                      ariaLabel="Chiffre d'affaires moyen par jour de la semaine"
                      labels={WEEKDAYS_SHORT}
                      longLabels={WEEKDAYS.map((day, i) => `${day} · ${fmtInt(timing.openByDow[i])} jours ouverts`)}
                      series={[{ key: 'dow', label: 'CA moyen', color: ACCENT, values: timing.avgByDow, kind: 'bar' }]}
                      format={fmtEur}
                      axisFormat={fmtEurAxis}
                      annotateMax
                      height={150}
                    />
                  </ChartCard>
                </div>
              </div>
            )}

            {/* tarifs, zones, remises */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
              <ChartCard title="Happy hour" subtitle={`Part du CA ${basisLabel} vendue au tarif happy hour.`}>
                <SegmentedBar
                  format={fmtEur}
                  segments={[...data.tiers]
                    .sort((a, b) => (a.tier === 'Normal' ? -1 : b.tier === 'Normal' ? 1 : amount(b) - amount(a)))
                    .map((t, i) => ({
                      key: t.tier,
                      label: t.tier || 'Sans tarif',
                      value: amount(t),
                      color: SERIES_COLORS[Math.min(i, SERIES_COLORS.length - 1)],
                    }))}
                />
              </ChartCard>
              <ChartCard title="Par zone" subtitle={`CA ${basisLabel} selon la salle saisie sur Popina.`}>
                <RankedBars
                  format={fmtEur}
                  limit={6}
                  items={[...data.rooms]
                    .sort((a, b) => amount(b) - amount(a))
                    .map((room) => ({
                      key: room.room,
                      label: room.room || 'Sans zone',
                      value: amount(room),
                      sub: `${fmtInt(room.tickets)} tickets · panier ${fmtEur2(ratio(amount(room), room.tickets))}`,
                    }))}
                />
              </ChartCard>
              <ChartCard
                title="Remises"
                subtitle={`${fmtEur(cur.remises)} accordés, soit ${fmtPct(ratio(cur.remises, cur.brut))} du CA avant remise.`}
                table={seriesTable(
                  GRANULARITY_LABEL[granularity],
                  main.buckets.map((b) => b.longLabel),
                  [{ key: 'remises', label: 'Remises', color: ACCENT, values: main.remises, kind: 'bar' }],
                  fmtEur,
                )}
              >
                <TimeChart
                  ariaLabel="Remises accordées dans le temps"
                  labels={main.buckets.map((b) => b.label)}
                  longLabels={main.buckets.map((b) => b.longLabel)}
                  series={[{ key: 'remises', label: 'Remises', color: ACCENT, values: main.remises, kind: 'bar' }]}
                  format={fmtEur}
                  axisFormat={fmtEurAxis}
                  height={200}
                />
              </ChartCard>
            </div>

            {/* especes */}
            <ChartCard
              title="Espèces"
              subtitle={`Mouvements saisis sur la page Comptabilité${filtered ? ' (non filtrés par catégorie)' : ''}. Solde de la période : ${fmtEur(
                data.cash.current.inflow + data.cash.current.outflow,
              )}.`}
              table={seriesTable(
                GRANULARITY_LABEL[granularity],
                main.buckets.map((b) => b.longLabel),
                [
                  { key: 'in', label: 'Entrées', color: ACCENT, values: main.cash, kind: 'bar' },
                  { key: 'out', label: 'Sorties', color: SERIES_COLORS[1], values: main.cashOut, kind: 'bar' },
                ],
                fmtEur,
              )}
            >
              <TimeChart
                ariaLabel="Entrées et sorties d'espèces dans le temps"
                labels={main.buckets.map((b) => b.label)}
                longLabels={main.buckets.map((b) => b.longLabel)}
                series={[
                  { key: 'in', label: 'Entrées', color: ACCENT, values: main.cash, kind: 'bar', stack: 'cash' },
                  { key: 'out', label: 'Sorties', color: SERIES_COLORS[1], values: main.cashOut, kind: 'bar', stack: 'cash' },
                ]}
                format={fmtEur}
                axisFormat={fmtEurAxis}
                height={220}
              />
            </ChartCard>
          </div>
        </Refreshing>
      )}
    </StatsLayout>
  );
}

// ---------------------------------------------------------------------------
// Produits : classement triable + plus fortes variations
// ---------------------------------------------------------------------------

type SortKey = 'name' | 'amount' | 'qty' | 'price' | 'delta';

function ProductsCard({
  data,
  basis,
  colorOf,
  compareLabel,
}: {
  data: SalesStats;
  basis: 'ht' | 'ttc';
  colorOf: (parent: string) => string;
  /** Absent quand la periode n'a pas de comparaison (depuis l'ouverture). */
  compareLabel?: string;
}) {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'amount', dir: -1 });
  const [visible, setVisible] = useState(12);

  const amount = (row: SalesProductRow) => (basis === 'ht' ? row.ht : row.ttc);
  const prevAmount = (row: SalesProductRow) => (basis === 'ht' ? row.prevHt : row.prevTtc);

  const sold = useMemo(() => data.products.filter((p) => p.qty !== 0 || p.ht !== 0), [data]);
  const total = useMemo(() => sold.reduce((sum, p) => sum + (basis === 'ht' ? p.ht : p.ttc), 0), [sold, basis]);
  const max = useMemo(() => Math.max(...sold.map((p) => (basis === 'ht' ? p.ht : p.ttc)), 1e-9), [sold, basis]);

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const list = needle
      ? sold.filter((p) => `${p.name} ${p.parent} ${p.cat}`.toLowerCase().includes(needle))
      : sold;
    const value = (p: SalesProductRow): number | string => {
      switch (sort.key) {
        case 'name':
          return p.name.toLowerCase();
        case 'qty':
          return p.qty;
        case 'price':
          return p.qty > 0 ? amount(p) / p.qty : 0;
        case 'delta':
          return deltaRatio(amount(p), prevAmount(p)) ?? -Infinity;
        default:
          return amount(p);
      }
    };
    return [...list].sort((a, b) => {
      const va = value(a);
      const vb = value(b);
      if (typeof va === 'string' || typeof vb === 'string') return String(va).localeCompare(String(vb), 'fr') * sort.dir;
      return (va - vb) * sort.dir;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sold, search, sort, basis]);

  const movers = useMemo(() => {
    const diffs = data.products
      .map((p) => ({ p, diff: amount(p) - prevAmount(p) }))
      .filter((m) => Math.abs(m.diff) >= 1);
    return {
      up: diffs.filter((m) => m.diff > 0).sort((a, b) => b.diff - a.diff).slice(0, 5),
      down: diffs.filter((m) => m.diff < 0).sort((a, b) => a.diff - b.diff).slice(0, 5),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, basis]);

  const header = (key: SortKey, label: string, align: 'left' | 'right') => {
    const active = sort.key === key;
    const Arrow = sort.dir === 1 ? ArrowUp : ArrowDown;
    return (
      <th className={`px-3 py-2.5 font-medium ${align === 'right' ? 'text-right' : 'text-left'}`} aria-sort={active ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
        <button
          type="button"
          onClick={() => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : key === 'name' ? 1 : -1 }))}
          className={`inline-flex items-center gap-1 uppercase tracking-wider hover:text-gray-900 ${active ? 'text-gray-900' : ''}`}
        >
          {label}
          {active && <Arrow className="w-3 h-3" aria-hidden="true" />}
        </button>
      </th>
    );
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
      <ChartCard
        className={compareLabel ? 'xl:col-span-2' : 'xl:col-span-3'}
        title="Produits"
        subtitle={`${fmtInt(sold.length)} produits vendus sur la période.`}
        actions={
          <label className="relative">
            <span className="sr-only">Rechercher un produit</span>
            <Search className="w-4 h-4 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" aria-hidden="true" />
            <input
              type="search"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setVisible(12);
              }}
              placeholder="Rechercher"
              className="w-44 rounded-lg border border-gray-300 pl-8 pr-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/40"
            />
          </label>
        }
      >
        {rows.length === 0 ? (
          <EmptyState>Aucun produit ne correspond.</EmptyState>
        ) : (
          <>
            <div className="overflow-x-auto -mx-5">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-xs text-gray-500">
                    <th className="pl-5 pr-2 py-2.5 font-medium text-left w-10">#</th>
                    {header('name', 'Produit', 'left')}
                    {header('amount', `CA ${basis === 'ht' ? 'HT' : 'TTC'}`, 'right')}
                    <th className="px-3 py-2.5 font-medium text-left uppercase tracking-wider w-36">Part</th>
                    {header('qty', 'Qté', 'right')}
                    {header('price', 'Prix moyen', 'right')}
                    {compareLabel && (
                      <th className="pl-3 pr-5 py-2.5 font-medium text-right" aria-sort={sort.key === 'delta' ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
                        <button
                          type="button"
                          onClick={() => setSort((s) => ({ key: 'delta', dir: s.key === 'delta' && s.dir === -1 ? 1 : -1 }))}
                          className={`uppercase tracking-wider hover:text-gray-900 ${sort.key === 'delta' ? 'text-gray-900' : ''}`}
                          title={compareLabel}
                        >
                          Évolution
                        </button>
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {rows.slice(0, visible).map((p, i) => {
                    const value = amount(p);
                    return (
                      <tr key={`${p.name}|${p.parent}|${p.cat}`} className="hover:bg-gray-50 transition">
                        <td className="pl-5 pr-2 py-2 text-gray-400 tabular-nums">{i + 1}</td>
                        <td className="px-3 py-2">
                          <span className="font-medium text-gray-900">{p.name}</span>
                          <span className="flex items-center gap-1.5 text-xs text-gray-500 mt-0.5">
                            <span className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: colorOf(p.parent) }} aria-hidden="true" />
                            {p.parent}
                            {p.cat ? ` · ${p.cat}` : ''}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right font-semibold text-gray-900 tabular-nums whitespace-nowrap">{fmtEur(value)}</td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 flex-1 rounded-full bg-gray-100 overflow-hidden">
                              <div className="h-full rounded-full" style={{ width: `${Math.max(1, (value / max) * 100)}%`, backgroundColor: ACCENT }} />
                            </div>
                            <span className="w-11 text-right text-xs text-gray-500 tabular-nums">{fmtPct(total > 0 ? value / total : 0)}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right text-gray-700 tabular-nums">{fmtInt(p.qty)}</td>
                        <td className={`py-2 text-right text-gray-700 tabular-nums whitespace-nowrap ${compareLabel ? 'px-3' : 'pl-3 pr-5'}`}>
                          {p.qty > 0 ? fmtEur2(value / p.qty) : '-'}
                        </td>
                        {compareLabel && (
                          <td className="pl-3 pr-5 py-2 text-right whitespace-nowrap">
                            <DeltaBadge current={value} previous={prevAmount(p)} />
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {rows.length > visible && (
              <button type="button" onClick={() => setVisible((v) => v + 25)} className="mt-3 text-sm text-primary-600 hover:underline">
                Afficher 25 de plus ({fmtInt(rows.length - visible)} restants)
              </button>
            )}
          </>
        )}
      </ChartCard>

      {compareLabel && (
        <div className="grid grid-cols-1 gap-5 content-start">
          <MoversCard title="Plus fortes hausses" compareLabel={compareLabel} movers={movers.up} amount={amount} prevAmount={prevAmount} />
          <MoversCard title="Plus fortes baisses" compareLabel={compareLabel} movers={movers.down} amount={amount} prevAmount={prevAmount} />
        </div>
      )}
    </div>
  );
}

function MoversCard({
  title,
  compareLabel,
  movers,
  amount,
  prevAmount,
}: {
  title: string;
  compareLabel: string;
  movers: Array<{ p: SalesProductRow; diff: number }>;
  amount: (row: SalesProductRow) => number;
  prevAmount: (row: SalesProductRow) => number;
}) {
  return (
    <ChartCard title={title} subtitle={`En euros de CA, ${compareLabel}.`}>
      {movers.length === 0 ? (
        <EmptyState>Rien à signaler.</EmptyState>
      ) : (
        <ul className="divide-y divide-gray-100">
          {movers.map(({ p, diff }) => (
            <li key={`${p.name}|${p.parent}|${p.cat}`} className="flex items-center gap-3 py-2">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{p.name}</p>
                <p className="text-xs text-gray-500">
                  {fmtEur(prevAmount(p))} puis {fmtEur(amount(p))}
                </p>
              </div>
              <span className={`ml-auto inline-flex items-center gap-0.5 text-sm font-semibold tabular-nums whitespace-nowrap ${diff > 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                {diff > 0 ? <ArrowUp className="w-3.5 h-3.5" aria-hidden="true" /> : <ArrowDown className="w-3.5 h-3.5" aria-hidden="true" />}
                {diff > 0 ? '+' : '-'}
                {fmtEur(Math.abs(diff))}
              </span>
            </li>
          ))}
        </ul>
      )}
    </ChartCard>
  );
}
