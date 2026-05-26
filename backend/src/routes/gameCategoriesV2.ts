import { Router } from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';

export const gameCategoryV2Routes = Router();

gameCategoryV2Routes.use(authMiddleware, requireRole('admin', 'salarie'));

const ALLOWED = ['name', 'name_en', 'display_order', 'icon_name', 'color', 'texture_url'] as const;

function pick(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of ALLOWED) {
    if (key in body) out[key] = body[key];
  }
  return out;
}

gameCategoryV2Routes.get('/', async (_req, res) => {
  try {
    const { data: categories, error } = await supabaseAdmin
      .from('game_categories_v2')
      .select('*')
      .order('display_order', { ascending: true });

    if (error) throw error;

    const { data: counts } = await supabaseAdmin
      .from('game_category_games_v2')
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
    console.error('List game categories v2 error:', err);
    res.status(500).json({ status: 'error', message: 'Erreur serveur' });
  }
});

gameCategoryV2Routes.post('/', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('game_categories_v2')
      .insert(pick(req.body))
      .select()
      .single();

    if (error) {
      res.status(400).json({ status: 'error', message: error.message });
      return;
    }

    res.status(201).json({ status: 'success', category: data });
  } catch (err) {
    console.error('Create game category v2 error:', err);
    res.status(500).json({ status: 'error', message: 'Erreur serveur' });
  }
});

gameCategoryV2Routes.put('/:id', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('game_categories_v2')
      .update(pick(req.body))
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) {
      res.status(400).json({ status: 'error', message: error.message });
      return;
    }

    res.json({ status: 'success', category: data });
  } catch (err) {
    console.error('Update game category v2 error:', err);
    res.status(500).json({ status: 'error', message: 'Erreur serveur' });
  }
});

gameCategoryV2Routes.delete('/:id', async (req, res) => {
  try {
    const { error } = await supabaseAdmin
      .from('game_categories_v2')
      .delete()
      .eq('id', req.params.id);

    if (error) throw error;

    res.json({ status: 'success' });
  } catch (err) {
    console.error('Delete game category v2 error:', err);
    res.status(500).json({ status: 'error', message: 'Erreur serveur' });
  }
});
