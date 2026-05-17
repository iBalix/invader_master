import { Router } from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';

export const menuProductV2Routes = Router();

menuProductV2Routes.use(authMiddleware, requireRole('admin', 'salarie'));

type ConditioningInput = {
  label: string;
  label_en?: string | null;
  price: number;
  price_hh?: number | null;
};

type VariantInput = {
  label: string;
  label_en?: string | null;
  color?: string | null;
};

async function fetchProductWithRelations(id: string) {
  const { data: product, error } = await supabaseAdmin
    .from('menu_products_v2')
    .select('*')
    .eq('id', id)
    .single();
  if (error || !product) return null;

  const { data: conditionings } = await supabaseAdmin
    .from('product_v2_conditionings')
    .select('*')
    .eq('product_id', id)
    .order('position', { ascending: true });

  const { data: variants } = await supabaseAdmin
    .from('product_v2_variants')
    .select('*')
    .eq('product_id', id)
    .order('position', { ascending: true });

  const { data: tagLinks } = await supabaseAdmin
    .from('product_v2_product_tags')
    .select('tag_id, position')
    .eq('product_id', id)
    .order('position', { ascending: true });

  let tags: unknown[] = [];
  if (tagLinks && tagLinks.length > 0) {
    const ids = tagLinks.map((l) => l.tag_id);
    const { data: tagsData } = await supabaseAdmin
      .from('product_v2_tags')
      .select('*')
      .in('id', ids);
    if (tagsData) {
      const posMap = new Map(tagLinks.map((l) => [l.tag_id, l.position]));
      tags = tagsData.sort((a, b) => (posMap.get(a.id) ?? 0) - (posMap.get(b.id) ?? 0));
    }
  }

  return {
    ...product,
    conditionings: conditionings ?? [],
    variants: variants ?? [],
    tags,
    tag_ids: (tagLinks ?? []).map((l) => l.tag_id),
  };
}

menuProductV2Routes.get('/', async (req, res) => {
  try {
    const { search } = req.query;

    let query = supabaseAdmin
      .from('menu_products_v2')
      .select('*')
      .order('display_order', { ascending: true });

    if (typeof search === 'string' && search.trim()) {
      query = query.ilike('name', `%${search.trim()}%`);
    }

    const { data, error } = await query;
    if (error) throw error;

    const productIds = (data ?? []).map((p) => p.id);

    const { data: links } = await supabaseAdmin
      .from('category_products_v2')
      .select('product_id, category_id');

    const { data: cats } = await supabaseAdmin
      .from('menu_categories_v2')
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

    let conditioningsByProduct: Record<string, unknown[]> = {};
    let variantsByProduct: Record<string, unknown[]> = {};
    let tagsByProduct: Record<string, Record<string, unknown>[]> = {};

    if (productIds.length > 0) {
      const { data: cond } = await supabaseAdmin
        .from('product_v2_conditionings')
        .select('*')
        .in('product_id', productIds)
        .order('position', { ascending: true });
      for (const c of cond ?? []) {
        if (!conditioningsByProduct[c.product_id]) conditioningsByProduct[c.product_id] = [];
        conditioningsByProduct[c.product_id].push(c);
      }

      const { data: vars } = await supabaseAdmin
        .from('product_v2_variants')
        .select('*')
        .in('product_id', productIds)
        .order('position', { ascending: true });
      for (const v of vars ?? []) {
        if (!variantsByProduct[v.product_id]) variantsByProduct[v.product_id] = [];
        variantsByProduct[v.product_id].push(v);
      }

      const { data: tagLinks } = await supabaseAdmin
        .from('product_v2_product_tags')
        .select('product_id, tag_id, position')
        .in('product_id', productIds)
        .order('position', { ascending: true });

      if (tagLinks && tagLinks.length > 0) {
        const tagIds = Array.from(new Set(tagLinks.map((l) => l.tag_id)));
        const { data: tagsData } = await supabaseAdmin
          .from('product_v2_tags')
          .select('*')
          .in('id', tagIds);
        const tagMap = new Map((tagsData ?? []).map((t) => [t.id, t]));
        for (const l of tagLinks) {
          if (!tagsByProduct[l.product_id]) tagsByProduct[l.product_id] = [];
          const tag = tagMap.get(l.tag_id);
          if (tag) tagsByProduct[l.product_id].push(tag);
        }
      }
    }

    const items = (data ?? []).map((p) => ({
      ...p,
      categories: prodCats[p.id] ?? [],
      conditionings: conditioningsByProduct[p.id] ?? [],
      variants: variantsByProduct[p.id] ?? [],
      tags: tagsByProduct[p.id] ?? [],
    }));

    res.json({ status: 'success', items });
  } catch (err) {
    console.error('List menu products v2 error:', err);
    res.status(500).json({ status: 'error', message: 'Erreur serveur' });
  }
});

menuProductV2Routes.get('/:id', async (req, res) => {
  try {
    const product = await fetchProductWithRelations(req.params.id);
    if (!product) {
      res.status(404).json({ status: 'error', message: 'Produit introuvable' });
      return;
    }
    res.json({ status: 'success', product });
  } catch (err) {
    console.error('Get menu product v2 error:', err);
    res.status(500).json({ status: 'error', message: 'Erreur serveur' });
  }
});

menuProductV2Routes.post('/', async (req, res) => {
  try {
    const { conditionings, variants, tag_ids, ...fields } = req.body as {
      conditionings?: ConditioningInput[];
      variants?: VariantInput[];
      tag_ids?: string[];
      [k: string]: unknown;
    };

    const { data: product, error } = await supabaseAdmin
      .from('menu_products_v2')
      .insert(fields)
      .select()
      .single();

    if (error || !product) {
      res.status(400).json({ status: 'error', message: error?.message ?? 'Erreur insertion' });
      return;
    }

    if (Array.isArray(conditionings) && conditionings.length > 0) {
      const rows = conditionings.map((c, i) => ({
        product_id: product.id,
        label: c.label,
        label_en: c.label_en ?? null,
        price: c.price,
        price_hh: c.price_hh ?? null,
        position: i,
      }));
      const { error: cErr } = await supabaseAdmin.from('product_v2_conditionings').insert(rows);
      if (cErr) {
        await supabaseAdmin.from('menu_products_v2').delete().eq('id', product.id);
        res.status(400).json({ status: 'error', message: `Conditionnements: ${cErr.message}` });
        return;
      }
    }

    if (Array.isArray(variants) && variants.length > 0) {
      const rows = variants.map((v, i) => ({
        product_id: product.id,
        label: v.label,
        label_en: v.label_en ?? null,
        color: v.color ?? null,
        position: i,
      }));
      const { error: vErr } = await supabaseAdmin.from('product_v2_variants').insert(rows);
      if (vErr) {
        await supabaseAdmin.from('menu_products_v2').delete().eq('id', product.id);
        res.status(400).json({ status: 'error', message: `Variantes: ${vErr.message}` });
        return;
      }
    }

    if (Array.isArray(tag_ids) && tag_ids.length > 0) {
      const rows = tag_ids.map((tagId, i) => ({
        product_id: product.id,
        tag_id: tagId,
        position: i,
      }));
      const { error: tErr } = await supabaseAdmin.from('product_v2_product_tags').insert(rows);
      if (tErr) {
        await supabaseAdmin.from('menu_products_v2').delete().eq('id', product.id);
        res.status(400).json({ status: 'error', message: `Tags: ${tErr.message}` });
        return;
      }
    }

    const full = await fetchProductWithRelations(product.id);
    res.status(201).json({ status: 'success', product: full });
  } catch (err) {
    console.error('Create menu product v2 error:', err);
    res.status(500).json({ status: 'error', message: 'Erreur serveur' });
  }
});

menuProductV2Routes.put('/:id', async (req, res) => {
  try {
    const { conditionings, variants, tag_ids, ...fields } = req.body as {
      conditionings?: ConditioningInput[];
      variants?: VariantInput[];
      tag_ids?: string[];
      [k: string]: unknown;
    };

    const { error } = await supabaseAdmin
      .from('menu_products_v2')
      .update(fields)
      .eq('id', req.params.id);

    if (error) {
      res.status(400).json({ status: 'error', message: error.message });
      return;
    }

    if (Array.isArray(conditionings)) {
      await supabaseAdmin.from('product_v2_conditionings').delete().eq('product_id', req.params.id);
      if (conditionings.length > 0) {
        const rows = conditionings.map((c, i) => ({
          product_id: req.params.id,
          label: c.label,
          label_en: c.label_en ?? null,
          price: c.price,
          price_hh: c.price_hh ?? null,
          position: i,
        }));
        await supabaseAdmin.from('product_v2_conditionings').insert(rows);
      }
    }

    if (Array.isArray(variants)) {
      await supabaseAdmin.from('product_v2_variants').delete().eq('product_id', req.params.id);
      if (variants.length > 0) {
        const rows = variants.map((v, i) => ({
          product_id: req.params.id,
          label: v.label,
          label_en: v.label_en ?? null,
          color: v.color ?? null,
          position: i,
        }));
        await supabaseAdmin.from('product_v2_variants').insert(rows);
      }
    }

    if (Array.isArray(tag_ids)) {
      await supabaseAdmin.from('product_v2_product_tags').delete().eq('product_id', req.params.id);
      if (tag_ids.length > 0) {
        const rows = tag_ids.map((tagId, i) => ({
          product_id: req.params.id,
          tag_id: tagId,
          position: i,
        }));
        await supabaseAdmin.from('product_v2_product_tags').insert(rows);
      }
    }

    const full = await fetchProductWithRelations(req.params.id);
    res.json({ status: 'success', product: full });
  } catch (err) {
    console.error('Update menu product v2 error:', err);
    res.status(500).json({ status: 'error', message: 'Erreur serveur' });
  }
});

menuProductV2Routes.delete('/:id', async (req, res) => {
  try {
    await supabaseAdmin
      .from('category_products_v2')
      .delete()
      .eq('product_id', req.params.id);

    const { error } = await supabaseAdmin
      .from('menu_products_v2')
      .delete()
      .eq('id', req.params.id);

    if (error) throw error;

    res.json({ status: 'success' });
  } catch (err) {
    console.error('Delete menu product v2 error:', err);
    res.status(500).json({ status: 'error', message: 'Erreur serveur' });
  }
});
