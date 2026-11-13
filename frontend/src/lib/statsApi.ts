/**
 * Client de la section Stats : types miroir de backend/src/services/financeStats.ts
 * et appels a /api/stats.
 */

import { api } from './api';

export type CompareMode = 'previous' | 'year';

export interface Period {
  from: string;
  to: string;
  days: number;
}

// --- meta -------------------------------------------------------------------

export interface StatsMeta {
  sales: { first: string | null; last: string | null; lines: number };
  flux: { first: string | null; last: string | null; rows: number };
  cash: { first: string | null; last: string | null };
  salesCategories: Array<{
    parent: string;
    ht: number;
    last: string;
    cats: Array<{ cat: string; ht: number; last: string }>;
  }>;
  fluxCategories: Array<{ category: string; rows: number; inflow: number; outflow: number }>;
}

// --- ventes -----------------------------------------------------------------

export interface SalesTotals {
  ht: number;
  ttc: number;
  brut: number;
  remises: number;
  tva: number;
  qty: number;
  lines: number;
  tickets: number;
  openDays: number;
}

export interface SalesDay {
  date: string;
  ht: number;
  ttc: number;
  brut: number;
  remises: number;
  qty: number;
  lines: number;
  tickets: number;
}

export interface SalesCategoryRow {
  parent: string;
  cat: string;
  ht: number;
  ttc: number;
  qty: number;
  prevHt: number;
  prevTtc: number;
  prevQty: number;
}

export interface SalesProductRow extends SalesCategoryRow {
  name: string;
}

export interface SalesHourRow {
  /** 0 = lundi ... 6 = dimanche */
  dow: number;
  hour: number;
  ht: number;
  ttc: number;
  qty: number;
  tickets: number;
  prevHt: number;
  prevTtc: number;
}

export interface SalesStats {
  period: Period;
  previous: Period;
  filter: { parent: string | null; cat: string | null };
  totals: { current: SalesTotals; previous: SalesTotals };
  daily: SalesDay[];
  dailyByParent: Array<{ date: string; parent: string; ht: number; ttc: number; qty: number }>;
  categories: SalesCategoryRow[];
  products: SalesProductRow[];
  hours: SalesHourRow[];
  tiers: Array<{ tier: string; ht: number; ttc: number; qty: number }>;
  rooms: Array<{ room: string; ht: number; ttc: number; qty: number; tickets: number }>;
  cash: {
    daily: Array<{ date: string; inflow: number; outflow: number }>;
    current: { inflow: number; outflow: number };
    previous: { inflow: number; outflow: number };
  };
}

// --- tresorerie -------------------------------------------------------------

export interface TreasuryTotals {
  net: number;
  inflow: number;
  outflow: number;
  rows: number;
}

export interface MarginFigures {
  revenue: number;
  cogs: number;
  rate: number | null;
}

export interface TreasuryStats {
  period: Period;
  previous: Period;
  filter: { category: string | null };
  totals: { current: TreasuryTotals; previous: TreasuryTotals };
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
  uncategorized: Array<{ label: string; rows: number; net: number; first: string; last: string }>;
}

export interface Transaction {
  id: number;
  date: string;
  designation: string;
  amount: number;
  label: string;
  category: string;
}

export interface TransactionsPage {
  items: Transaction[];
  total: number;
  page: number;
  pageSize: number;
}

// --- rentabilite ------------------------------------------------------------

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

export interface BreakEvenPoint {
  label: string;
  monthly: number;
}

export interface StatsSettings {
  breakEven: BreakEvenPoint[];
  grossMarginTarget: number;
  /** false tant que la migration 057 n'est pas appliquee (valeurs par defaut). */
  persisted: boolean;
}

// --- appels -----------------------------------------------------------------

/** Valeur du parametre `category` pour les operations bancaires sans categorie. */
export const UNCATEGORIZED_PARAM = '__none__';

function clean(params: Record<string, string | number | undefined | null>): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') out[key] = value;
  }
  return out;
}

/** '' (sans categorie) doit partir comme `__none__`, undefined comme absent. */
function categoryParam(category: string | null | undefined): string | undefined {
  if (category === null || category === undefined) return undefined;
  return category === '' ? UNCATEGORIZED_PARAM : category;
}

export const statsApi = {
  async meta(): Promise<StatsMeta> {
    const { data } = await api.get('/api/stats/meta');
    return data.data as StatsMeta;
  },

  async sales(q: {
    from: string;
    to: string;
    compare: CompareMode;
    parent?: string | null;
    cat?: string | null;
  }): Promise<SalesStats> {
    const { data } = await api.get('/api/stats/sales', { params: clean(q) });
    return data.data as SalesStats;
  },

  async treasury(q: {
    from: string;
    to: string;
    compare: CompareMode;
    category?: string | null;
  }): Promise<TreasuryStats> {
    const { data } = await api.get('/api/stats/treasury', {
      params: clean({ from: q.from, to: q.to, compare: q.compare, category: categoryParam(q.category) }),
    });
    return data.data as TreasuryStats;
  },

  async transactions(q: {
    from: string;
    to: string;
    category?: string | null;
    label?: string | null;
    search?: string;
    page: number;
    pageSize: number;
  }): Promise<TransactionsPage> {
    const params = clean({
      from: q.from,
      to: q.to,
      category: categoryParam(q.category),
      q: q.search,
      page: q.page,
      pageSize: q.pageSize,
    });
    // un libelle vide est un filtre valide (operations sans libelle)
    if (q.label !== null && q.label !== undefined) params.label = q.label;
    const { data } = await api.get('/api/stats/treasury/transactions', { params });
    return {
      items: Array.isArray(data?.items) ? (data.items as Transaction[]) : [],
      total: Number(data?.total ?? 0),
      page: Number(data?.page ?? q.page),
      pageSize: Number(data?.pageSize ?? q.pageSize),
    };
  },

  async categorize(label: string, category: string): Promise<{ updated: number }> {
    const { data } = await api.put('/api/stats/treasury/categorize', { label, category });
    return data.data as { updated: number };
  },

  async overview(): Promise<OverviewStats> {
    const { data } = await api.get('/api/stats/overview');
    return data.data as OverviewStats;
  },

  async settings(): Promise<StatsSettings> {
    const { data } = await api.get('/api/stats/settings');
    return data.data as StatsSettings;
  },

  async saveSettings(input: { breakEven: BreakEvenPoint[]; grossMarginTarget: number }): Promise<StatsSettings> {
    const { data } = await api.put('/api/stats/settings', input);
    return data.data as StatsSettings;
  },
};
