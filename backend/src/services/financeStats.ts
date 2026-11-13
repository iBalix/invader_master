/**
 * Stats finance : agregats en lecture pour la section Stats du back-office
 * (ventes Popina, tresorerie Tiime, suivi de rentabilite).
 *
 * Source unique : MySQL legacy OVH (base `invader`), comme financeReport.ts.
 *   - `sales` : lignes de vente Popina (import finances)
 *   - `flux`  : operations bancaires Tiime (import finances)
 *   - `Cash`  : mouvements d'especes saisis sur la page Comptabilite
 * Le miroir Supabase des ventes n'est plus alimente, il ne faut pas le lire.
 *
 * Regles de calcul, toutes verifiees contre l'ancien rapport Looker Studio :
 *   - une vente = une ligne produit (`parent <> ''`). Les lignes de recap de
 *     ticket (Total / Paiement / Pourboire / Rendu) presentes avant 2026 ont un
 *     `parent` vide : les compter doublerait le CA.
 *   - CA HT = SUM(ht), CA TTC = SUM(net) (remises deduites).
 *   - CA total d'un mois = CA Popina + entrees d'especes (Cash.montant > 0).
 *   - marge brute = 1 - achats de matieres premieres / encaissements, les deux
 *     lus dans `flux`. Les avoirs fournisseurs (montants positifs de la
 *     categorie) viennent en deduction des achats.
 *   - un jour = jour calendaire (00h00 a 23h59), comme le rapport financier.
 */

import type { RowDataPacket } from 'mysql2';
import { getMysqlPool } from '../config/mysql.js';

const DAY_MS = 86400000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Categorie `flux` des recettes deposees en banque (CB, especes). */
export const REVENUE_CATEGORY = 'encaissement';
/** Categorie `flux` des achats revendus (boissons, food). */
export const COGS_CATEGORY = 'matières premières';
/** Cle renvoyee pour les operations sans categorie (NULL ou vide en base). */
export const UNCATEGORIZED = '';

/**
 * L'identifiant de ticket Popina n'est fiable qu'a partir de 2026 : sur les
 * imports anterieurs la colonne porte le jour du mois. Avant cette date, un
 * ticket est reconstitue par (minute d'encaissement, salle, table), ce qui
 * s'ecarte de 1,5 % du vrai compte sur 2026 (11 678 contre 11 855).
 */
const TICKET_RELIABLE_FROM = '2026-01-01';
const TICKET_KEY = `IF(date >= '${TICKET_RELIABLE_FROM}', CONCAT('t', ticket), CONCAT(DATE_FORMAT(date, '%Y%m%d%H%i'), '|', salle, '|', table_number))`;

const FLUX_CAT = `COALESCE(NULLIF(TRIM(category), ''), '')`;
const FLUX_LABEL = `COALESCE(NULLIF(TRIM(label), ''), '')`;

// ---------------------------------------------------------------------------
// Dates et periodes
// ---------------------------------------------------------------------------

/** Parse `YYYY-MM-DD` en timestamp UTC, ou null si la date n'existe pas. */
export function parseDay(value: unknown): number | null {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return null;
  const [y, m, d] = value.split('-').map(Number);
  const ts = Date.UTC(y, m - 1, d);
  const back = new Date(ts);
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== m - 1 || back.getUTCDate() !== d) {
    return null;
  }
  return ts;
}

export function toDay(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}

export type CompareMode = 'previous' | 'year';

export interface Period {
  from: string;
  to: string;
  days: number;
}

function shiftYear(ts: number, delta: number): number {
  const d = new Date(ts);
  d.setUTCFullYear(d.getUTCFullYear() + delta);
  return d.getTime();
}

/**
 * Periode demandee et periode de comparaison : soit la periode de meme duree
 * qui precede immediatement, soit les memes dates un an plus tot.
 */
export function resolvePeriods(
  fromTs: number,
  toTs: number,
  compare: CompareMode,
): { current: Period; previous: Period } {
  const days = Math.round((toTs - fromTs) / DAY_MS) + 1;
  const current: Period = { from: toDay(fromTs), to: toDay(toTs), days };

  if (compare === 'year') {
    const pFrom = shiftYear(fromTs, -1);
    const pTo = shiftYear(toTs, -1);
    return {
      current,
      previous: { from: toDay(pFrom), to: toDay(pTo), days: Math.round((pTo - pFrom) / DAY_MS) + 1 },
    };
  }

  const pTo = fromTs - DAY_MS;
  const pFrom = pTo - (days - 1) * DAY_MS;
  return { current, previous: { from: toDay(pFrom), to: toDay(pTo), days } };
}

/**
 * Bornes SQL d'une periode sur une colonne DATETIME. Les dates viennent de
 * toDay() (jamais de la requete HTTP brute), elles sont sures a inliner.
 */
function datetimeRange(p: Period, column = 'date'): string {
  const endExclusive = toDay((parseDay(p.to) as number) + DAY_MS);
  return `(${column} >= '${p.from} 00:00:00' AND ${column} < '${endExclusive} 00:00:00')`;
}

/** Bornes SQL d'une periode sur une colonne DATE. */
function dateRange(p: Period, column = 'date'): string {
  return `(${column} >= '${p.from}' AND ${column} <= '${p.to}')`;
}

// ---------------------------------------------------------------------------
// Outils
// ---------------------------------------------------------------------------

/** Les montants sont des FLOAT MySQL : SUM() laisse des residus, on arrondit. */
function r2(v: unknown): number {
  return Math.round(Number(v ?? 0) * 100) / 100;
}

function int(v: unknown): number {
  return Math.round(Number(v ?? 0));
}

async function query<T = RowDataPacket>(sql: string, params: unknown[] = []): Promise<T[]> {
  const [rows] = await getMysqlPool().query<RowDataPacket[]>(sql, params);
  return rows as unknown as T[];
}

/**
 * Cache memoire court. Les donnees ne changent qu'a l'import ou a une saisie
 * d'especes (qui vident le cache), et un meme ecran relance plusieurs fois la
 * meme requete en changeant d'onglet.
 */
const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { at: number; value: Promise<unknown> }>();

function cached<T>(key: string, compute: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value as Promise<T>;
  const value = compute();
  cache.set(key, { at: Date.now(), value });
  // un echec ne doit pas rester en cache
  value.catch(() => cache.delete(key));
  if (cache.size > 200) {
    const oldest = [...cache.entries()].sort((a, b) => a[1].at - b[1].at)[0];
    if (oldest) cache.delete(oldest[0]);
  }
  return value;
}

/** A appeler apres toute ecriture dans sales, flux ou Cash. */
export function invalidateStatsCache(): void {
  cache.clear();
}

// ---------------------------------------------------------------------------
// Meta : etendue des donnees et valeurs de filtres
// ---------------------------------------------------------------------------

export interface StatsMeta {
  sales: { first: string | null; last: string | null; lines: number };
  flux: { first: string | null; last: string | null; rows: number };
  cash: { first: string | null; last: string | null };
  /** Categories de vente, de la plus vendue a la moins vendue. */
  salesCategories: Array<{
    parent: string;
    ht: number;
    last: string;
    cats: Array<{ cat: string; ht: number; last: string }>;
  }>;
  /** Categories bancaires, de la plus depensiere a la moins depensiere. */
  fluxCategories: Array<{ category: string; rows: number; inflow: number; outflow: number }>;
}

export function getStatsMeta(): Promise<StatsMeta> {
  return cached('meta', async () => {
    const [salesRange, salesCats, fluxRange, fluxCats, cashRange] = await Promise.all([
      query(
        `SELECT DATE_FORMAT(MIN(date), '%Y-%m-%d') first, DATE_FORMAT(MAX(date), '%Y-%m-%d') last, COUNT(*) n
           FROM sales WHERE parent <> ''`,
      ),
      query(
        `SELECT TRIM(parent) p, TRIM(cat) c, SUM(ht) ht, DATE_FORMAT(MAX(date), '%Y-%m-%d') last
           FROM sales WHERE parent <> '' GROUP BY p, c`,
      ),
      query(
        `SELECT DATE_FORMAT(MIN(date), '%Y-%m-%d') first, DATE_FORMAT(MAX(date), '%Y-%m-%d') last, COUNT(*) n FROM flux`,
      ),
      query(
        `SELECT ${FLUX_CAT} c, COUNT(*) n,
                SUM(IF(amount > 0, amount, 0)) inflow, SUM(IF(amount < 0, amount, 0)) outflow
           FROM flux GROUP BY c ORDER BY outflow ASC`,
      ),
      query(
        `SELECT DATE_FORMAT(MIN(date), '%Y-%m-%d') first, DATE_FORMAT(MAX(date), '%Y-%m-%d') last FROM Cash`,
      ),
    ]);

    const byParent = new Map<string, StatsMeta['salesCategories'][number]>();
    for (const row of salesCats) {
      const parent = String(row.p);
      const entry = byParent.get(parent) ?? { parent, ht: 0, last: '', cats: [] };
      entry.ht = r2(entry.ht + Number(row.ht ?? 0));
      if (String(row.last) > entry.last) entry.last = String(row.last);
      entry.cats.push({ cat: String(row.c), ht: r2(row.ht), last: String(row.last) });
      byParent.set(parent, entry);
    }
    const salesCategories = [...byParent.values()].sort((a, b) => b.ht - a.ht);
    for (const entry of salesCategories) entry.cats.sort((a, b) => b.ht - a.ht);

    return {
      sales: {
        first: (salesRange[0]?.first as string) ?? null,
        last: (salesRange[0]?.last as string) ?? null,
        lines: int(salesRange[0]?.n),
      },
      flux: {
        first: (fluxRange[0]?.first as string) ?? null,
        last: (fluxRange[0]?.last as string) ?? null,
        rows: int(fluxRange[0]?.n),
      },
      cash: {
        first: (cashRange[0]?.first as string) ?? null,
        last: (cashRange[0]?.last as string) ?? null,
      },
      salesCategories,
      fluxCategories: fluxCats.map((row) => ({
        category: String(row.c),
        rows: int(row.n),
        inflow: r2(row.inflow),
        outflow: r2(row.outflow),
      })),
    };
  });
}

// ---------------------------------------------------------------------------
// Ventes (Popina)
// ---------------------------------------------------------------------------

export interface SalesQuery {
  fromTs: number;
  toTs: number;
  compare: CompareMode;
  parent?: string;
  cat?: string;
}

export interface SalesTotals {
  ht: number;
  ttc: number;
  brut: number;
  remises: number;
  tva: number;
  /** Nombre d'articles (somme des quantites). */
  qty: number;
  /** Nombre de lignes de vente. */
  lines: number;
  tickets: number;
  /** Jours ayant au moins une vente. */
  openDays: number;
}

export interface SalesStats {
  period: Period;
  previous: Period;
  filter: { parent: string | null; cat: string | null };
  totals: { current: SalesTotals; previous: SalesTotals };
  /** Un point par jour de la periode, jours sans vente compris. */
  daily: Array<{
    date: string;
    ht: number;
    ttc: number;
    brut: number;
    remises: number;
    qty: number;
    lines: number;
    tickets: number;
  }>;
  dailyByParent: Array<{ date: string; parent: string; ht: number; ttc: number; qty: number }>;
  categories: Array<{
    parent: string;
    cat: string;
    ht: number;
    ttc: number;
    qty: number;
    prevHt: number;
    prevTtc: number;
    prevQty: number;
  }>;
  products: Array<{
    name: string;
    parent: string;
    cat: string;
    ht: number;
    ttc: number;
    qty: number;
    prevHt: number;
    prevTtc: number;
    prevQty: number;
  }>;
  /** dow : 0 = lundi ... 6 = dimanche. */
  hours: Array<{
    dow: number;
    hour: number;
    ht: number;
    ttc: number;
    qty: number;
    tickets: number;
    prevHt: number;
    prevTtc: number;
  }>;
  tiers: Array<{ tier: string; ht: number; ttc: number; qty: number }>;
  rooms: Array<{ room: string; ht: number; ttc: number; qty: number; tickets: number }>;
  /** Especes saisies sur la page Comptabilite (jamais filtrees par categorie). */
  cash: {
    daily: Array<{ date: string; inflow: number; outflow: number }>;
    current: { inflow: number; outflow: number };
    previous: { inflow: number; outflow: number };
  };
}

function emptySalesTotals(): SalesTotals {
  return { ht: 0, ttc: 0, brut: 0, remises: 0, tva: 0, qty: 0, lines: 0, tickets: 0, openDays: 0 };
}

export function getSalesStats(q: SalesQuery): Promise<SalesStats> {
  const { current, previous } = resolvePeriods(q.fromTs, q.toTs, q.compare);
  const key = `sales|${current.from}|${current.to}|${q.compare}|${q.parent ?? ''}|${q.cat ?? ''}`;

  return cached(key, async () => {
    const cur = datetimeRange(current);
    const prev = datetimeRange(previous);
    const both = `(${cur} OR ${prev})`;

    const filters = ["parent <> ''"];
    const params: string[] = [];
    if (q.parent) {
      filters.push('TRIM(parent) = ?');
      params.push(q.parent);
    }
    if (q.cat) {
      filters.push('TRIM(cat) = ?');
      params.push(q.cat);
    }
    const base = filters.join(' AND ');

    const totalsSql = (range: string) => `
      SELECT SUM(ht) ht, SUM(net) ttc, SUM(brut) brut, SUM(discount) remises, SUM(tva) tva,
             SUM(quantity) qty, COUNT(*) n,
             COUNT(DISTINCT ${TICKET_KEY}) tickets,
             COUNT(DISTINCT DATE(date)) open_days
        FROM sales WHERE ${base} AND ${range}`;

    const [
      curTotals,
      prevTotals,
      dailyRows,
      byParentRows,
      categoryRows,
      productRows,
      hourRows,
      tierRows,
      roomRows,
      cashRows,
      cashPrevRows,
    ] = await Promise.all([
      query(totalsSql(cur), params),
      query(totalsSql(prev), params),
      query(
        `SELECT DATE_FORMAT(date, '%Y-%m-%d') d, SUM(ht) ht, SUM(net) ttc, SUM(brut) brut,
                SUM(discount) remises, SUM(quantity) qty, COUNT(*) n,
                COUNT(DISTINCT ${TICKET_KEY}) tickets
           FROM sales WHERE ${base} AND ${cur} GROUP BY d`,
        params,
      ),
      query(
        `SELECT DATE_FORMAT(date, '%Y-%m-%d') d, TRIM(parent) p, SUM(ht) ht, SUM(net) ttc, SUM(quantity) qty
           FROM sales WHERE ${base} AND ${cur} GROUP BY d, p`,
        params,
      ),
      query(
        `SELECT TRIM(parent) p, TRIM(cat) c,
                SUM(IF(${cur}, ht, 0)) ht, SUM(IF(${cur}, net, 0)) ttc, SUM(IF(${cur}, quantity, 0)) qty,
                SUM(IF(${prev}, ht, 0)) prev_ht, SUM(IF(${prev}, net, 0)) prev_ttc, SUM(IF(${prev}, quantity, 0)) prev_qty
           FROM sales WHERE ${base} AND ${both} GROUP BY p, c`,
        params,
      ),
      query(
        `SELECT TRIM(name) nm, TRIM(parent) p, TRIM(cat) c,
                SUM(IF(${cur}, ht, 0)) ht, SUM(IF(${cur}, net, 0)) ttc, SUM(IF(${cur}, quantity, 0)) qty,
                SUM(IF(${prev}, ht, 0)) prev_ht, SUM(IF(${prev}, net, 0)) prev_ttc, SUM(IF(${prev}, quantity, 0)) prev_qty
           FROM sales WHERE ${base} AND ${both} GROUP BY nm, p, c`,
        params,
      ),
      query(
        `SELECT WEEKDAY(date) dow, HOUR(date) h,
                SUM(IF(${cur}, ht, 0)) ht, SUM(IF(${cur}, net, 0)) ttc, SUM(IF(${cur}, quantity, 0)) qty,
                COUNT(DISTINCT IF(${cur}, ${TICKET_KEY}, NULL)) tickets,
                SUM(IF(${prev}, ht, 0)) prev_ht, SUM(IF(${prev}, net, 0)) prev_ttc
           FROM sales WHERE ${base} AND ${both} GROUP BY dow, h`,
        params,
      ),
      query(
        `SELECT TRIM(tier) t, SUM(ht) ht, SUM(net) ttc, SUM(quantity) qty
           FROM sales WHERE ${base} AND ${cur} GROUP BY t`,
        params,
      ),
      query(
        `SELECT TRIM(salle) s, SUM(ht) ht, SUM(net) ttc, SUM(quantity) qty,
                COUNT(DISTINCT ${TICKET_KEY}) tickets
           FROM sales WHERE ${base} AND ${cur} GROUP BY s`,
        params,
      ),
      query(
        `SELECT DATE_FORMAT(date, '%Y-%m-%d') d,
                SUM(IF(montant > 0, montant, 0)) inflow, SUM(IF(montant < 0, montant, 0)) outflow
           FROM Cash WHERE ${cur} GROUP BY d`,
      ),
      query(
        `SELECT SUM(IF(montant > 0, montant, 0)) inflow, SUM(IF(montant < 0, montant, 0)) outflow
           FROM Cash WHERE ${prev}`,
      ),
    ]);

    const toTotals = (row: RowDataPacket | undefined): SalesTotals =>
      row
        ? {
            ht: r2(row.ht),
            ttc: r2(row.ttc),
            brut: r2(row.brut),
            remises: r2(row.remises),
            tva: r2(row.tva),
            qty: int(row.qty),
            lines: int(row.n),
            tickets: int(row.tickets),
            openDays: int(row.open_days),
          }
        : emptySalesTotals();

    const dailyMap = new Map(dailyRows.map((row) => [String(row.d), row]));
    const cashMap = new Map(cashRows.map((row) => [String(row.d), row]));
    const daily: SalesStats['daily'] = [];
    const cashDaily: SalesStats['cash']['daily'] = [];
    let cashIn = 0;
    let cashOut = 0;
    for (let ts = q.fromTs; ts <= q.toTs; ts += DAY_MS) {
      const date = toDay(ts);
      const row = dailyMap.get(date);
      daily.push({
        date,
        ht: r2(row?.ht),
        ttc: r2(row?.ttc),
        brut: r2(row?.brut),
        remises: r2(row?.remises),
        qty: int(row?.qty),
        lines: int(row?.n),
        tickets: int(row?.tickets),
      });
      const c = cashMap.get(date);
      const inflow = r2(c?.inflow);
      const outflow = r2(c?.outflow);
      cashIn += inflow;
      cashOut += outflow;
      cashDaily.push({ date, inflow, outflow });
    }

    return {
      period: current,
      previous,
      filter: { parent: q.parent ?? null, cat: q.cat ?? null },
      totals: { current: toTotals(curTotals[0]), previous: toTotals(prevTotals[0]) },
      daily,
      dailyByParent: byParentRows.map((row) => ({
        date: String(row.d),
        parent: String(row.p),
        ht: r2(row.ht),
        ttc: r2(row.ttc),
        qty: int(row.qty),
      })),
      categories: categoryRows.map((row) => ({
        parent: String(row.p),
        cat: String(row.c),
        ht: r2(row.ht),
        ttc: r2(row.ttc),
        qty: int(row.qty),
        prevHt: r2(row.prev_ht),
        prevTtc: r2(row.prev_ttc),
        prevQty: int(row.prev_qty),
      })),
      products: productRows.map((row) => ({
        name: String(row.nm),
        parent: String(row.p),
        cat: String(row.c),
        ht: r2(row.ht),
        ttc: r2(row.ttc),
        qty: int(row.qty),
        prevHt: r2(row.prev_ht),
        prevTtc: r2(row.prev_ttc),
        prevQty: int(row.prev_qty),
      })),
      hours: hourRows.map((row) => ({
        dow: int(row.dow),
        hour: int(row.h),
        ht: r2(row.ht),
        ttc: r2(row.ttc),
        qty: int(row.qty),
        tickets: int(row.tickets),
        prevHt: r2(row.prev_ht),
        prevTtc: r2(row.prev_ttc),
      })),
      tiers: tierRows.map((row) => ({
        tier: String(row.t),
        ht: r2(row.ht),
        ttc: r2(row.ttc),
        qty: int(row.qty),
      })),
      rooms: roomRows.map((row) => ({
        room: String(row.s),
        ht: r2(row.ht),
        ttc: r2(row.ttc),
        qty: int(row.qty),
        tickets: int(row.tickets),
      })),
      cash: {
        daily: cashDaily,
        current: { inflow: r2(cashIn), outflow: r2(cashOut) },
        previous: { inflow: r2(cashPrevRows[0]?.inflow), outflow: r2(cashPrevRows[0]?.outflow) },
      },
    };
  });
}

// ---------------------------------------------------------------------------
// Tresorerie (Tiime)
// ---------------------------------------------------------------------------

export interface TreasuryQuery {
  fromTs: number;
  toTs: number;
  compare: CompareMode;
  /** Categorie exacte, ou UNCATEGORIZED pour les operations sans categorie. */
  category?: string;
}

export interface TreasuryTotals {
  /** Somme signee de toutes les operations. */
  net: number;
  inflow: number;
  /** Negatif. */
  outflow: number;
  rows: number;
}

export interface MarginFigures {
  /** Recettes deposees en banque (categorie encaissement). */
  revenue: number;
  /** Achats de matieres premieres, nets des avoirs. Positif. */
  cogs: number;
  /** null quand il n'y a aucun encaissement sur la periode. */
  rate: number | null;
}

export interface TreasuryStats {
  period: Period;
  previous: Period;
  filter: { category: string | null };
  totals: { current: TreasuryTotals; previous: TreasuryTotals };
  /** Toujours calculee sur toutes les categories, filtre ignore. */
  margin: { current: MarginFigures; previous: MarginFigures };
  monthly: Array<{ month: string; category: string; inflow: number; outflow: number; rows: number }>;
  labels: Array<{
    label: string;
    category: string;
    net: number;
    inflow: number;
    outflow: number;
    rows: number;
    last: string;
  }>;
  /** Operations sans categorie, toutes dates confondues : a classer. */
  uncategorized: Array<{ label: string; rows: number; net: number; first: string; last: string }>;
}

function toMargin(row: RowDataPacket | undefined): MarginFigures {
  const revenue = r2(row?.revenue);
  const cogs = r2(-Number(row?.cogs ?? 0));
  return { revenue, cogs, rate: revenue > 0 ? Math.round((1 - cogs / revenue) * 10000) / 10000 : null };
}

function fluxCategoryFilter(category: string | undefined): { sql: string; params: string[] } {
  if (category === undefined) return { sql: '', params: [] };
  return { sql: ` AND ${FLUX_CAT} = ?`, params: [category] };
}

export function getTreasuryStats(q: TreasuryQuery): Promise<TreasuryStats> {
  const { current, previous } = resolvePeriods(q.fromTs, q.toTs, q.compare);
  const key = `treasury|${current.from}|${current.to}|${q.compare}|${q.category ?? '*'}`;

  return cached(key, async () => {
    const cur = dateRange(current);
    const prev = dateRange(previous);
    const { sql: catSql, params } = fluxCategoryFilter(q.category);

    const totalsSql = (range: string) => `
      SELECT SUM(amount) net, SUM(IF(amount > 0, amount, 0)) inflow,
             SUM(IF(amount < 0, amount, 0)) outflow, COUNT(*) n
        FROM flux WHERE ${range}${catSql}`;
    const marginSql = (range: string) => `
      SELECT SUM(IF(category = ?, amount, 0)) revenue, SUM(IF(category = ?, amount, 0)) cogs
        FROM flux WHERE ${range}`;
    const marginParams = [REVENUE_CATEGORY, COGS_CATEGORY];

    const [curTotals, prevTotals, curMargin, prevMargin, monthlyRows, labelRows, uncategorizedRows] =
      await Promise.all([
        query(totalsSql(cur), params),
        query(totalsSql(prev), params),
        query(marginSql(cur), marginParams),
        query(marginSql(prev), marginParams),
        query(
          `SELECT DATE_FORMAT(date, '%Y-%m') m, ${FLUX_CAT} c,
                  SUM(IF(amount > 0, amount, 0)) inflow, SUM(IF(amount < 0, amount, 0)) outflow, COUNT(*) n
             FROM flux WHERE ${cur}${catSql} GROUP BY m, c`,
          params,
        ),
        query(
          `SELECT ${FLUX_LABEL} l, ${FLUX_CAT} c, SUM(amount) net,
                  SUM(IF(amount > 0, amount, 0)) inflow, SUM(IF(amount < 0, amount, 0)) outflow,
                  COUNT(*) n, DATE_FORMAT(MAX(date), '%Y-%m-%d') last
             FROM flux WHERE ${cur}${catSql} GROUP BY l, c`,
          params,
        ),
        query(
          `SELECT ${FLUX_LABEL} l, COUNT(*) n, SUM(amount) net,
                  DATE_FORMAT(MIN(date), '%Y-%m-%d') first, DATE_FORMAT(MAX(date), '%Y-%m-%d') last
             FROM flux WHERE ${FLUX_CAT} = '' GROUP BY l ORDER BY MAX(date) DESC`,
        ),
      ]);

    const toTotals = (row: RowDataPacket | undefined): TreasuryTotals => ({
      net: r2(row?.net),
      inflow: r2(row?.inflow),
      outflow: r2(row?.outflow),
      rows: int(row?.n),
    });

    return {
      period: current,
      previous,
      filter: { category: q.category ?? null },
      totals: { current: toTotals(curTotals[0]), previous: toTotals(prevTotals[0]) },
      margin: { current: toMargin(curMargin[0]), previous: toMargin(prevMargin[0]) },
      monthly: monthlyRows.map((row) => ({
        month: String(row.m),
        category: String(row.c),
        inflow: r2(row.inflow),
        outflow: r2(row.outflow),
        rows: int(row.n),
      })),
      labels: labelRows.map((row) => ({
        label: String(row.l),
        category: String(row.c),
        net: r2(row.net),
        inflow: r2(row.inflow),
        outflow: r2(row.outflow),
        rows: int(row.n),
        last: String(row.last),
      })),
      uncategorized: uncategorizedRows.map((row) => ({
        label: String(row.l),
        rows: int(row.n),
        net: r2(row.net),
        first: String(row.first),
        last: String(row.last),
      })),
    };
  });
}

export interface TransactionsQuery {
  fromTs: number;
  toTs: number;
  category?: string;
  label?: string;
  search?: string;
  page: number;
  pageSize: number;
}

export interface TransactionsPage {
  items: Array<{
    id: number;
    date: string;
    designation: string;
    amount: number;
    label: string;
    category: string;
  }>;
  total: number;
  page: number;
  pageSize: number;
}

/** Historique des operations bancaires, pagine. Pas de cache : requete legere. */
export async function getTransactions(q: TransactionsQuery): Promise<TransactionsPage> {
  const period: Period = { from: toDay(q.fromTs), to: toDay(q.toTs), days: 0 };
  const where = [dateRange(period)];
  const params: unknown[] = [];

  if (q.category !== undefined) {
    where.push(`${FLUX_CAT} = ?`);
    params.push(q.category);
  }
  if (q.label !== undefined) {
    where.push(`${FLUX_LABEL} = ?`);
    params.push(q.label);
  }
  if (q.search) {
    // LIKE : on neutralise les jokers saisis par l'utilisateur
    const needle = `%${q.search.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
    where.push('(designation LIKE ? OR label LIKE ?)');
    params.push(needle, needle);
  }
  const whereSql = where.join(' AND ');
  const offset = (q.page - 1) * q.pageSize;

  const [countRows, rows] = await Promise.all([
    query(`SELECT COUNT(*) n FROM flux WHERE ${whereSql}`, params),
    query(
      `SELECT id, DATE_FORMAT(date, '%Y-%m-%d') d, designation, amount, ${FLUX_LABEL} l, ${FLUX_CAT} c
         FROM flux WHERE ${whereSql}
        ORDER BY date DESC, id DESC LIMIT ? OFFSET ?`,
      [...params, q.pageSize, offset],
    ),
  ]);

  return {
    items: rows.map((row) => ({
      id: int(row.id),
      date: String(row.d),
      designation: String(row.designation ?? ''),
      amount: r2(row.amount),
      label: String(row.l),
      category: String(row.c),
    })),
    total: int(countRows[0]?.n),
    page: q.page,
    pageSize: q.pageSize,
  };
}

/** Categories deja utilisees dans `flux`, hors vide. */
export async function listFluxCategories(): Promise<string[]> {
  const rows = await query(`SELECT DISTINCT ${FLUX_CAT} c FROM flux WHERE ${FLUX_CAT} <> '' ORDER BY c`);
  return rows.map((row) => String(row.c));
}

/**
 * Classe les operations d'un libelle encore sans categorie. Ne touche jamais
 * une operation deja classee. Renvoie le nombre de lignes modifiees.
 */
export async function categorizeLabel(label: string, category: string): Promise<number> {
  const [result] = await getMysqlPool().query(
    `UPDATE flux SET category = ? WHERE ${FLUX_CAT} = '' AND ${FLUX_LABEL} = ?`,
    [category, label],
  );
  invalidateStatsCache();
  return Number((result as { affectedRows?: number }).affectedRows ?? 0);
}

// ---------------------------------------------------------------------------
// Vue d'ensemble : tout l'historique au mois, pour le suivi de rentabilite
// ---------------------------------------------------------------------------

export interface OverviewStats {
  salesMonthly: Array<{
    month: string;
    ht: number;
    ttc: number;
    qty: number;
    tickets: number;
    openDays: number;
  }>;
  cashMonthly: Array<{ month: string; inflow: number; outflow: number }>;
  fluxMonthly: Array<{ month: string; category: string; inflow: number; outflow: number }>;
}

export function getOverviewStats(): Promise<OverviewStats> {
  return cached('overview', async () => {
    const [salesRows, cashRows, fluxRows] = await Promise.all([
      query(
        `SELECT DATE_FORMAT(date, '%Y-%m') m, SUM(ht) ht, SUM(net) ttc, SUM(quantity) qty,
                COUNT(DISTINCT ${TICKET_KEY}) tickets, COUNT(DISTINCT DATE(date)) open_days
           FROM sales WHERE parent <> '' GROUP BY m ORDER BY m`,
      ),
      query(
        `SELECT DATE_FORMAT(date, '%Y-%m') m,
                SUM(IF(montant > 0, montant, 0)) inflow, SUM(IF(montant < 0, montant, 0)) outflow
           FROM Cash WHERE date IS NOT NULL GROUP BY m ORDER BY m`,
      ),
      query(
        `SELECT DATE_FORMAT(date, '%Y-%m') m, ${FLUX_CAT} c,
                SUM(IF(amount > 0, amount, 0)) inflow, SUM(IF(amount < 0, amount, 0)) outflow
           FROM flux GROUP BY m, c ORDER BY m`,
      ),
    ]);

    return {
      salesMonthly: salesRows.map((row) => ({
        month: String(row.m),
        ht: r2(row.ht),
        ttc: r2(row.ttc),
        qty: int(row.qty),
        tickets: int(row.tickets),
        openDays: int(row.open_days),
      })),
      cashMonthly: cashRows.map((row) => ({
        month: String(row.m),
        inflow: r2(row.inflow),
        outflow: r2(row.outflow),
      })),
      fluxMonthly: fluxRows.map((row) => ({
        month: String(row.m),
        category: String(row.c),
        inflow: r2(row.inflow),
        outflow: r2(row.outflow),
      })),
    };
  });
}
