/**
 * Back-office: configs design des tables tactiles (presets activables/planifies).
 */

import { Router } from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';

export const designConfigRoutes = Router();

designConfigRoutes.use(authMiddleware, requireRole('admin', 'salarie'));

const ALLOWED = [
  'name',
  'background_image_url',
  'menu_button_color',
  'games_button_color',
  'active',
  'schedule_type',
  'starts_at',
  'ends_at',
  'recurring_days',
  'start_time',
  'end_time',
] as const;

function pick(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of ALLOWED) {
    if (key in body) out[key] = body[key];
  }
  return out;
}

designConfigRoutes.get('/', async (_req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('design_configs')
      .select('*')
      .order('created_at', { ascending: true });
    if (error) throw error;
    res.json({ status: 'success', items: data ?? [] });
  } catch (err) {
    console.error('List design configs error:', err);
    res.status(500).json({ status: 'error', message: 'Erreur serveur' });
  }
});

designConfigRoutes.post('/', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('design_configs')
      .insert(pick(req.body))
      .select()
      .single();
    if (error) {
      res.status(400).json({ status: 'error', message: error.message });
      return;
    }
    res.status(201).json({ status: 'success', config: data });
  } catch (err) {
    console.error('Create design config error:', err);
    res.status(500).json({ status: 'error', message: 'Erreur serveur' });
  }
});

designConfigRoutes.put('/:id', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('design_configs')
      .update(pick(req.body))
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) {
      res.status(400).json({ status: 'error', message: error.message });
      return;
    }
    res.json({ status: 'success', config: data });
  } catch (err) {
    console.error('Update design config error:', err);
    res.status(500).json({ status: 'error', message: 'Erreur serveur' });
  }
});

designConfigRoutes.delete('/:id', async (req, res) => {
  try {
    const { error } = await supabaseAdmin
      .from('design_configs')
      .delete()
      .eq('id', req.params.id);
    if (error) throw error;
    res.json({ status: 'success' });
  } catch (err) {
    console.error('Delete design config error:', err);
    res.status(500).json({ status: 'error', message: 'Erreur serveur' });
  }
});
