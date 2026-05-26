import { Router } from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';

export const gameConsoleV2Routes = Router();

gameConsoleV2Routes.use(authMiddleware, requireRole('admin', 'salarie'));

const ALLOWED = ['name', 'display_name', 'library', 'logo_url'] as const;

function pick(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of ALLOWED) {
    if (key in body) out[key] = body[key];
  }
  return out;
}

gameConsoleV2Routes.get('/', async (_req, res) => {
  try {
    const { data: consoles, error } = await supabaseAdmin
      .from('game_consoles_v2')
      .select('*')
      .order('name', { ascending: true });

    if (error) throw error;

    const { data: counts } = await supabaseAdmin
      .from('games_v2')
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
    console.error('List game consoles v2 error:', err);
    res.status(500).json({ status: 'error', message: 'Erreur serveur' });
  }
});

gameConsoleV2Routes.post('/', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('game_consoles_v2')
      .insert(pick(req.body))
      .select()
      .single();

    if (error) {
      res.status(400).json({ status: 'error', message: error.message });
      return;
    }

    res.status(201).json({ status: 'success', console: data });
  } catch (err) {
    console.error('Create game console v2 error:', err);
    res.status(500).json({ status: 'error', message: 'Erreur serveur' });
  }
});

gameConsoleV2Routes.put('/:id', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('game_consoles_v2')
      .update(pick(req.body))
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) {
      res.status(400).json({ status: 'error', message: error.message });
      return;
    }

    res.json({ status: 'success', console: data });
  } catch (err) {
    console.error('Update game console v2 error:', err);
    res.status(500).json({ status: 'error', message: 'Erreur serveur' });
  }
});

gameConsoleV2Routes.delete('/:id', async (req, res) => {
  try {
    const { error } = await supabaseAdmin
      .from('game_consoles_v2')
      .delete()
      .eq('id', req.params.id);

    if (error) throw error;

    res.json({ status: 'success' });
  } catch (err) {
    console.error('Delete game console v2 error:', err);
    res.status(500).json({ status: 'error', message: 'Erreur serveur' });
  }
});
