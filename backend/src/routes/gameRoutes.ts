import { Router } from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';

export const gameRoutes = Router();

gameRoutes.use(authMiddleware, requireRole('admin', 'salarie'));

gameRoutes.get('/', async (req, res) => {
  try {
    const { search } = req.query;

    let query = supabaseAdmin
      .from('games')
      .select('*')
      .order('display_order', { ascending: true });

    if (typeof search === 'string' && search.trim()) {
      query = query.ilike('name', `%${search.trim()}%`);
    }

    const { data, error } = await query;
    if (error) throw error;

    const { data: consoles } = await supabaseAdmin.from('game_consoles').select('id, name');
    const consoleMap = new Map((consoles ?? []).map((c) => [c.id, c.name]));

    const { data: catLinks } = await supabaseAdmin.from('game_category_games').select('game_id, category_id');
    const { data: cats } = await supabaseAdmin.from('game_categories').select('id, name');
    const catMap = new Map((cats ?? []).map((c) => [c.id, c.name]));

    const gameCats: Record<string, string[]> = {};
    if (catLinks) {
      for (const l of catLinks) {
        if (!gameCats[l.game_id]) gameCats[l.game_id] = [];
        const name = catMap.get(l.category_id);
        if (name) gameCats[l.game_id].push(name);
      }
    }

    const items = (data ?? []).map((g) => ({
      ...g,
      console_name: consoleMap.get(g.console_id) ?? null,
      categories: gameCats[g.id] ?? [],
    }));

    res.json({ status: 'success', items });
  } catch (err) {
    console.error('List games error:', err);
    res.status(500).json({ status: 'error', message: 'Erreur serveur' });
  }
});

gameRoutes.get('/:id', async (req, res) => {
  try {
    const { data: game, error } = await supabaseAdmin
      .from('games')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (error || !game) {
      res.status(404).json({ status: 'error', message: 'Jeu introuvable' });
      return;
    }

    const { data: images } = await supabaseAdmin
      .from('game_images')
      .select('id, image_url, position')
      .eq('game_id', game.id)
      .order('position', { ascending: true });

    const { data: catLinks } = await supabaseAdmin
      .from('game_category_games')
      .select('category_id')
      .eq('game_id', game.id);

    const { data: console_ } = await supabaseAdmin
      .from('game_consoles')
      .select('id, name, library, logo_url')
      .eq('id', game.console_id)
      .single();

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
    console.error('Get game error:', err);
    res.status(500).json({ status: 'error', message: 'Erreur serveur' });
  }
});

gameRoutes.post('/', async (req, res) => {
  try {
    const { category_ids, images, ...fields } = req.body;

    const { data: game, error } = await supabaseAdmin
      .from('games')
      .insert(fields)
      .select()
      .single();

    if (error) {
      res.status(400).json({ status: 'error', message: error.message });
      return;
    }

    if (Array.isArray(category_ids) && category_ids.length > 0) {
      const links = category_ids.map((cid: string) => ({
        category_id: cid,
        game_id: game.id,
      }));
      await supabaseAdmin.from('game_category_games').insert(links);
    }

    if (Array.isArray(images) && images.length > 0) {
      const imgRows = images.map((url: string, i: number) => ({
        game_id: game.id,
        image_url: url,
        position: i,
      }));
      await supabaseAdmin.from('game_images').insert(imgRows);
    }

    res.status(201).json({ status: 'success', game });
  } catch (err) {
    console.error('Create game error:', err);
    res.status(500).json({ status: 'error', message: 'Erreur serveur' });
  }
});

gameRoutes.put('/:id', async (req, res) => {
  try {
    const { category_ids, images, ...fields } = req.body;

    const { error } = await supabaseAdmin
      .from('games')
      .update(fields)
      .eq('id', req.params.id);

    if (error) {
      res.status(400).json({ status: 'error', message: error.message });
      return;
    }

    if (Array.isArray(category_ids)) {
      await supabaseAdmin.from('game_category_games').delete().eq('game_id', req.params.id);
      if (category_ids.length > 0) {
        const links = category_ids.map((cid: string) => ({
          category_id: cid,
          game_id: req.params.id,
        }));
        await supabaseAdmin.from('game_category_games').insert(links);
      }
    }

    if (Array.isArray(images)) {
      await supabaseAdmin.from('game_images').delete().eq('game_id', req.params.id);
      if (images.length > 0) {
        const imgRows = images.map((url: string, i: number) => ({
          game_id: req.params.id,
          image_url: url,
          position: i,
        }));
        await supabaseAdmin.from('game_images').insert(imgRows);
      }
    }

    const { data: game } = await supabaseAdmin
      .from('games')
      .select('*')
      .eq('id', req.params.id)
      .single();

    res.json({ status: 'success', game });
  } catch (err) {
    console.error('Update game error:', err);
    res.status(500).json({ status: 'error', message: 'Erreur serveur' });
  }
});

gameRoutes.delete('/:id', async (req, res) => {
  try {
    const { error } = await supabaseAdmin
      .from('games')
      .delete()
      .eq('id', req.params.id);

    if (error) throw error;

    res.json({ status: 'success' });
  } catch (err) {
    console.error('Delete game error:', err);
    res.status(500).json({ status: 'error', message: 'Erreur serveur' });
  }
});
