/**
 * Finance import routes — Popina sales (.xlsx) and Tiime flux (.xlsx)
 * Dual-write: inserts into both MySQL (legacy) and Supabase (new).
 * Uses SSE for progressive feedback, multer for file upload, xlsx for parsing.
 */

import { Router, type Request, type Response } from 'express';
import multer from 'multer';
import * as XLSX from 'xlsx';
import crypto from 'crypto';
import { supabaseAdmin } from '../config/supabase.js';
import { getMysqlPool } from '../config/mysql.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';

export const financeImportRoutes = Router();
financeImportRoutes.use(authMiddleware, requireRole('admin'));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

function sendSSE(res: Response, event: string, data: Record<string, unknown>) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function startSSE(res: Response) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
}

function parseDatePopina(raw: unknown): string | null {
  if (!raw) return null;
  const str = String(raw);

  if (/^\d+(\.\d+)?$/.test(str)) {
    const serial = parseFloat(str);
    const epoch = new Date(Date.UTC(1899, 11, 30));
    const ms = epoch.getTime() + serial * 86400000;
    const d = new Date(ms);
    if (!isNaN(d.getTime())) return d.toISOString();
  }

  const parts = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{1,2}))?$/);
  if (parts) {
    const [, day, month, year, hour, minute] = parts;
    const d = new Date(
      parseInt(year), parseInt(month) - 1, parseInt(day),
      parseInt(hour ?? '0'), parseInt(minute ?? '0'),
    );
    if (!isNaN(d.getTime())) return d.toISOString();
  }

  const d = new Date(str);
  if (!isNaN(d.getTime())) return d.toISOString();

  return null;
}

function parseDateTiime(raw: unknown): string | null {
  if (!raw) return null;
  const str = String(raw);

  if (/^\d+(\.\d+)?$/.test(str)) {
    const serial = parseFloat(str);
    const epoch = new Date(Date.UTC(1899, 11, 30));
    const ms = epoch.getTime() + serial * 86400000;
    const d = new Date(ms);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }

  const fmtParts = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (fmtParts) {
    const [, day, month, year] = fmtParts;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  const d = new Date(str);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);

  return null;
}

function formatMySQLDate(isoDate: string): string {
  return new Date(isoDate).toISOString().slice(0, 19).replace('T', ' ');
}

// ---------------------------------------------------------------------------
// POST /api/finance-import/sales   (SSE — import Popina sales from .xlsx)
// ---------------------------------------------------------------------------

financeImportRoutes.post('/sales', upload.single('file'), async (req: Request, res: Response) => {
  if (!req.file) {
    res.status(400).json({ status: 'error', message: 'Fichier requis' });
    return;
  }

  startSSE(res);

  let mysqlConn;
  try {
    sendSSE(res, 'progress', { step: 'parse', message: 'Lecture du fichier Excel...' });

    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];

    // Fix truncated range: some xlsx files declare a !ref that doesn't cover all columns
    let maxCol = 0;
    let maxRow = 0;
    for (const k of Object.keys(sheet)) {
      if (k.startsWith('!')) continue;
      const d = XLSX.utils.decode_cell(k);
      if (d.c > maxCol) maxCol = d.c;
      if (d.r > maxRow) maxRow = d.r;
    }
    if (maxCol > 0 || maxRow > 0) {
      sheet['!ref'] = `A1:${XLSX.utils.encode_col(maxCol)}${maxRow + 1}`;
    }

    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);

    sendSSE(res, 'progress', { step: 'parsed', message: `${rows.length} lignes trouvées` });

    sendSSE(res, 'progress', { step: 'mysql', message: 'Connexion MySQL...' });
    try {
      mysqlConn = await getMysqlPool().getConnection();
      sendSSE(res, 'progress', { step: 'mysql', message: 'MySQL connecté ✓' });
    } catch (mysqlErr) {
      const msg = mysqlErr instanceof Error ? mysqlErr.message : String(mysqlErr);
      sendSSE(res, 'progress', { step: 'warn', message: `MySQL indisponible — import Supabase seul : ${msg}` });
    }

    if (mysqlConn) await mysqlConn.beginTransaction();

    const mysqlStmt = `INSERT IGNORE INTO sales
      (id, date, salle, table_number, parent, cat, name, unit, tier, tax, quantity, brut, discount, net, tva, ht, ticket)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

    let imported = 0;
    let skipped = 0;
    let mysqlInserted = 0;
    let supabaseInserted = 0;
    const BATCH = 200;
    let supabaseBatch: Array<Record<string, unknown>> = [];
    let mysqlBatchCount = 0;

    if (rows.length > 0) {
      sendSSE(res, 'progress', { step: 'columns', message: `Colonnes: ${Object.keys(rows[0]).join(', ')}` });
    }

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];

      const cancelled = row['cancelled'];
      if (cancelled === true || String(cancelled ?? '').toUpperCase() === 'VRAI') { skipped++; continue; }

      const ticket = String(row['ticket'] ?? '').trim();
      const name = String(row['name'] ?? '').trim();
      if (!ticket || !name) { skipped++; continue; }

      const date = parseDatePopina(row['date']);
      if (!date) { skipped++; continue; }

      const id = crypto.createHash('md5').update(ticket + name).digest('hex');
      const salle = String(row['salle'] ?? '');
      const table_number = parseInt(String(row['table'] ?? '0'), 10) || 0;
      const parent = String(row['parent'] ?? '');
      const cat = String(row['cat'] ?? '');
      const unit = parseFloat(String(row['unit'] ?? '0')) || 0;
      const tier = String(row['tier'] ?? '');
      const tax = parseFloat(String(row['tax'] ?? '0')) || 0;
      const quantity = parseInt(String(row['quantity'] ?? '0'), 10) || 0;
      const brut = parseFloat(String(row['brut'] ?? '0')) || 0;
      const discount = parseFloat(String(row['discount'] ?? '0')) || 0;
      const net = parseFloat(String(row['net'] ?? row['brut'] ?? '0')) || 0;
      const tva = parseFloat(String(row['tva'] ?? '0')) || 0;
      const ht = parseFloat(String(row['ht'] ?? '0')) || 0;
      const ticketInt = parseInt(ticket, 10) || 0;

      // MySQL (types must match: table_number=int, unit=float, ticket=int, quantity=int)
      if (mysqlConn) {
        try {
          await mysqlConn.execute(mysqlStmt, [
            id, formatMySQLDate(date), salle, table_number, parent, cat, name,
            unit, tier, tax, quantity, brut, discount, net, tva, ht, ticketInt,
          ]);
          mysqlInserted++;
        } catch (mysqlErr) {
          if (mysqlInserted === 0) {
            sendSSE(res, 'progress', { step: 'warn', message: `MySQL insert error: ${(mysqlErr as Error).message}` });
          }
        }
      }

      // Supabase batch (keeps original string ticket for TEXT id matching)
      supabaseBatch.push({
        id, date, salle, table_number: String(row['table'] ?? ''), parent, cat, name,
        unit, tier, tax, quantity, brut, discount, net, tva, ht, ticket,
      });

      mysqlBatchCount++;
      imported++;

      if (mysqlConn && mysqlBatchCount >= BATCH) {
        await mysqlConn.commit();
        await mysqlConn.beginTransaction();
        mysqlBatchCount = 0;
      }

      if (supabaseBatch.length >= BATCH) {
        const { error, count } = await supabaseAdmin.from('sales').upsert(supabaseBatch, { onConflict: 'id', ignoreDuplicates: true });
        if (error) sendSSE(res, 'progress', { step: 'warn', message: `Supabase batch warn: ${error.message}` });
        else supabaseInserted += supabaseBatch.length;
        supabaseBatch = [];
      }

      if ((i + 1) % BATCH === 0) {
        sendSSE(res, 'progress', {
          step: 'batch',
          message: `${imported} traitées (MySQL: ${mysqlInserted}, Supabase: ${supabaseInserted})...`,
          current: i + 1,
          total: rows.length,
        });
      }
    }

    // Flush remaining
    if (mysqlConn) await mysqlConn.commit();

    if (supabaseBatch.length > 0) {
      const { error } = await supabaseAdmin.from('sales').upsert(supabaseBatch, { onConflict: 'id', ignoreDuplicates: true });
      if (error) sendSSE(res, 'progress', { step: 'warn', message: `Supabase batch final warn: ${error.message}` });
      else supabaseInserted += supabaseBatch.length;
    }

    sendSSE(res, 'done', { imported, mysqlInserted, supabaseInserted, skipped, total: rows.length });
    res.end();
  } catch (err) {
    if (mysqlConn) {
      try { await mysqlConn.rollback(); } catch { /* ignore */ }
    }
    console.error('Finance import sales error:', err);
    sendSSE(res, 'error', { message: err instanceof Error ? err.message : 'Erreur serveur' });
    res.end();
  } finally {
    if (mysqlConn) mysqlConn.release();
  }
});

// ---------------------------------------------------------------------------
// POST /api/finance-import/flux   (SSE — import Tiime flux from .xlsx)
// ---------------------------------------------------------------------------

financeImportRoutes.post('/flux', upload.single('file'), async (req: Request, res: Response) => {
  if (!req.file) {
    res.status(400).json({ status: 'error', message: 'Fichier requis' });
    return;
  }

  startSSE(res);

  let mysqlConn: Awaited<ReturnType<ReturnType<typeof getMysqlPool>['getConnection']>> | null = null;
  try {
    sendSSE(res, 'progress', { step: 'parse', message: 'Lecture du fichier Excel...' });

    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rawRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 }) as unknown[][];
    const dataRows = rawRows.slice(1);

    sendSSE(res, 'progress', { step: 'parsed', message: `${dataRows.length} lignes trouvées` });

    // --- MySQL connection (optional — import continues on Supabase if MySQL fails) ---
    sendSSE(res, 'progress', { step: 'mysql', message: 'Connexion MySQL...' });
    try {
      mysqlConn = await getMysqlPool().getConnection();
      sendSSE(res, 'progress', { step: 'mysql', message: 'MySQL connecté ✓' });
    } catch (mysqlErr) {
      const msg = mysqlErr instanceof Error ? mysqlErr.message : String(mysqlErr);
      sendSSE(res, 'progress', { step: 'warn', message: `MySQL indisponible — import Supabase seul : ${msg}` });
    }

    // --- Pre-load caches ---
    sendSSE(res, 'progress', { step: 'cache', message: 'Chargement du cache...' });

    const categoryCache: Record<string, string> = {};
    const existingFlux: Record<string, number> = {};

    if (mysqlConn) {
      const [catRows] = await mysqlConn.query(
        `SELECT label, MAX(category) as category FROM flux
         WHERE label IS NOT NULL AND category IS NOT NULL AND category != ''
         GROUP BY label`,
      ) as [Array<{ label: string; category: string }>, unknown];
      for (const r of catRows) categoryCache[r.label] = r.category;

      const [existingRows] = await mysqlConn.query(
        `SELECT CONCAT(date, '|', designation) as key_id, id FROM flux`,
      ) as [Array<{ key_id: string; id: number }>, unknown];
      for (const r of existingRows) existingFlux[r.key_id] = r.id;

      await mysqlConn.beginTransaction();
    }

    const { data: sbExistingRows } = await supabaseAdmin.from('flux').select('id, date, designation');
    const sbExistingFlux: Record<string, string> = {};
    for (const r of sbExistingRows ?? []) {
      sbExistingFlux[`${r.date}|${r.designation}`] = r.id;
    }

    const mysqlInsertStmt = 'INSERT INTO flux (date, designation, amount, label, category) VALUES (?, ?, ?, ?, ?)';
    const mysqlUpdateStmt = 'UPDATE flux SET amount = ?, label = ?, category = IFNULL(category, ?) WHERE id = ?';

    let imported = 0;
    let updated = 0;
    let skipped = 0;
    let mysqlWrites = 0;
    let mysqlBatchCount = 0;
    const BATCH = 200;
    const sbInsertBatch: Array<Record<string, unknown>> = [];

    for (let i = 0; i < dataRows.length; i++) {
      const data = dataRows[i];
      if (!Array.isArray(data) || data.length < 5) { skipped++; continue; }

      const [, rawDate, designation, amount, label] = data;
      const date = parseDateTiime(rawDate);
      if (!date) { skipped++; continue; }

      const labelStr = String(label ?? '');
      const desigStr = String(designation ?? '');
      const amountNum = Number(amount ?? 0);
      const existingCategory = categoryCache[labelStr] ?? null;
      const fluxKey = `${date}|${desigStr}`;

      // --- MySQL write ---
      if (mysqlConn) {
        try {
          const existingId = existingFlux[fluxKey];
          if (existingId) {
            await mysqlConn.execute(mysqlUpdateStmt, [amountNum, labelStr, existingCategory, existingId]);
            updated++;
          } else {
            await mysqlConn.execute(mysqlInsertStmt, [date, desigStr, amountNum, labelStr, existingCategory]);
            imported++;
            existingFlux[fluxKey] = -1;
          }
          mysqlWrites++;
        } catch (mysqlErr) {
          if (mysqlWrites === 0) {
            sendSSE(res, 'progress', { step: 'warn', message: `MySQL write error: ${(mysqlErr as Error).message}` });
          }
        }
      } else {
        imported++;
      }

      // --- Supabase write ---
      const sbExistingId = sbExistingFlux[fluxKey];
      if (sbExistingId && sbExistingId !== 'pending') {
        await supabaseAdmin.from('flux').update({
          amount: amountNum,
          label: labelStr,
          ...(existingCategory ? { category: existingCategory } : {}),
        }).eq('id', sbExistingId);
      } else if (!sbExistingId) {
        sbInsertBatch.push({
          date, designation: desigStr, amount: amountNum, label: labelStr, category: existingCategory,
        });
        sbExistingFlux[fluxKey] = 'pending';

        if (sbInsertBatch.length >= BATCH) {
          const { error } = await supabaseAdmin.from('flux').insert(sbInsertBatch);
          if (error) sendSSE(res, 'progress', { step: 'warn', message: `Supabase batch warn: ${error.message}` });
          sbInsertBatch.length = 0;
        }
      }

      mysqlBatchCount++;
      if (mysqlConn && mysqlBatchCount >= BATCH) {
        await mysqlConn.commit();
        await mysqlConn.beginTransaction();
        mysqlBatchCount = 0;
      }

      if ((i + 1) % 100 === 0) {
        sendSSE(res, 'progress', {
          step: 'batch',
          message: `${imported} insérées, ${updated} maj (MySQL: ${mysqlWrites})...`,
          current: i + 1,
          total: dataRows.length,
        });
      }
    }

    // Flush remaining
    if (mysqlConn) await mysqlConn.commit();

    if (sbInsertBatch.length > 0) {
      const { error } = await supabaseAdmin.from('flux').insert(sbInsertBatch);
      if (error) sendSSE(res, 'progress', { step: 'warn', message: `Supabase batch final warn: ${error.message}` });
    }

    // Backfill missing categories
    sendSSE(res, 'progress', { step: 'backfill', message: 'Mise à jour des catégories manquantes...' });

    if (mysqlConn) {
      await mysqlConn.query(`
        UPDATE flux f1
        INNER JOIN (
          SELECT label, MAX(category) as category
          FROM flux
          WHERE label IS NOT NULL AND category IS NOT NULL AND category != ''
          GROUP BY label
        ) f2 ON f1.label = f2.label
        SET f1.category = f2.category
        WHERE (f1.category IS NULL OR f1.category = '')
        AND f1.label IS NOT NULL
      `);
    }

    const { data: freshCats } = await supabaseAdmin
      .from('flux')
      .select('label, category')
      .not('label', 'is', null)
      .not('category', 'is', null)
      .neq('category', '');

    const fullCatMap: Record<string, string> = {};
    for (const r of freshCats ?? []) {
      if (r.label && r.category) fullCatMap[r.label] = r.category;
    }

    const { data: uncategorized } = await supabaseAdmin
      .from('flux')
      .select('id, label')
      .not('label', 'is', null)
      .or('category.is.null,category.eq.');

    let backfilled = 0;
    for (const row of uncategorized ?? []) {
      const cat = fullCatMap[row.label];
      if (cat) {
        await supabaseAdmin.from('flux').update({ category: cat }).eq('id', row.id);
        backfilled++;
      }
    }

    sendSSE(res, 'done', { imported, updated, mysqlWrites, skipped, backfilled, total: dataRows.length });
    res.end();
  } catch (err) {
    if (mysqlConn) {
      try { await mysqlConn.rollback(); } catch { /* ignore */ }
    }
    console.error('Finance import flux error:', err);
    sendSSE(res, 'error', { message: err instanceof Error ? err.message : 'Erreur serveur' });
    res.end();
  } finally {
    if (mysqlConn) mysqlConn.release();
  }
});
