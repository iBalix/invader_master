/**
 * Back-office: codes promo (coupons).
 */

import { Router } from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';

export const couponsRoutes = Router();

couponsRoutes.use(authMiddleware, requireRole('admin', 'salarie'));

couponsRoutes.get('/', async (_req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('coupons')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ status: 'success', items: data ?? [] });
  } catch (err) {
    console.error('List coupons error:', err);
    res.status(500).json({ status: 'error', message: 'Erreur serveur' });
  }
});

couponsRoutes.post('/', async (req, res) => {
  try {
    const body = { ...req.body };
    if (typeof body.code === 'string') body.code = body.code.trim().toUpperCase();
    const { data, error } = await supabaseAdmin
      .from('coupons')
      .insert(body)
      .select()
      .single();
    if (error) {
      res.status(400).json({ status: 'error', message: error.message });
      return;
    }
    res.status(201).json({ status: 'success', coupon: data });
  } catch (err) {
    console.error('Create coupon error:', err);
    res.status(500).json({ status: 'error', message: 'Erreur serveur' });
  }
});

couponsRoutes.put('/:id', async (req, res) => {
  try {
    const body = { ...req.body };
    if (typeof body.code === 'string') body.code = body.code.trim().toUpperCase();
    const { data, error } = await supabaseAdmin
      .from('coupons')
      .update(body)
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) {
      res.status(400).json({ status: 'error', message: error.message });
      return;
    }
    res.json({ status: 'success', coupon: data });
  } catch (err) {
    console.error('Update coupon error:', err);
    res.status(500).json({ status: 'error', message: 'Erreur serveur' });
  }
});

couponsRoutes.delete('/:id', async (req, res) => {
  try {
    const { error } = await supabaseAdmin
      .from('coupons')
      .delete()
      .eq('id', req.params.id);
    if (error) throw error;
    res.json({ status: 'success' });
  } catch (err) {
    console.error('Delete coupon error:', err);
    res.status(500).json({ status: 'error', message: 'Erreur serveur' });
  }
});
