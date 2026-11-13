/**
 * Stats — section Stats du back-office (ventes, tresorerie, rentabilite).
 *
 * Lecture seule sur MySQL legacy, a deux exceptions reservees aux admins :
 * classer une operation bancaire sans categorie, et modifier les objectifs.
 *
 * Monte dans index.ts derriere authMiddleware. Chaque route verifie en plus
 * l'acces a la page correspondante : ce sont des donnees financieres, le garde
 * de route du front ne suffit pas.
 */

import { Router, type Request, type Response } from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { requireRole, requirePageAccess } from '../middleware/rbac.js';
import {
  UNCATEGORIZED,
  categorizeLabel,
  getOverviewStats,
  getSalesStats,
  getStatsMeta,
  getTransactions,
  getTreasuryStats,
  listFluxCategories,
  parseDay,
  type CompareMode,
} from '../services/financeStats.js';
import {
  StatsSettingsUnavailableError,
  getStatsSettings,
  saveStatsSettings,
} from '../services/statsSettings.js';

export const statsRoutes = Router();

const PAGE_SALES = 'stats/ventes';
const PAGE_TREASURY = 'stats/tresorerie';
const PAGE_PROFITABILITY = 'stats/rentabilite';
const ANY_STATS_PAGE = [PAGE_SALES, PAGE_TREASURY, PAGE_PROFITABILITY];

const DAY_MS = 86400000;
/** Un peu plus de dix ans : garde-fou contre une plage absurde. */
const MAX_DAYS = 4000;
/** Valeur du parametre `category` pour viser les operations sans categorie. */
const NONE_PARAM = '__none__';

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

/** Lit from / to / compare. Repond 400 et renvoie null si invalide. */
function readRange(
  req: Request,
  res: Response,
): { fromTs: number; toTs: number; compare: CompareMode } | null {
  const fromTs = parseDay(req.query.from);
  const toTs = parseDay(req.query.to);
  if (fromTs === null || toTs === null) {
    res.status(400).json({ status: 'error', message: 'Parametres "from" et "to" requis au format YYYY-MM-DD' });
    return null;
  }
  if (fromTs > toTs) {
    res.status(400).json({ status: 'error', message: '"from" doit etre anterieur ou egal a "to"' });
    return null;
  }
  if ((toTs - fromTs) / DAY_MS + 1 > MAX_DAYS) {
    res.status(400).json({ status: 'error', message: `Plage trop large, maximum ${MAX_DAYS} jours` });
    return null;
  }
  const compare: CompareMode = req.query.compare === 'year' ? 'year' : 'previous';
  return { fromTs, toTs, compare };
}

function readFluxCategory(req: Request): string | undefined {
  const raw = str(req.query.category);
  if (raw === undefined) return undefined;
  return raw === NONE_PARAM ? UNCATEGORIZED : raw;
}

function fail(res: Response, scope: string, err: unknown): void {
  console.error(`Stats ${scope} error:`, err);
  res.status(500).json({ status: 'error', message: 'Erreur serveur' });
}

// ---------------------------------------------------------------------------
// GET /api/stats/meta — etendue des donnees + valeurs de filtres
// ---------------------------------------------------------------------------

statsRoutes.get('/meta', requirePageAccess(...ANY_STATS_PAGE), async (_req, res) => {
  try {
    res.json({ status: 'success', data: await getStatsMeta() });
  } catch (err) {
    fail(res, 'meta', err);
  }
});

// ---------------------------------------------------------------------------
// GET /api/stats/sales?from&to&compare&parent&cat — ventes Popina
// ---------------------------------------------------------------------------

statsRoutes.get('/sales', requirePageAccess(PAGE_SALES), async (req, res) => {
  const range = readRange(req, res);
  if (!range) return;
  try {
    const data = await getSalesStats({
      ...range,
      parent: str(req.query.parent),
      cat: str(req.query.cat),
    });
    res.json({ status: 'success', data });
  } catch (err) {
    fail(res, 'sales', err);
  }
});

// ---------------------------------------------------------------------------
// GET /api/stats/treasury?from&to&compare&category — operations bancaires Tiime
// ---------------------------------------------------------------------------

statsRoutes.get('/treasury', requirePageAccess(PAGE_TREASURY), async (req, res) => {
  const range = readRange(req, res);
  if (!range) return;
  try {
    const data = await getTreasuryStats({ ...range, category: readFluxCategory(req) });
    res.json({ status: 'success', data });
  } catch (err) {
    fail(res, 'treasury', err);
  }
});

// ---------------------------------------------------------------------------
// GET /api/stats/treasury/transactions?from&to&category&label&q&page&pageSize
// ---------------------------------------------------------------------------

statsRoutes.get('/treasury/transactions', requirePageAccess(PAGE_TREASURY), async (req, res) => {
  const range = readRange(req, res);
  if (!range) return;
  try {
    const page = Math.max(1, Math.floor(Number(req.query.page)) || 1);
    const pageSize = Math.min(200, Math.max(1, Math.floor(Number(req.query.pageSize)) || 25));
    // `label` peut etre volontairement vide (operations sans libelle)
    const label = typeof req.query.label === 'string' ? req.query.label.trim() : undefined;
    const data = await getTransactions({
      fromTs: range.fromTs,
      toTs: range.toTs,
      category: readFluxCategory(req),
      label,
      search: str(req.query.q),
      page,
      pageSize,
    });
    res.json({ status: 'success', ...data });
  } catch (err) {
    fail(res, 'transactions', err);
  }
});

// ---------------------------------------------------------------------------
// PUT /api/stats/treasury/categorize { label, category } — admin
// Classe les operations d'un libelle encore sans categorie.
// ---------------------------------------------------------------------------

statsRoutes.put('/treasury/categorize', requireRole('admin'), async (req, res) => {
  try {
    const label = typeof req.body?.label === 'string' ? req.body.label.trim() : '';
    const category = typeof req.body?.category === 'string' ? req.body.category.trim() : '';
    if (!label) {
      res.status(400).json({ status: 'error', message: 'Libellé requis' });
      return;
    }
    // Uniquement une categorie deja en service : une faute de frappe creerait
    // une categorie fantome que plus aucun rapport ne regrouperait.
    const known = await listFluxCategories();
    if (!known.includes(category)) {
      res.status(400).json({ status: 'error', message: 'Catégorie inconnue' });
      return;
    }

    const updated = await categorizeLabel(label, category);

    // Miroir Supabase : meme regle (lignes sans categorie uniquement). Le miroir
    // n'est pas la source des stats, un echec ici ne doit pas faire echouer.
    const { error: mirrorError } = await supabaseAdmin
      .from('flux')
      .update({ category })
      .eq('label', label)
      .or('category.is.null,category.eq.');
    if (mirrorError) console.warn('Stats categorize: miroir Supabase non mis a jour:', mirrorError.message);

    res.json({ status: 'success', data: { label, category, updated } });
  } catch (err) {
    fail(res, 'categorize', err);
  }
});

// ---------------------------------------------------------------------------
// GET /api/stats/overview — tout l'historique au mois (suivi de rentabilite)
// ---------------------------------------------------------------------------

statsRoutes.get('/overview', requirePageAccess(PAGE_PROFITABILITY), async (_req, res) => {
  try {
    res.json({ status: 'success', data: await getOverviewStats() });
  } catch (err) {
    fail(res, 'overview', err);
  }
});

// ---------------------------------------------------------------------------
// GET / PUT /api/stats/settings — points morts et marge cible
// ---------------------------------------------------------------------------

statsRoutes.get('/settings', requirePageAccess(...ANY_STATS_PAGE), async (_req, res) => {
  try {
    res.json({ status: 'success', data: await getStatsSettings() });
  } catch (err) {
    fail(res, 'settings', err);
  }
});

statsRoutes.put('/settings', requireRole('admin'), async (req, res) => {
  try {
    const data = await saveStatsSettings({
      breakEven: req.body?.breakEven,
      grossMarginTarget: req.body?.grossMarginTarget,
    });
    res.json({ status: 'success', data });
  } catch (err) {
    if (err instanceof RangeError) {
      res.status(400).json({ status: 'error', message: err.message });
      return;
    }
    if (err instanceof StatsSettingsUnavailableError) {
      res.status(409).json({ status: 'error', message: err.message });
      return;
    }
    fail(res, 'settings save', err);
  }
});
