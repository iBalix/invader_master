/**
 * Public API (no auth) — replaces Contentful Delivery API
 */

import { Router } from 'express';
import { supabaseAdmin } from '../config/supabase.js';

export const publicRoutes = Router();

function toCamel(row: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(row)) {
    const camel = key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
    result[camel] = val;
  }
  return result;
}

// List all quizzes (basic info)
publicRoutes.get('/quizzes', async (_req, res) => {
  try {
    const { data: quizzes, error } = await supabaseAdmin
      .from('quizzes')
      .select('id, name, theme, created_at, updated_at')
      .eq('published', true)
      .order('name');

    if (error) throw error;

    const { data: counts } = await supabaseAdmin
      .from('quiz_questions')
      .select('quiz_id');

    const countMap: Record<string, number> = {};
    if (counts) {
      for (const row of counts) {
        countMap[row.quiz_id] = (countMap[row.quiz_id] ?? 0) + 1;
      }
    }

    const items = (quizzes ?? []).map((q) => ({
      ...toCamel(q),
      questionCount: countMap[q.id] ?? 0,
    }));

    res.json({ items });
  } catch (err) {
    console.error('Public list quizzes error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Get full quiz with questions
publicRoutes.get('/quizzes/:id', async (req, res) => {
  try {
    const { data: quiz, error } = await supabaseAdmin
      .from('quizzes')
      .select('*')
      .eq('id', req.params.id)
      .eq('published', true)
      .single();

    if (error || !quiz) {
      res.status(404).json({ error: 'Quiz introuvable' });
      return;
    }

    const { data: links } = await supabaseAdmin
      .from('quiz_questions')
      .select('question_id, position')
      .eq('quiz_id', quiz.id)
      .order('position', { ascending: true });

    let questions: Record<string, unknown>[] = [];
    if (links && links.length > 0) {
      const ids = links.map((l) => l.question_id);
      const { data: qData } = await supabaseAdmin
        .from('questions')
        .select('*')
        .in('id', ids);

      if (qData) {
        const posMap = new Map(links.map((l) => [l.question_id, l.position]));
        questions = qData
          .sort((a, b) => (posMap.get(a.id) ?? 0) - (posMap.get(b.id) ?? 0))
          .map((q) => toCamel(q) as Record<string, unknown>);
      }
    }

    res.json({ ...toCamel(quiz), questions });
  } catch (err) {
    console.error('Public get quiz error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Full carte: categories with products and sub-categories
publicRoutes.get('/carte', async (_req, res) => {
  try {
    const { data: categories, error: catErr } = await supabaseAdmin
      .from('menu_categories')
      .select('*')
      .order('weight', { ascending: true });

    if (catErr) throw catErr;

    const { data: products } = await supabaseAdmin
      .from('menu_products')
      .select('*');

    const { data: links } = await supabaseAdmin
      .from('category_products')
      .select('category_id, product_id, position')
      .order('position', { ascending: true });

    const productMap = new Map((products ?? []).map((p) => [p.id, p]));

    const linksByCategory: Record<string, Array<{ product_id: string; position: number }>> = {};
    for (const l of links ?? []) {
      if (!linksByCategory[l.category_id]) linksByCategory[l.category_id] = [];
      linksByCategory[l.category_id].push(l);
    }

    function buildProducts(catId: string) {
      const catLinks = linksByCategory[catId] ?? [];
      return catLinks
        .sort((a, b) => a.position - b.position)
        .map((l) => productMap.get(l.product_id))
        .filter(Boolean)
        .map((p) => toCamel(p as Record<string, unknown>));
    }

    const allCats = categories ?? [];
    const childIds = new Set(allCats.filter((c) => c.parent_id).map((c) => c.id));

    const result = allCats.map((cat) => ({
      ...toCamel(cat),
      products: buildProducts(cat.id),
      subCategories: allCats
        .filter((sc) => sc.parent_id === cat.id)
        .map((sc) => ({
          ...toCamel(sc),
          products: buildProducts(sc.id),
        })),
    }));

    res.json({ categories: result.filter((c) => !childIds.has((c as Record<string, unknown>).id as string)) });
  } catch (err) {
    console.error('Public carte error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Get single question
publicRoutes.get('/questions/:id', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('questions')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (error || !data) {
      res.status(404).json({ error: 'Question introuvable' });
      return;
    }

    res.json(toCamel(data));
  } catch (err) {
    console.error('Public get question error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});
