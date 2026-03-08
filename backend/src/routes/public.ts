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

function localize(
  row: Record<string, unknown>,
  fields: string[],
  locale: string,
): Record<string, unknown> {
  if (locale === 'fr') return row;
  const result = { ...row };
  for (const f of fields) {
    const enKey = `${f}_en`;
    const enVal = result[enKey] as string | undefined;
    if (enVal) result[f] = enVal;
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
publicRoutes.get('/carte', async (req, res) => {
  try {
    const locale = (req.query.locale as string) === 'en' ? 'en' : 'fr';

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
        .map((p) => toCamel(localize(p as Record<string, unknown>, ['name', 'subtitle', 'description'], locale)));
    }

    const allCats = categories ?? [];
    const childIds = new Set(allCats.filter((c) => c.parent_id).map((c) => c.id));

    const result = allCats.map((cat) => ({
      ...toCamel(localize(cat, ['name'], locale)),
      products: buildProducts(cat.id),
      subCategories: allCats
        .filter((sc) => sc.parent_id === cat.id)
        .map((sc) => ({
          ...toCamel(localize(sc, ['name'], locale)),
          products: buildProducts(sc.id),
        })),
    }));

    res.json({ categories: result.filter((c) => !childIds.has((c as Record<string, unknown>).id as string)) });
  } catch (err) {
    console.error('Public carte error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Full games: categories, consoles, games with relations
publicRoutes.get('/games', async (req, res) => {
  try {
    const locale = (req.query.locale as string) === 'en' ? 'en' : 'fr';

    const { data: categories } = await supabaseAdmin
      .from('game_categories')
      .select('*')
      .order('display_order', { ascending: true });

    const { data: consoles } = await supabaseAdmin
      .from('game_consoles')
      .select('*')
      .order('name', { ascending: true });

    const { data: games } = await supabaseAdmin
      .from('games')
      .select('*')
      .order('display_order', { ascending: true });

    const { data: images } = await supabaseAdmin
      .from('game_images')
      .select('game_id, image_url, position')
      .order('position', { ascending: true });

    const { data: catLinks } = await supabaseAdmin
      .from('game_category_games')
      .select('game_id, category_id');

    const consoleMap = new Map((consoles ?? []).map((c) => [c.id, c]));

    const localizedCats = (categories ?? []).map((c) => localize(c, ['name'], locale));
    const catMap = new Map(localizedCats.map((c) => [c.id as string, c.name as string]));

    const imagesByGame: Record<string, string[]> = {};
    for (const img of images ?? []) {
      if (!imagesByGame[img.game_id]) imagesByGame[img.game_id] = [];
      imagesByGame[img.game_id].push(img.image_url);
    }

    const catsByGame: Record<string, string[]> = {};
    for (const l of catLinks ?? []) {
      if (!catsByGame[l.game_id]) catsByGame[l.game_id] = [];
      const name = catMap.get(l.category_id);
      if (name) catsByGame[l.game_id].push(name);
    }

    const gameItems = (games ?? []).map((g) => {
      const c = consoleMap.get(g.console_id);
      return {
        ...toCamel(localize(g, ['name', 'subtitle', 'description'], locale)),
        consoleName: c?.name ?? null,
        consoleLibrary: c?.library ?? null,
        consoleLogoUrl: c?.logo_url ?? null,
        categories: catsByGame[g.id] ?? [],
        images: imagesByGame[g.id] ?? [],
      };
    });

    res.json({
      categories: localizedCats.map((c) => toCamel(c as Record<string, unknown>)),
      consoles: (consoles ?? []).map((c) => toCamel(c)),
      games: gameItems,
    });
  } catch (err) {
    console.error('Public games error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Projector config + events
publicRoutes.get('/projector', async (_req, res) => {
  try {
    const { data: config } = await supabaseAdmin
      .from('projector_config')
      .select('*')
      .limit(1)
      .single();

    const { data: events } = await supabaseAdmin
      .from('projector_events')
      .select('*')
      .order('date', { ascending: true });

    res.json({
      config: config ? toCamel(config) : null,
      events: (events ?? []).map((e) => toCamel(e)),
    });
  } catch (err) {
    console.error('Public projector error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// TV configs (only active ones)
publicRoutes.get('/tv-configs', async (_req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('tv_configs')
      .select('*')
      .eq('active', true)
      .order('name', { ascending: true });

    if (error) throw error;

    res.json({ items: (data ?? []).map((c) => toCamel(c)) });
  } catch (err) {
    console.error('Public tv configs error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Translations as flat key-value object
publicRoutes.get('/translations', async (req, res) => {
  try {
    const locale = (req.query.locale as string) === 'en' ? 'en' : 'fr';

    const { data, error } = await supabaseAdmin
      .from('translations')
      .select('key, value_fr, value_en');

    if (error) throw error;

    const result: Record<string, string> = {};
    for (const row of data ?? []) {
      result[row.key] = locale === 'en' ? row.value_en : row.value_fr;
    }

    res.json(result);
  } catch (err) {
    console.error('Public translations error:', err);
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
