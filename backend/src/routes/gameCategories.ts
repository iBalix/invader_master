import { Router } from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';

export const gameCategoryRoutes = Router();

gameCategoryRoutes.use(authMiddleware, requireRole('admin', 'salarie'));

gameCategoryRoutes.get('/', async (_req, res) => {
  try {
    const { data: categories, error } = await supabaseAdmin
      .from('game_categories')
      .select('*')
      .order('display_order', { ascending: true });

    if (error) throw error;

    const { data: counts } = await supabaseAdmin
      .from('game_category_games')
      .select('category_id');

    const countMap: Record<string, number> = {};
    if (counts) {
      for (const row of counts) {
        countMap[row.category_id] = (countMap[row.category_id] ?? 0) + 1;
      }
    }

    const items = (categories ?? []).map((c) => ({
      ...c,
      gameCount: countMap[c.id] ?? 0,
    }));

    res.json({ status: 'success', items });
  } catch (err) {
    console.error('List game categories error:', err);
    res.status(500).json({ status: 'error', message: 'Erreur serveur' });
  }
});

gameCategoryRoutes.post('/', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('game_categories')
      .insert(req.body)
      .select()
      .single();

    if (error) {
      res.status(400).json({ status: 'error', message: error.message });
      return;
    }

    res.status(201).json({ status: 'success', category: data });
  } catch (err) {
    console.error('Create game category error:', err);
    res.status(500).json({ status: 'error', message: 'Erreur serveur' });
  }
});

gameCategoryRoutes.put('/:id', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('game_categories')
      .update(req.body)
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) {
      res.status(400).json({ status: 'error', message: error.message });
      return;
    }

    res.json({ status: 'success', category: data });
  } catch (err) {
    console.error('Update game category error:', err);
    res.status(500).json({ status: 'error', message: 'Erreur serveur' });
  }
});

gameCategoryRoutes.delete('/:id', async (req, res) => {
  try {
    const { error } = await supabaseAdmin
      .from('game_categories')
      .delete()
      .eq('id', req.params.id);

    if (error) throw error;

    res.json({ status: 'success' });
  } catch (err) {
    console.error('Delete game category error:', err);
    res.status(500).json({ status: 'error', message: 'Erreur serveur' });
  }
});
