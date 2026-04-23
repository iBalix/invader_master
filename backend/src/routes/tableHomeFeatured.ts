/**
 * Back-office: items mis en avant ecran d'accueil des tables tactiles.
 */

import { Router } from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';

export const tableHomeFeaturedRoutes = Router();

tableHomeFeaturedRoutes.use(authMiddleware, requireRole('admin', 'salarie'));

tableHomeFeaturedRoutes.get('/', async (_req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('table_home_featured')
      .select('*')
      .order('position', { ascending: true });
    if (error) throw error;
    res.json({ status: 'success', items: data ?? [] });
  } catch (err) {
    console.error('List home featured error:', err);
    res.status(500).json({ status: 'error', message: 'Erreur serveur' });
  }
});

tableHomeFeaturedRoutes.post('/', async (req, res) => {
  try {
    console.log('[home-featured] POST payload:', JSON.stringify(req.body));
    const { data, error } = await supabaseAdmin
      .from('table_home_featured')
      .insert(req.body)
      .select()
      .single();
    if (error) {
      console.error('[home-featured] Supabase insert error:', error);
      res.status(400).json({ status: 'error', message: error.message, details: error });
      return;
    }
    res.status(201).json({ status: 'success', item: data });
  } catch (err) {
    console.error('Create home featured error:', err);
    res.status(500).json({ status: 'error', message: 'Erreur serveur' });
  }
});

tableHomeFeaturedRoutes.put('/:id', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('table_home_featured')
      .update(req.body)
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) {
      res.status(400).json({ status: 'error', message: error.message });
      return;
    }
    res.json({ status: 'success', item: data });
  } catch (err) {
    console.error('Update home featured error:', err);
    res.status(500).json({ status: 'error', message: 'Erreur serveur' });
  }
});

tableHomeFeaturedRoutes.delete('/:id', async (req, res) => {
  try {
    const { error } = await supabaseAdmin
      .from('table_home_featured')
      .delete()
      .eq('id', req.params.id);
    if (error) throw error;
    res.json({ status: 'success' });
  } catch (err) {
    console.error('Delete home featured error:', err);
    res.status(500).json({ status: 'error', message: 'Erreur serveur' });
  }
});
