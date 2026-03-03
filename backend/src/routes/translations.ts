import { Router } from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';

export const translationRoutes = Router();

translationRoutes.use(authMiddleware, requireRole('admin', 'salarie'));

translationRoutes.get('/', async (_req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('translations')
      .select('*')
      .order('key', { ascending: true });

    if (error) throw error;

    res.json({ status: 'success', items: data ?? [] });
  } catch (err) {
    console.error('List translations error:', err);
    res.status(500).json({ status: 'error', message: 'Erreur serveur' });
  }
});

translationRoutes.post('/', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('translations')
      .insert(req.body)
      .select()
      .single();

    if (error) {
      res.status(400).json({ status: 'error', message: error.message });
      return;
    }

    res.status(201).json({ status: 'success', translation: data });
  } catch (err) {
    console.error('Create translation error:', err);
    res.status(500).json({ status: 'error', message: 'Erreur serveur' });
  }
});

translationRoutes.put('/:id', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('translations')
      .update(req.body)
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) {
      res.status(400).json({ status: 'error', message: error.message });
      return;
    }

    res.json({ status: 'success', translation: data });
  } catch (err) {
    console.error('Update translation error:', err);
    res.status(500).json({ status: 'error', message: 'Erreur serveur' });
  }
});

translationRoutes.delete('/:id', async (req, res) => {
  try {
    const { error } = await supabaseAdmin
      .from('translations')
      .delete()
      .eq('id', req.params.id);

    if (error) throw error;

    res.json({ status: 'success' });
  } catch (err) {
    console.error('Delete translation error:', err);
    res.status(500).json({ status: 'error', message: 'Erreur serveur' });
  }
});
