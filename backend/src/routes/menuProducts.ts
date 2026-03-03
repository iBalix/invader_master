import { Router } from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';

export const menuProductRoutes = Router();

menuProductRoutes.use(authMiddleware, requireRole('admin', 'salarie'));

menuProductRoutes.get('/', async (req, res) => {
  try {
    const { search } = req.query;

    let query = supabaseAdmin
      .from('menu_products')
      .select('*')
      .order('display_order', { ascending: true });

    if (typeof search === 'string' && search.trim()) {
      query = query.ilike('name', `%${search.trim()}%`);
    }

    const { data, error } = await query;
    if (error) throw error;

    const { data: links } = await supabaseAdmin
      .from('category_products')
      .select('product_id, category_id');

    const { data: cats } = await supabaseAdmin
      .from('menu_categories')
      .select('id, name');

    const catMap = new Map((cats ?? []).map((c) => [c.id, c.name]));

    const prodCats: Record<string, string[]> = {};
    if (links) {
      for (const l of links) {
        if (!prodCats[l.product_id]) prodCats[l.product_id] = [];
        const name = catMap.get(l.category_id);
        if (name) prodCats[l.product_id].push(name);
      }
    }

    const items = (data ?? []).map((p) => ({
      ...p,
      categories: prodCats[p.id] ?? [],
    }));

    res.json({ status: 'success', items });
  } catch (err) {
    console.error('List menu products error:', err);
    res.status(500).json({ status: 'error', message: 'Erreur serveur' });
  }
});

menuProductRoutes.get('/:id', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('menu_products')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (error || !data) {
      res.status(404).json({ status: 'error', message: 'Produit introuvable' });
      return;
    }

    res.json({ status: 'success', product: data });
  } catch (err) {
    console.error('Get menu product error:', err);
    res.status(500).json({ status: 'error', message: 'Erreur serveur' });
  }
});

menuProductRoutes.post('/', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('menu_products')
      .insert(req.body)
      .select()
      .single();

    if (error) {
      res.status(400).json({ status: 'error', message: error.message });
      return;
    }

    res.status(201).json({ status: 'success', product: data });
  } catch (err) {
    console.error('Create menu product error:', err);
    res.status(500).json({ status: 'error', message: 'Erreur serveur' });
  }
});

menuProductRoutes.put('/:id', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('menu_products')
      .update(req.body)
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) {
      res.status(400).json({ status: 'error', message: error.message });
      return;
    }

    res.json({ status: 'success', product: data });
  } catch (err) {
    console.error('Update menu product error:', err);
    res.status(500).json({ status: 'error', message: 'Erreur serveur' });
  }
});

menuProductRoutes.delete('/:id', async (req, res) => {
  try {
    await supabaseAdmin
      .from('category_products')
      .delete()
      .eq('product_id', req.params.id);

    const { error } = await supabaseAdmin
      .from('menu_products')
      .delete()
      .eq('id', req.params.id);

    if (error) throw error;

    res.json({ status: 'success' });
  } catch (err) {
    console.error('Delete menu product error:', err);
    res.status(500).json({ status: 'error', message: 'Erreur serveur' });
  }
});
