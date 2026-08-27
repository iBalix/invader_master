/**
 * Finance report — CA journalier, lecture seule, endpoint public sans auth.
 *
 * Source unique : MySQL legacy OVH (base `invader`), la meme que la page
 * Comptabilite. C'est la seule base a jour : le dual-write Supabase des imports
 * finance est tres en retard (7k lignes `sales` cote Supabase contre 127k cote
 * MySQL), et la table `Cash` n'existe que la.
 *
 * CA d'un jour = CA Popina (table `sales`) + ajouts de caisse (table `Cash`,
 * montants positifs uniquement).
 */

import { Router } from 'express';
import { getMysqlPool } from '../config/mysql.js';
import type { RowDataPacket } from 'mysql2';

export const financeReportRoutes = Router();

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DAYS = 1500;
const DAY_MS = 86400000;

/** Parse une date `YYYY-MM-DD` en timestamp UTC, ou null si invalide. */
function parseDay(value: string): number | null {
  if (!DATE_RE.test(value)) return null;
  const [y, m, d] = value.split('-').map(Number);
  const ts = Date.UTC(y, m - 1, d);
  const back = new Date(ts);
  // rejette les dates qui "debordent" (2026-02-31 -> 2026-03-03)
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== m - 1 || back.getUTCDate() !== d) {
    return null;
  }
  return ts;
}

function toDay(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}

/** Les colonnes montants sont des FLOAT MySQL : SUM() accumule des residus. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

interface SalesRow extends RowDataPacket {
  d: string | Date;
  ttc: number | null;
  ht: number | null;
  tva: number | null;
  brut: number | null;
  remises: number | null;
  lignes: number;
}

interface CashRow extends RowDataPacket {
  d: string | Date;
  ajouts: number | null;
  mouvements: number;
}

interface DayItem {
  date: string;
  ca_total: number;
  popina_ttc: number;
  popina_ht: number;
  popina_tva: number;
  popina_brut: number;
  popina_remises: number;
  popina_lignes: number;
  caisse_ajouts: number;
  caisse_mouvements: number;
  has_data: boolean;
}

/** mysql2 peut renvoyer un Date ou une string selon la colonne/driver. */
function rowDay(d: string | Date): string {
  return d instanceof Date
    ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    : String(d).slice(0, 10);
}

// ---------------------------------------------------------------------------
// GET /public/finance-report/schema — contrat auto-decrit (pour une IA)
// ---------------------------------------------------------------------------

financeReportRoutes.get('/schema', (_req, res) => {
  res.json({
    status: 'success',
    data: {
      endpoint: 'GET /public/finance-report',
      description:
        "Chiffre d'affaires quotidien du bar Invader (Lyon). Retourne une ligne par jour de la plage demandee, meme les jours sans activite.",
      auth: 'aucune',
      params: {
        from: {
          type: 'string',
          format: 'YYYY-MM-DD',
          required: false,
          default: "to - 29 jours",
          description: 'Premier jour inclus.',
        },
        to: {
          type: 'string',
          format: 'YYYY-MM-DD',
          required: false,
          default: "aujourd'hui",
          description: 'Dernier jour inclus.',
        },
      },
      limits: { max_days: MAX_DAYS, currency: 'EUR', timezone: 'Europe/Paris' },
      fields: {
        date: 'Jour calendaire (YYYY-MM-DD).',
        ca_total: "CA total du jour en euros TTC = popina_ttc + caisse_ajouts.",
        popina_ttc: "CA encaisse en caisse Popina, TTC, remises deduites (somme de sales.net).",
        popina_ht: 'Part hors taxes du CA Popina.',
        popina_tva: 'TVA collectee sur le CA Popina.',
        popina_brut: 'CA Popina avant remises.',
        popina_remises: 'Montant des remises accordees.',
        popina_lignes: 'Nombre de lignes produit vendues (pas des tickets).',
        caisse_ajouts:
          "Somme des entrees d'especes saisies sur la page Comptabilite (montants positifs uniquement, les retraits sont ignores).",
        caisse_mouvements: "Nombre d'entrees d'especes saisies ce jour-la.",
        has_data: "false si aucune vente ni mouvement de caisse ce jour (bar ferme ou import manquant). Permet de distinguer un zero d'une absence de donnee.",
      },
      notes: [
        "Les lignes de recapitulatif de ticket presentes dans l'historique (categories Total / Paiement / Pourboire / Rendu) sont exclues du calcul : les inclure doublerait le CA avant 2026.",
        "Le nombre de tickets n'est pas expose : l'identifiant de ticket est corrompu sur les imports anterieurs a 2026.",
        "Un jour va de 00h00 a 23h59 : les ventes passees apres minuit sont comptees sur le jour calendaire suivant.",
      ],
    },
  });
});

// ---------------------------------------------------------------------------
// GET /public/finance-report?from=YYYY-MM-DD&to=YYYY-MM-DD
// ---------------------------------------------------------------------------

financeReportRoutes.get('/', async (req, res) => {
  try {
    const rawTo = typeof req.query.to === 'string' && req.query.to ? req.query.to : toDay(Date.now());
    const toTs = parseDay(rawTo);
    if (toTs === null) {
      res.status(400).json({ status: 'error', message: 'Parametre "to" invalide, format attendu YYYY-MM-DD' });
      return;
    }

    const rawFrom =
      typeof req.query.from === 'string' && req.query.from ? req.query.from : toDay(toTs - 29 * DAY_MS);
    const fromTs = parseDay(rawFrom);
    if (fromTs === null) {
      res.status(400).json({ status: 'error', message: 'Parametre "from" invalide, format attendu YYYY-MM-DD' });
      return;
    }

    if (fromTs > toTs) {
      res.status(400).json({ status: 'error', message: '"from" doit etre anterieur ou egal a "to"' });
      return;
    }

    const days = Math.round((toTs - fromTs) / DAY_MS) + 1;
    if (days > MAX_DAYS) {
      res.status(400).json({ status: 'error', message: `Plage trop large : ${days} jours demandes, maximum ${MAX_DAYS}` });
      return;
    }

    // Bornes SQL : [from 00:00:00, to+1j 00:00:00[ pour inclure tout le dernier jour.
    const sqlFrom = `${toDay(fromTs)} 00:00:00`;
    const sqlToExclusive = `${toDay(toTs + DAY_MS)} 00:00:00`;

    const pool = getMysqlPool();

    const [salesRows, cashRows] = await Promise.all([
      pool.query<SalesRow[]>(
        `SELECT DATE(date) AS d,
                SUM(net)      AS ttc,
                SUM(ht)       AS ht,
                SUM(tva)      AS tva,
                SUM(brut)     AS brut,
                SUM(discount) AS remises,
                COUNT(*)      AS lignes
           FROM sales
          WHERE date >= ? AND date < ?
            AND parent <> ''
          GROUP BY DATE(date)`,
        [sqlFrom, sqlToExclusive],
      ).then(([rows]) => rows),
      pool.query<CashRow[]>(
        `SELECT DATE(date) AS d,
                SUM(montant) AS ajouts,
                COUNT(*)     AS mouvements
           FROM Cash
          WHERE date >= ? AND date < ?
            AND montant > 0
          GROUP BY DATE(date)`,
        [sqlFrom, sqlToExclusive],
      ).then(([rows]) => rows),
    ]);

    const salesByDay = new Map<string, SalesRow>(salesRows.map((r) => [rowDay(r.d), r]));
    const cashByDay = new Map<string, CashRow>(cashRows.map((r) => [rowDay(r.d), r]));

    const items: DayItem[] = [];
    let sumTotal = 0;
    let sumTtc = 0;
    let sumHt = 0;
    let sumTva = 0;
    let sumBrut = 0;
    let sumRemises = 0;
    let sumCash = 0;
    let daysWithData = 0;

    for (let ts = fromTs; ts <= toTs; ts += DAY_MS) {
      const day = toDay(ts);
      const s = salesByDay.get(day);
      const c = cashByDay.get(day);

      const popinaTtc = round2(Number(s?.ttc ?? 0));
      const popinaHt = round2(Number(s?.ht ?? 0));
      const popinaTva = round2(Number(s?.tva ?? 0));
      const popinaBrut = round2(Number(s?.brut ?? 0));
      const popinaRemises = round2(Number(s?.remises ?? 0));
      const popinaLignes = Number(s?.lignes ?? 0);
      const caisseAjouts = round2(Number(c?.ajouts ?? 0));
      const caisseMouvements = Number(c?.mouvements ?? 0);
      const caTotal = round2(popinaTtc + caisseAjouts);
      const hasData = popinaLignes > 0 || caisseMouvements > 0;

      sumTotal += caTotal;
      sumTtc += popinaTtc;
      sumHt += popinaHt;
      sumTva += popinaTva;
      sumBrut += popinaBrut;
      sumRemises += popinaRemises;
      sumCash += caisseAjouts;
      if (hasData) daysWithData += 1;

      items.push({
        date: day,
        ca_total: caTotal,
        popina_ttc: popinaTtc,
        popina_ht: popinaHt,
        popina_tva: popinaTva,
        popina_brut: popinaBrut,
        popina_remises: popinaRemises,
        popina_lignes: popinaLignes,
        caisse_ajouts: caisseAjouts,
        caisse_mouvements: caisseMouvements,
        has_data: hasData,
      });
    }

    res.json({
      status: 'success',
      meta: {
        from: toDay(fromTs),
        to: toDay(toTs),
        days,
        currency: 'EUR',
        timezone: 'Europe/Paris',
        sources: {
          popina: 'MySQL invader.sales (import Popina), lignes produit uniquement',
          caisse: 'MySQL invader.Cash (page Comptabilite), montants positifs uniquement',
        },
      },
      summary: {
        ca_total: round2(sumTotal),
        popina_ttc: round2(sumTtc),
        popina_ht: round2(sumHt),
        popina_tva: round2(sumTva),
        popina_brut: round2(sumBrut),
        popina_remises: round2(sumRemises),
        caisse_ajouts: round2(sumCash),
        days_with_data: daysWithData,
        ca_moyen_jour_ouvre: daysWithData > 0 ? round2(sumTotal / daysWithData) : 0,
      },
      items,
    });
  } catch (err) {
    console.error('Finance report error:', err);
    res.status(500).json({ status: 'error', message: 'Erreur serveur' });
  }
});
