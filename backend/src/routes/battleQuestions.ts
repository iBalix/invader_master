/**
 * Battle Questions — CRUD + génération IA + import + gestion d'usage.
 *
 * Source de vérité : Postgres (table battle_questions, migration 041).
 * Le stockage est PROPRE (answers sans marqueur + correct_answer_index) mais
 * l'API re-sérialise le marqueur legacy " (OK)" dans answers : c'est le
 * contrat attendu par BattleQuestionsPage et par les consommateurs legacy
 * de /public/battle-questions. Ne pas le casser.
 */

import { Router, type Request, type Response } from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import {
  BATTLE_DIFFICULTIES,
  DEFAULT_CATEGORIES,
  generateBattleQuestions,
  isBattleDifficulty,
  type BattleQuestionRow,
} from '../services/battleQuestionGen.js';

export const battleQuestionRoutes = Router();
battleQuestionRoutes.use(authMiddleware, requireRole('admin', 'salarie'));

/** re-sérialise le marqueur legacy " (OK)" sur la bonne réponse */
export function markAnswers(row: Pick<BattleQuestionRow, 'answers' | 'correct_answer_index'>): string[] {
  return row.answers.map((a, i) => (i === row.correct_answer_index ? `${a} (OK)` : a));
}

function serialize(row: BattleQuestionRow) {
  return {
    id: row.id,
    question: row.question,
    difficulty: row.difficulty,
    theme: row.theme,
    answers: markAnswers(row),
    help_story: row.help_story,
    created_at: row.created_at,
    used_at: row.used_at,
  };
}

/** valide le body d'un POST/PUT ; retourne les champs propres ou null */
function parseQuestionBody(body: Record<string, unknown>): {
  question: string;
  difficulty: string;
  theme: string;
  answers: string[];
  correctIndex: number;
  helpStory: string;
} | null {
  const { question, difficulty, theme, answers, correctAnswer, help_story } = body as {
    question?: string;
    difficulty?: string;
    theme?: string;
    answers?: unknown;
    correctAnswer?: unknown;
    help_story?: string;
  };
  if (!question || !theme || !difficulty || !isBattleDifficulty(difficulty)) return null;
  if (!Array.isArray(answers) || answers.length !== 4) return null;
  if (!answers.every((a): a is string => typeof a === 'string' && a.trim().length > 0)) return null;
  const correctIndex = Number(correctAnswer);
  if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex > 3) return null;
  // retire un éventuel marqueur déjà présent dans le texte fourni
  const cleaned = answers.map((a) => a.replace(' (OK)', '').replace('(OK)', '').trim());
  if (cleaned.some((a) => a.length === 0)) return null;
  return {
    question: question.trim(),
    difficulty,
    theme: theme.trim(),
    answers: cleaned,
    correctIndex,
    helpStory: help_story ?? '',
  };
}

function serverError(res: Response, tag: string, err: unknown): void {
  console.error(`[battle-questions] ${tag} error:`, err);
  const status = (err as { httpStatus?: number }).httpStatus ?? 500;
  const message = status < 500 && err instanceof Error ? err.message : 'Erreur serveur';
  res.status(status).json({ status: 'error', message });
}

// ─── GET / — list questions by difficulty ───────────────────────────────────

battleQuestionRoutes.get('/', async (req: Request, res: Response) => {
  try {
    const difficulty = (req.query.difficulty as string) ?? 'Facile';
    if (!isBattleDifficulty(difficulty)) {
      res.status(400).json({ status: 'error', message: 'Difficulté invalide' });
      return;
    }
    const { data, error } = await supabaseAdmin
      .from('battle_questions')
      .select('*')
      .eq('difficulty', difficulty)
      .order('created_at', { ascending: true });
    if (error) throw error;
    res.json({ status: 'success', questions: (data as BattleQuestionRow[]).map(serialize) });
  } catch (err) {
    serverError(res, 'GET /', err);
  }
});

// ─── GET /stats — counts per difficulty (+ disponibles/consommées) ──────────

battleQuestionRoutes.get('/stats', async (_req: Request, res: Response) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('battle_questions')
      .select('difficulty, used_at');
    if (error) throw error;

    const stats: Record<string, number> = { Facile: 0, Moyen: 0, Difficile: 0 };
    const available: Record<string, number> = { Facile: 0, Moyen: 0, Difficile: 0 };
    const used: Record<string, number> = { Facile: 0, Moyen: 0, Difficile: 0 };
    let total = 0;
    for (const row of (data ?? []) as Array<{ difficulty: string; used_at: string | null }>) {
      if (stats[row.difficulty] === undefined) continue;
      stats[row.difficulty] += 1;
      total += 1;
      if (row.used_at) used[row.difficulty] += 1;
      else available[row.difficulty] += 1;
    }
    // shape historique {Facile, Moyen, Difficile, total} + champs additifs
    res.json({ status: 'success', stats: { ...stats, total, available, used } });
  } catch (err) {
    serverError(res, 'GET /stats', err);
  }
});

// ─── GET /categories — distinct themes ──────────────────────────────────────

battleQuestionRoutes.get('/categories', async (_req: Request, res: Response) => {
  try {
    const { data, error } = await supabaseAdmin.from('battle_questions').select('theme');
    if (error) throw error;
    const dbCategories = (data ?? []).map((r) => r.theme as string).filter(Boolean);
    const merged = [...new Set([...DEFAULT_CATEGORIES, ...dbCategories])].sort();
    res.json({ status: 'success', categories: merged });
  } catch (err) {
    serverError(res, 'GET /categories', err);
  }
});

// ─── POST / — add a question manually ──────────────────────────────────────

battleQuestionRoutes.post('/', async (req: Request, res: Response) => {
  try {
    const parsed = parseQuestionBody(req.body);
    if (!parsed) {
      res.status(400).json({ status: 'error', message: 'Données invalides' });
      return;
    }
    const { data, error } = await supabaseAdmin
      .from('battle_questions')
      .insert({
        question: parsed.question,
        difficulty: parsed.difficulty,
        theme: parsed.theme,
        answers: parsed.answers,
        correct_answer_index: parsed.correctIndex,
        help_story: parsed.helpStory,
      })
      .select('id')
      .single();
    if (error) throw error;
    res.status(201).json({ status: 'success', message: 'Question ajoutée avec succès', id: data.id });
  } catch (err) {
    serverError(res, 'POST /', err);
  }
});

// ─── PUT /:id — edit a question ─────────────────────────────────────────────

battleQuestionRoutes.put('/:id', async (req: Request, res: Response) => {
  try {
    const parsed = parseQuestionBody(req.body);
    if (!parsed) {
      res.status(400).json({ status: 'error', message: 'Données invalides' });
      return;
    }
    const { data, error } = await supabaseAdmin
      .from('battle_questions')
      .update({
        question: parsed.question,
        difficulty: parsed.difficulty,
        theme: parsed.theme,
        answers: parsed.answers,
        correct_answer_index: parsed.correctIndex,
        help_story: parsed.helpStory,
        updated_at: new Date().toISOString(),
      })
      .eq('id', req.params.id)
      .select('id');
    if (error) throw error;
    if (!data || data.length === 0) {
      res.status(404).json({ status: 'error', message: 'Question non trouvée' });
      return;
    }
    res.json({ status: 'success', message: 'Question modifiée avec succès' });
  } catch (err) {
    serverError(res, 'PUT /:id', err);
  }
});

// ─── DELETE /:id — delete a single question ─────────────────────────────────

battleQuestionRoutes.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('battle_questions')
      .delete()
      .eq('id', req.params.id)
      .select('id');
    if (error) throw error;
    if (!data || data.length === 0) {
      res.status(404).json({ status: 'error', message: 'Question non trouvée' });
      return;
    }
    res.json({ status: 'success', message: 'Question supprimée' });
  } catch (err) {
    serverError(res, 'DELETE /:id', err);
  }
});

// ─── PATCH /:id/difficulty — change difficulty ──────────────────────────────

battleQuestionRoutes.patch('/:id/difficulty', async (req: Request, res: Response) => {
  try {
    const { difficulty } = req.body as { difficulty?: string };
    if (!difficulty || !isBattleDifficulty(difficulty)) {
      res.status(400).json({ status: 'error', message: 'Difficulté invalide' });
      return;
    }
    const { data, error } = await supabaseAdmin
      .from('battle_questions')
      .update({ difficulty, updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .select('id');
    if (error) throw error;
    if (!data || data.length === 0) {
      res.status(404).json({ status: 'error', message: 'Question non trouvée' });
      return;
    }
    res.json({ status: 'success', message: `Question déplacée vers ${difficulty}` });
  } catch (err) {
    serverError(res, 'PATCH /:id/difficulty', err);
  }
});

// ─── DELETE /clear/:difficulty — wipe all questions for a difficulty ─────────

battleQuestionRoutes.delete('/clear/:difficulty', async (req: Request, res: Response) => {
  try {
    const { difficulty } = req.params;
    if (!isBattleDifficulty(difficulty)) {
      res.status(400).json({ status: 'error', message: 'Difficulté invalide' });
      return;
    }
    const { error } = await supabaseAdmin
      .from('battle_questions')
      .delete()
      .eq('difficulty', difficulty);
    if (error) throw error;
    res.json({ status: 'success', message: `Toutes les questions ${difficulty} supprimées` });
  } catch (err) {
    serverError(res, 'DELETE /clear/:difficulty', err);
  }
});

// ─── POST /generate — AI question generation via OpenAI ─────────────────────

battleQuestionRoutes.post('/generate', async (req: Request, res: Response) => {
  try {
    const difficulty: string = req.body.difficulty ?? 'Facile';
    if (!isBattleDifficulty(difficulty)) {
      res.status(400).json({ status: 'error', message: 'Difficulté invalide' });
      return;
    }
    const inserted = await generateBattleQuestions({
      difficulty,
      count: Math.min(10, Math.max(1, Number(req.body.count ?? 1))),
      category: req.body.category ?? 'random',
      hint: req.body.hint ?? '',
    });
    if (inserted === 0) {
      res.status(500).json({ status: 'error', message: "Aucune question générée par l'IA" });
      return;
    }
    res.json({
      status: 'success',
      message: `${inserted} question(s) générée(s) avec succès`,
      inserted,
    });
  } catch (err) {
    serverError(res, 'POST /generate', err);
  }
});

// ─── POST /reset-usage — remet toutes les questions en circulation ──────────

battleQuestionRoutes.post('/reset-usage', async (_req: Request, res: Response) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('battle_questions')
      .update({ used_at: null })
      .not('used_at', 'is', null)
      .select('id');
    if (error) throw error;
    res.json({
      status: 'success',
      message: `${data?.length ?? 0} question(s) remise(s) en circulation`,
      reset: data?.length ?? 0,
    });
  } catch (err) {
    serverError(res, 'POST /reset-usage', err);
  }
});

// ─── POST /import — import from external URL (format legacy " (OK)") ────────

battleQuestionRoutes.post('/import', async (_req: Request, res: Response) => {
  try {
    const importUrl = process.env.BATTLE_IMPORT_URL;
    if (!importUrl) {
      res.status(400).json({
        status: 'error',
        message: 'BATTLE_IMPORT_URL non configurée (l\'import par défaut pointait sur ce backend lui-même)',
      });
      return;
    }
    const fetchRes = await fetch(importUrl);
    if (!fetchRes.ok) {
      res.status(500).json({ status: 'error', message: `Impossible de récupérer les données (HTTP ${fetchRes.status})` });
      return;
    }
    const externalData = (await fetchRes.json()) as {
      questions?: Record<string, Array<{ question?: string; theme?: string; answers?: unknown; help_story?: string }>>;
    };
    if (!externalData.questions) {
      res.status(400).json({ status: 'error', message: 'Structure de données invalide: clé "questions" manquante' });
      return;
    }

    const { data: existingRows, error: existingError } = await supabaseAdmin
      .from('battle_questions')
      .select('question, difficulty');
    if (existingError) throw existingError;
    const existingKeys = new Set(
      (existingRows ?? []).map((r) => `${r.question}_${r.difficulty}`),
    );

    let addedCount = 0;
    for (const difficulty of BATTLE_DIFFICULTIES) {
      const questions = externalData.questions[difficulty];
      if (!Array.isArray(questions)) continue;
      for (const q of questions) {
        if (!q.question) continue;
        const key = `${q.question}_${difficulty}`;
        if (existingKeys.has(key)) continue;
        let rawAnswers: unknown = q.answers;
        if (typeof rawAnswers === 'string') {
          try { rawAnswers = JSON.parse(rawAnswers); } catch { continue; }
        }
        if (!Array.isArray(rawAnswers) || rawAnswers.length !== 4) continue;
        if (!rawAnswers.every((a): a is string => typeof a === 'string')) continue;
        const correctIndex = rawAnswers.findIndex((a) => a.includes('(OK)'));
        if (correctIndex === -1) continue;
        const cleaned = rawAnswers.map((a) => a.replace(' (OK)', '').replace('(OK)', '').trim());
        const { error: insertError } = await supabaseAdmin.from('battle_questions').insert({
          question: q.question,
          difficulty,
          theme: q.theme ?? '',
          answers: cleaned,
          correct_answer_index: correctIndex,
          help_story: q.help_story ?? '',
        });
        if (insertError) {
          console.error('[battle-questions] Import insert error:', insertError.message);
          continue;
        }
        addedCount++;
        existingKeys.add(key);
      }
    }

    const { data: statsRows } = await supabaseAdmin.from('battle_questions').select('difficulty');
    const stats: Record<string, number> = { Facile: 0, Moyen: 0, Difficile: 0 };
    for (const row of statsRows ?? []) {
      if (stats[row.difficulty] !== undefined) stats[row.difficulty] += 1;
    }

    res.json({
      status: 'success',
      message: `${addedCount} question(s) importée(s) avec succès`,
      stats,
    });
  } catch (err) {
    serverError(res, 'POST /import', err);
  }
});
