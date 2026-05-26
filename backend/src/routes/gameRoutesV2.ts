import { Router } from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';

export const gameV2Routes = Router();

gameV2Routes.use(authMiddleware, requireRole('admin', 'salarie'));

const ALLOWED = [
  'name', 'name_en', 'subtitle', 'subtitle_en', 'description', 'description_en',
  'file_name', 'console_id', 'platform', 'competition', 'competition_link',
  'cover_url', 'display_order', 'max_players',
  'youtube_video_id', 'youtube_start_sec', 'youtube_duration_sec',
  'control_a', 'control_b', 'control_x', 'control_y',
  'control_l', 'control_r', 'control_start', 'control_select',
  'special_note',
] as const;

function pick(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of ALLOWED) {
    if (key in body) out[key] = body[key];
  }
  // Clamp max_players to 1-4
  if (out.max_players != null) {
    const n = Number(out.max_players);
    if (Number.isFinite(n)) out.max_players = Math.max(1, Math.min(4, Math.round(n)));
    else delete out.max_players;
  }
  // Sanitize youtube_start_sec / youtube_duration_sec (integers >= 0)
  for (const k of ['youtube_start_sec', 'youtube_duration_sec'] as const) {
    if (out[k] != null && out[k] !== '') {
      const n = Number(out[k]);
      if (Number.isFinite(n) && n >= 0) out[k] = Math.round(n);
      else out[k] = null;
    }
  }
  return out;
}

gameV2Routes.get('/', async (req, res) => {
  try {
    const { search } = req.query;

    let query = supabaseAdmin
      .from('games_v2')
      .select('*')
      .order('display_order', { ascending: true });

    if (typeof search === 'string' && search.trim()) {
      query = query.ilike('name', `%${search.trim()}%`);
    }

    const { data, error } = await query;
    if (error) throw error;

    const { data: consoles } = await supabaseAdmin
      .from('game_consoles_v2')
      .select('id, name, display_name');
    const consoleMap = new Map(
      (consoles ?? []).map((c) => [c.id, { name: c.name, display_name: c.display_name }]),
    );

    const { data: catLinks } = await supabaseAdmin
      .from('game_category_games_v2')
      .select('game_id, category_id');
    const { data: cats } = await supabaseAdmin.from('game_categories_v2').select('id, name');
    const catMap = new Map((cats ?? []).map((c) => [c.id, c.name]));

    const gameCats: Record<string, string[]> = {};
    if (catLinks) {
      for (const l of catLinks) {
        if (!gameCats[l.game_id]) gameCats[l.game_id] = [];
        const name = catMap.get(l.category_id);
        if (name) gameCats[l.game_id].push(name);
      }
    }

    const items = (data ?? []).map((g) => {
      const c = consoleMap.get(g.console_id);
      return {
        ...g,
        console_name: c?.name ?? null,
        console_display_name: c?.display_name ?? null,
        categories: gameCats[g.id] ?? [],
      };
    });

    res.json({ status: 'success', items });
  } catch (err) {
    console.error('List games v2 error:', err);
    res.status(500).json({ status: 'error', message: 'Erreur serveur' });
  }
});

gameV2Routes.get('/:id', async (req, res) => {
  try {
    const { data: game, error } = await supabaseAdmin
      .from('games_v2')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (error || !game) {
      res.status(404).json({ status: 'error', message: 'Jeu introuvable' });
      return;
    }

    const { data: images } = await supabaseAdmin
      .from('game_images_v2')
      .select('id, image_url, position')
      .eq('game_id', game.id)
      .order('position', { ascending: true });

    const { data: catLinks } = await supabaseAdmin
      .from('game_category_games_v2')
      .select('category_id')
      .eq('game_id', game.id);

    let console_: unknown = null;
    if (game.console_id) {
      const { data } = await supabaseAdmin
        .from('game_consoles_v2')
        .select('id, name, display_name, library, logo_url')
        .eq('id', game.console_id)
        .single();
      console_ = data;
    }

    res.json({
      status: 'success',
      game: {
        ...game,
        images: images ?? [],
        category_ids: (catLinks ?? []).map((l) => l.category_id),
        console: console_,
      },
    });
  } catch (err) {
    console.error('Get game v2 error:', err);
    res.status(500).json({ status: 'error', message: 'Erreur serveur' });
  }
});

gameV2Routes.post('/', async (req, res) => {
  try {
    const { category_ids, images } = req.body;
    const fields = pick(req.body);

    const { data: game, error } = await supabaseAdmin
      .from('games_v2')
      .insert(fields)
      .select()
      .single();

    if (error || !game) {
      res.status(400).json({ status: 'error', message: error?.message ?? 'Erreur insertion' });
      return;
    }

    if (Array.isArray(category_ids) && category_ids.length > 0) {
      const links = category_ids.map((cid: string) => ({
        category_id: cid,
        game_id: game.id,
      }));
      const { error: cErr } = await supabaseAdmin.from('game_category_games_v2').insert(links);
      if (cErr) {
        await supabaseAdmin.from('games_v2').delete().eq('id', game.id);
        res.status(400).json({ status: 'error', message: `Catégories: ${cErr.message}` });
        return;
      }
    }

    if (Array.isArray(images) && images.length > 0) {
      const imgRows = images.map((url: string, i: number) => ({
        game_id: game.id,
        image_url: url,
        position: i,
      }));
      const { error: iErr } = await supabaseAdmin.from('game_images_v2').insert(imgRows);
      if (iErr) {
        await supabaseAdmin.from('games_v2').delete().eq('id', game.id);
        res.status(400).json({ status: 'error', message: `Images: ${iErr.message}` });
        return;
      }
    }

    res.status(201).json({ status: 'success', game });
  } catch (err) {
    console.error('Create game v2 error:', err);
    res.status(500).json({ status: 'error', message: 'Erreur serveur' });
  }
});

gameV2Routes.put('/:id', async (req, res) => {
  try {
    const { category_ids, images } = req.body;
    const fields = pick(req.body);

    const { error } = await supabaseAdmin
      .from('games_v2')
      .update(fields)
      .eq('id', req.params.id);

    if (error) {
      res.status(400).json({ status: 'error', message: error.message });
      return;
    }

    if (Array.isArray(category_ids)) {
      await supabaseAdmin
        .from('game_category_games_v2')
        .delete()
        .eq('game_id', req.params.id);
      if (category_ids.length > 0) {
        const links = category_ids.map((cid: string) => ({
          category_id: cid,
          game_id: req.params.id,
        }));
        await supabaseAdmin.from('game_category_games_v2').insert(links);
      }
    }

    if (Array.isArray(images)) {
      await supabaseAdmin.from('game_images_v2').delete().eq('game_id', req.params.id);
      if (images.length > 0) {
        const imgRows = images.map((url: string, i: number) => ({
          game_id: req.params.id,
          image_url: url,
          position: i,
        }));
        await supabaseAdmin.from('game_images_v2').insert(imgRows);
      }
    }

    const { data: game } = await supabaseAdmin
      .from('games_v2')
      .select('*')
      .eq('id', req.params.id)
      .single();

    res.json({ status: 'success', game });
  } catch (err) {
    console.error('Update game v2 error:', err);
    res.status(500).json({ status: 'error', message: 'Erreur serveur' });
  }
});

gameV2Routes.delete('/:id', async (req, res) => {
  try {
    const { error } = await supabaseAdmin
      .from('games_v2')
      .delete()
      .eq('id', req.params.id);

    if (error) throw error;

    res.json({ status: 'success' });
  } catch (err) {
    console.error('Delete game v2 error:', err);
    res.status(500).json({ status: 'error', message: 'Erreur serveur' });
  }
});
