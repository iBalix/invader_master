import { Router } from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';

export const gameConsoleRoutes = Router();

gameConsoleRoutes.use(authMiddleware, requireRole('admin', 'salarie'));

gameConsoleRoutes.get('/', async (_req, res) => {
  try {
    const { data: consoles, error } = await supabaseAdmin
      .from('game_consoles')
      .select('*')
      .order('name', { ascending: true });

    if (error) throw error;

    const { data: counts } = await supabaseAdmin
      .from('games')
      .select('console_id');

    const countMap: Record<string, number> = {};
    if (counts) {
      for (const row of counts) {
        countMap[row.console_id] = (countMap[row.console_id] ?? 0) + 1;
      }
    }

    const items = (consoles ?? []).map((c) => ({
      ...c,
      gameCount: countMap[c.id] ?? 0,
    }));

    res.json({ status: 'success', items });
  } catch (err) {
    console.error('List game consoles error:', err);
    res.status(500).json({ status: 'error', message: 'Erreur serveur' });
  }
});

gameConsoleRoutes.post('/', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('game_consoles')
      .insert(req.body)
      .select()
      .single();

    if (error) {
      res.status(400).json({ status: 'error', message: error.message });
      return;
    }

    res.status(201).json({ status: 'success', console: data });
  } catch (err) {
    console.error('Create game console error:', err);
    res.status(500).json({ status: 'error', message: 'Erreur serveur' });
  }
});

gameConsoleRoutes.put('/:id', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('game_consoles')
      .update(req.body)
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) {
      res.status(400).json({ status: 'error', message: error.message });
      return;
    }

    res.json({ status: 'success', console: data });
  } catch (err) {
    console.error('Update game console error:', err);
    res.status(500).json({ status: 'error', message: 'Erreur serveur' });
  }
});

gameConsoleRoutes.delete('/:id', async (req, res) => {
  try {
    const { error } = await supabaseAdmin
      .from('game_consoles')
      .delete()
      .eq('id', req.params.id);

    if (error) throw error;

    res.json({ status: 'success' });
  } catch (err) {
    console.error('Delete game console error:', err);
    res.status(500).json({ status: 'error', message: 'Erreur serveur' });
  }
});
