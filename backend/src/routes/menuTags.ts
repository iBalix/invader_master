import { Router } from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';

export const menuTagRoutes = Router();

menuTagRoutes.use(authMiddleware, requireRole('admin', 'salarie'));

menuTagRoutes.get('/', async (_req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('product_tags')
      .select('*')
      .order('position', { ascending: true });

    if (error) throw error;

    const { data: links } = await supabaseAdmin
      .from('product_product_tags')
      .select('tag_id');

    const useCount: Record<string, number> = {};
    for (const l of links ?? []) {
      useCount[l.tag_id] = (useCount[l.tag_id] ?? 0) + 1;
    }

    const items = (data ?? []).map((t) => ({
      ...t,
      productCount: useCount[t.id] ?? 0,
    }));

    res.json({ status: 'success', items });
  } catch (err) {
    console.error('List menu tags error:', err);
    res.status(500).json({ status: 'error', message: 'Erreur serveur' });
  }
});

menuTagRoutes.post('/', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('product_tags')
      .insert(req.body)
      .select()
      .single();
    if (error) {
      res.status(400).json({ status: 'error', message: error.message });
      return;
    }
    res.status(201).json({ status: 'success', tag: data });
  } catch (err) {
    console.error('Create menu tag error:', err);
    res.status(500).json({ status: 'error', message: 'Erreur serveur' });
  }
});

menuTagRoutes.put('/:id', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('product_tags')
      .update(req.body)
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) {
      res.status(400).json({ status: 'error', message: error.message });
      return;
    }
    res.json({ status: 'success', tag: data });
  } catch (err) {
    console.error('Update menu tag error:', err);
    res.status(500).json({ status: 'error', message: 'Erreur serveur' });
  }
});

menuTagRoutes.delete('/:id', async (req, res) => {
  try {
    const { error } = await supabaseAdmin
      .from('product_tags')
      .delete()
      .eq('id', req.params.id);
    if (error) throw error;
    res.json({ status: 'success' });
  } catch (err) {
    console.error('Delete menu tag error:', err);
    res.status(500).json({ status: 'error', message: 'Erreur serveur' });
  }
});
