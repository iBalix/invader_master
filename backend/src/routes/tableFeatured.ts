/**
 * Back-office: mises en avant tables tactiles (table unique fusionnee).
 * Chaque item peut apparaitre sur l'accueil et/ou la veille (show_on_home,
 * show_on_screensaver).
 */

import { Router } from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';

export const tableFeaturedRoutes = Router();

tableFeaturedRoutes.use(authMiddleware, requireRole('admin', 'salarie'));

const ALLOWED = [
  'position', 'title', 'subtitle', 'description', 'image_url',
  'cta_label', 'cta_target', 'lottie_url',
  'show_on_home', 'show_on_screensaver', 'active',
] as const;

function pick(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of ALLOWED) {
    if (key in body) out[key] = body[key];
  }
  return out;
}

tableFeaturedRoutes.get('/', async (_req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('table_featured')
      .select('*')
      .order('position', { ascending: true });
    if (error) throw error;
    res.json({ status: 'success', items: data ?? [] });
  } catch (err) {
    console.error('List featured error:', err);
    res.status(500).json({ status: 'error', message: 'Erreur serveur' });
  }
});

tableFeaturedRoutes.post('/', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('table_featured')
      .insert(pick(req.body))
      .select()
      .single();
    if (error) {
      res.status(400).json({ status: 'error', message: error.message });
      return;
    }
    res.status(201).json({ status: 'success', item: data });
  } catch (err) {
    console.error('Create featured error:', err);
    res.status(500).json({ status: 'error', message: 'Erreur serveur' });
  }
});

tableFeaturedRoutes.put('/:id', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('table_featured')
      .update(pick(req.body))
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) {
      res.status(400).json({ status: 'error', message: error.message });
      return;
    }
    res.json({ status: 'success', item: data });
  } catch (err) {
    console.error('Update featured error:', err);
    res.status(500).json({ status: 'error', message: 'Erreur serveur' });
  }
});

tableFeaturedRoutes.delete('/:id', async (req, res) => {
  try {
    const { error } = await supabaseAdmin
      .from('table_featured')
      .delete()
      .eq('id', req.params.id);
    if (error) throw error;
    res.json({ status: 'success' });
  } catch (err) {
    console.error('Delete featured error:', err);
    res.status(500).json({ status: 'error', message: 'Erreur serveur' });
  }
});
