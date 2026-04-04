import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import pool from '../config/mysql.js';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';

export const cashRoutes = Router();

cashRoutes.use(authMiddleware, requireRole('admin', 'salarie'));

cashRoutes.get('/', async (_req, res) => {
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT * FROM Cash ORDER BY date DESC'
    );
    res.json({ status: 'success', items: rows });
  } catch (err) {
    console.error('Cash list error:', err);
    res.status(500).json({ status: 'error', message: 'Erreur serveur' });
  }
});

cashRoutes.get('/stats', async (_req, res) => {
  try {
    const [totalRows] = await pool.query<RowDataPacket[]>(
      'SELECT COALESCE(SUM(montant), 0) AS total FROM Cash WHERE date >= DATE_SUB(NOW(), INTERVAL 30 DAY) AND montant > 0'
    );
    const [balanceRows] = await pool.query<RowDataPacket[]>(
      'SELECT COALESCE(SUM(montant), 0) AS total FROM Cash'
    );

    res.json({
      status: 'success',
      total30days: Number(totalRows[0].total),
      balance: Number(balanceRows[0].total),
    });
  } catch (err) {
    console.error('Cash stats error:', err);
    res.status(500).json({ status: 'error', message: 'Erreur serveur' });
  }
});

cashRoutes.post('/', async (req, res) => {
  try {
    const { responsable, amount, comment } = req.body;

    if (!responsable || amount === undefined || amount === null) {
      res.status(400).json({ status: 'error', message: 'responsable et amount requis' });
      return;
    }

    const [result] = await pool.query<ResultSetHeader>(
      'INSERT INTO Cash (responsable, montant, date, comment) VALUES (?, ?, NOW(), ?)',
      [responsable, Number(amount), comment ?? '']
    );

    res.status(201).json({ status: 'success', id: result.insertId });
  } catch (err) {
    console.error('Cash add error:', err);
    res.status(500).json({ status: 'error', message: 'Erreur serveur' });
  }
});

cashRoutes.delete('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ status: 'error', message: 'ID invalide' });
      return;
    }

    await pool.query<ResultSetHeader>('DELETE FROM Cash WHERE id = ?', [id]);
    res.json({ status: 'success' });
  } catch (err) {
    console.error('Cash delete error:', err);
    res.status(500).json({ status: 'error', message: 'Erreur serveur' });
  }
});
