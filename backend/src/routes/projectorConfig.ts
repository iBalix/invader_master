import { Router } from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';

export const projectorConfigRoutes = Router();

projectorConfigRoutes.use(authMiddleware, requireRole('admin', 'salarie'));

projectorConfigRoutes.get('/', async (_req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('projector_config')
      .select('*')
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') throw error;

    res.json({ status: 'success', config: data ?? null });
  } catch (err) {
    console.error('Get projector config error:', err);
    res.status(500).json({ status: 'error', message: 'Erreur serveur' });
  }
});

projectorConfigRoutes.put('/', async (req, res) => {
  try {
    const { data: existing } = await supabaseAdmin
      .from('projector_config')
      .select('id')
      .limit(1)
      .single();

    let config;
    if (existing) {
      const { data, error } = await supabaseAdmin
        .from('projector_config')
        .update(req.body)
        .eq('id', existing.id)
        .select()
        .single();
      if (error) throw error;
      config = data;
    } else {
      const { data, error } = await supabaseAdmin
        .from('projector_config')
        .insert(req.body)
        .select()
        .single();
      if (error) throw error;
      config = data;
    }

    res.json({ status: 'success', config });
  } catch (err) {
    console.error('Update projector config error:', err);
    res.status(500).json({ status: 'error', message: 'Erreur serveur' });
  }
});

// Events sub-routes

projectorConfigRoutes.get('/events', async (_req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('projector_events')
      .select('*')
      .order('date', { ascending: true });

    if (error) throw error;

    res.json({ status: 'success', items: data ?? [] });
  } catch (err) {
    console.error('List projector events error:', err);
    res.status(500).json({ status: 'error', message: 'Erreur serveur' });
  }
});

projectorConfigRoutes.post('/events', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('projector_events')
      .insert(req.body)
      .select()
      .single();

    if (error) {
      res.status(400).json({ status: 'error', message: error.message });
      return;
    }

    res.status(201).json({ status: 'success', event: data });
  } catch (err) {
    console.error('Create projector event error:', err);
    res.status(500).json({ status: 'error', message: 'Erreur serveur' });
  }
});

projectorConfigRoutes.put('/events/:id', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('projector_events')
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
    console.error('Update projector event error:', err);
    res.status(500).json({ status: 'error', message: 'Erreur serveur' });
  }
});

projectorConfigRoutes.delete('/events/:id', async (req, res) => {
  try {
    const { error } = await supabaseAdmin
      .from('projector_events')
      .delete()
      .eq('id', req.params.id);

    if (error) throw error;

    res.json({ status: 'success' });
  } catch (err) {
    console.error('Delete projector event error:', err);
    res.status(500).json({ status: 'error', message: 'Erreur serveur' });
  }
});
