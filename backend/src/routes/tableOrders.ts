/**
 * Back-office: lecture des commandes passees depuis les tables tactiles.
 * V1 = consultation seulement (stub KDS).
 * V2 = passage de statut received -> preparing -> ready -> delivered.
 */

import { Router } from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';

export const tableOrdersRoutes = Router();

tableOrdersRoutes.use(authMiddleware, requireRole('admin', 'salarie'));

const STATUSES = ['received', 'preparing', 'ready', 'delivered', 'cancelled'] as const;

tableOrdersRoutes.get('/', async (req, res) => {
  try {
    const { status, hostname, limit } = req.query as Record<string, string | undefined>;
    let query = supabaseAdmin
      .from('table_orders')
      .select('*')
      .order('created_at', { ascending: false });
    if (status && STATUSES.includes(status as any)) query = query.eq('status', status);
    if (hostname) query = query.eq('hostname', hostname);
    const lim = Math.min(Math.max(parseInt(limit ?? '100', 10) || 100, 1), 500);
    query = query.limit(lim);
    const { data, error } = await query;
    if (error) throw error;
    res.json({ status: 'success', items: data ?? [] });
  } catch (err) {
    console.error('List table orders error:', err);
    res.status(500).json({ status: 'error', message: 'Erreur serveur' });
  }
});

tableOrdersRoutes.get('/:id', async (req, res) => {
  try {
    const { data: order, error } = await supabaseAdmin
      .from('table_orders')
      .select('*')
      .eq('id', req.params.id)
      .single();
    if (error || !order) {
      res.status(404).json({ status: 'error', message: 'Commande introuvable' });
      return;
    }
    const { data: items } = await supabaseAdmin
      .from('table_order_items')
      .select('*')
      .eq('order_id', order.id);
    res.json({ status: 'success', order, items: items ?? [] });
  } catch (err) {
    console.error('Get table order error:', err);
    res.status(500).json({ status: 'error', message: 'Erreur serveur' });
  }
});

tableOrdersRoutes.put('/:id/status', async (req, res) => {
  try {
    const { status } = req.body ?? {};
    if (!STATUSES.includes(status)) {
      res.status(400).json({ status: 'error', message: 'status invalide' });
      return;
    }
    const update: Record<string, unknown> = { status };
    if (status === 'ready') update.ready_at = new Date().toISOString();
    if (status === 'delivered') update.delivered_at = new Date().toISOString();
    if (status === 'cancelled') update.cancelled_at = new Date().toISOString();
    const { data, error } = await supabaseAdmin
      .from('table_orders')
      .update(update)
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) {
      res.status(400).json({ status: 'error', message: error.message });
      return;
    }
    res.json({ status: 'success', order: data });
  } catch (err) {
    console.error('Update table order status error:', err);
    res.status(500).json({ status: 'error', message: 'Erreur serveur' });
  }
});
