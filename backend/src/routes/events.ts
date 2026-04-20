/**
 * Routes events (anciennement /api/projector-config/events).
 * La table SQL `events` est generique : projecteur (legacy) ET tables tactiles (V2).
 *
 * Monte aussi sur /api/projector-config/events comme alias (compat projo.php).
 */

import { Router } from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';

export const eventsRoutes = Router();

eventsRoutes.use(authMiddleware, requireRole('admin', 'salarie'));

eventsRoutes.get('/', async (_req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('events')
      .select('*')
      .order('date', { ascending: true });
    if (error) throw error;
    res.json({ status: 'success', items: data ?? [] });
  } catch (err) {
    console.error('List events error:', err);
    res.status(500).json({ status: 'error', message: 'Erreur serveur' });
  }
});

eventsRoutes.post('/', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('events')
      .insert(req.body)
      .select()
      .single();
    if (error) {
      res.status(400).json({ status: 'error', message: error.message });
      return;
    }
    res.status(201).json({ status: 'success', event: data });
  } catch (err) {
    console.error('Create event error:', err);
    res.status(500).json({ status: 'error', message: 'Erreur serveur' });
  }
});

eventsRoutes.put('/:id', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('events')
      .update(req.body)
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) {
      res.status(400).json({ status: 'error', message: error.message });
      return;
    }
    res.json({ status: 'success', event: data });
  } catch (err) {
    console.error('Update event error:', err);
    res.status(500).json({ status: 'error', message: 'Erreur serveur' });
  }
});

eventsRoutes.delete('/:id', async (req, res) => {
  try {
    const { error } = await supabaseAdmin
      .from('events')
      .delete()
      .eq('id', req.params.id);
    if (error) throw error;
    res.json({ status: 'success' });
  } catch (err) {
    console.error('Delete event error:', err);
    res.status(500).json({ status: 'error', message: 'Erreur serveur' });
  }
});
