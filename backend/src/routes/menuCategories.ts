import { Router } from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';

export const menuCategoryRoutes = Router();

menuCategoryRoutes.use(authMiddleware, requireRole('admin', 'salarie'));

menuCategoryRoutes.get('/', async (_req, res) => {
  try {
    const { data: categories, error } = await supabaseAdmin
      .from('menu_categories')
      .select('*')
      .order('weight', { ascending: true });

    if (error) throw error;

    const { data: counts } = await supabaseAdmin
      .from('category_products')
      .select('category_id');

    const countMap: Record<string, number> = {};
    if (counts) {
      for (const row of counts) {
        countMap[row.category_id] = (countMap[row.category_id] ?? 0) + 1;
      }
    }

    const parentMap = new Map(
      (categories ?? []).map((c) => [c.id, c.name]),
    );

    const items = (categories ?? []).map((c) => ({
      ...c,
      productCount: countMap[c.id] ?? 0,
      parent_name: c.parent_id ? parentMap.get(c.parent_id) ?? null : null,
    }));

    res.json({ status: 'success', items });
  } catch (err) {
    console.error('List menu categories error:', err);
    res.status(500).json({ status: 'error', message: 'Erreur serveur' });
  }
});

menuCategoryRoutes.get('/:id', async (req, res) => {
  try {
    const { data: category, error } = await supabaseAdmin
      .from('menu_categories')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (error || !category) {
      res.status(404).json({ status: 'error', message: 'Catégorie introuvable' });
      return;
    }

    const { data: links } = await supabaseAdmin
      .from('category_products')
      .select('product_id, position')
      .eq('category_id', category.id)
      .order('position', { ascending: true });

    let products: unknown[] = [];
    if (links && links.length > 0) {
      const ids = links.map((l) => l.product_id);
      const { data: pData } = await supabaseAdmin
        .from('menu_products')
        .select('*')
        .in('id', ids);

      if (pData) {
        const posMap = new Map(links.map((l) => [l.product_id, l.position]));
        products = pData.sort(
          (a, b) => (posMap.get(a.id) ?? 0) - (posMap.get(b.id) ?? 0),
        );
      }
    }

    const { data: subCategories } = await supabaseAdmin
      .from('menu_categories')
      .select('id, name, weight')
      .eq('parent_id', category.id)
      .order('weight', { ascending: true });

    res.json({
      status: 'success',
      category: { ...category, products, subCategories: subCategories ?? [] },
    });
  } catch (err) {
    console.error('Get menu category error:', err);
    res.status(500).json({ status: 'error', message: 'Erreur serveur' });
  }
});

menuCategoryRoutes.post('/', async (req, res) => {
  try {
    const { product_ids, ...fields } = req.body;

    const { data: category, error } = await supabaseAdmin
      .from('menu_categories')
      .insert(fields)
      .select()
      .single();

    if (error) {
      res.status(400).json({ status: 'error', message: error.message });
      return;
    }

    if (Array.isArray(product_ids) && product_ids.length > 0) {
      const links = product_ids.map((pid: string, i: number) => ({
        category_id: category.id,
        product_id: pid,
        position: i,
      }));
      await supabaseAdmin.from('category_products').insert(links);
    }

    res.status(201).json({ status: 'success', category });
  } catch (err) {
    console.error('Create menu category error:', err);
    res.status(500).json({ status: 'error', message: 'Erreur serveur' });
  }
});

menuCategoryRoutes.put('/:id', async (req, res) => {
  try {
    const { product_ids, ...fields } = req.body;

    const { error } = await supabaseAdmin
      .from('menu_categories')
      .update(fields)
      .eq('id', req.params.id);

    if (error) {
      res.status(400).json({ status: 'error', message: error.message });
      return;
    }

    if (Array.isArray(product_ids)) {
      await supabaseAdmin
        .from('category_products')
        .delete()
        .eq('category_id', req.params.id);

      if (product_ids.length > 0) {
        const links = product_ids.map((pid: string, i: number) => ({
          category_id: req.params.id,
          product_id: pid,
          position: i,
        }));
        await supabaseAdmin.from('category_products').insert(links);
      }
    }

    const { data: category } = await supabaseAdmin
      .from('menu_categories')
      .select('*')
      .eq('id', req.params.id)
      .single();

    res.json({ status: 'success', category });
  } catch (err) {
    console.error('Update menu category error:', err);
    res.status(500).json({ status: 'error', message: 'Erreur serveur' });
  }
});

menuCategoryRoutes.delete('/:id', async (req, res) => {
  try {
    await supabaseAdmin
      .from('menu_categories')
      .update({ parent_id: null })
      .eq('parent_id', req.params.id);

    const { error } = await supabaseAdmin
      .from('menu_categories')
      .delete()
      .eq('id', req.params.id);

    if (error) throw error;

    res.json({ status: 'success' });
  } catch (err) {
    console.error('Delete menu category error:', err);
    res.status(500).json({ status: 'error', message: 'Erreur serveur' });
  }
});
