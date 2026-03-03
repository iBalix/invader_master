import { Router } from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';

export const tvConfigRoutes = Router();

tvConfigRoutes.use(authMiddleware, requireRole('admin', 'salarie'));

tvConfigRoutes.get('/', async (_req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('tv_configs')
      .select('*')
      .order('name', { ascending: true });

    if (error) throw error;

    res.json({ status: 'success', items: data ?? [] });
  } catch (err) {
    console.error('List tv configs error:', err);
    res.status(500).json({ status: 'error', message: 'Erreur serveur' });
  }
});

tvConfigRoutes.post('/', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('tv_configs')
      .insert(req.body)
      .select()
      .single();

    if (error) {
      res.status(400).json({ status: 'error', message: error.message });
      return;
    }

    res.status(201).json({ status: 'success', config: data });
  } catch (err) {
    console.error('Create tv config error:', err);
    res.status(500).json({ status: 'error', message: 'Erreur serveur' });
  }
});

tvConfigRoutes.put('/:id', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('tv_configs')
      .update(req.body)
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) {
      res.status(400).json({ status: 'error', message: error.message });
      return;
    }

    res.json({ status: 'success', config: data });
  } catch (err) {
    console.error('Update tv config error:', err);
    res.status(500).json({ status: 'error', message: 'Erreur serveur' });
  }
});

tvConfigRoutes.delete('/:id', async (req, res) => {
  try {
    const { error } = await supabaseAdmin
      .from('tv_configs')
      .delete()
      .eq('id', req.params.id);

    if (error) throw error;

    res.json({ status: 'success' });
  } catch (err) {
    console.error('Delete tv config error:', err);
    res.status(500).json({ status: 'error', message: 'Erreur serveur' });
  }
});
