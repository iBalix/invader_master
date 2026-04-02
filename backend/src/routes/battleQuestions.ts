/**
 * Battle Questions routes — CRUD + AI generation + import
 * Uses MySQL (legacy invader database) for the battle_questions table.
 */

import { Router, type Request, type Response } from 'express';
import { getMysqlPool } from '../config/mysql.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';

export const battleQuestionRoutes = Router();
battleQuestionRoutes.use(authMiddleware, requireRole('admin', 'salarie'));

const DEFAULT_CATEGORIES = [
  'Cinéma', 'Séries TV', 'Jeux-vidéo', 'Musique', 'Littérature',
  'Géographie', 'Histoire', 'Sciences animaux & nature', 'Sport',
  'Pop culture', 'Actualités & société', 'Culture générale et logique', 'Insolite',
];

const VALID_DIFFICULTIES = ['Facile', 'Moyen', 'Difficile'] as const;
type Difficulty = (typeof VALID_DIFFICULTIES)[number];

function isDifficulty(v: string): v is Difficulty {
  return (VALID_DIFFICULTIES as readonly string[]).includes(v);
}

// ─── GET / — list questions by difficulty ───────────────────────────────────

battleQuestionRoutes.get('/', async (req: Request, res: Response) => {
  try {
    const difficulty = (req.query.difficulty as string) ?? 'Facile';
    if (!isDifficulty(difficulty)) {
      res.status(400).json({ status: 'error', message: 'Difficulté invalide' });
      return;
    }

    const pool = getMysqlPool();
    const [rows] = await pool.query(
      'SELECT id, question, difficulty, theme, answers, help_story, created_at FROM battle_questions WHERE difficulty = ? ORDER BY id ASC',
      [difficulty],
    );

    const questions = (rows as any[]).map((r) => ({
      ...r,
      answers: typeof r.answers === 'string' ? JSON.parse(r.answers) : r.answers,
    }));

    res.json({ status: 'success', questions });
  } catch (err) {
    console.error('[battle-questions] GET / error:', err);
    res.status(500).json({ status: 'error', message: 'Erreur serveur' });
  }
});

// ─── GET /stats — counts per difficulty ─────────────────────────────────────

battleQuestionRoutes.get('/stats', async (_req: Request, res: Response) => {
  try {
    const pool = getMysqlPool();
    const [rows] = await pool.query(
      'SELECT difficulty, COUNT(*) as count FROM battle_questions GROUP BY difficulty',
    );

    const stats: Record<string, number> = { Facile: 0, Moyen: 0, Difficile: 0 };
    let total = 0;
    for (const row of rows as any[]) {
      stats[row.difficulty] = Number(row.count);
      total += Number(row.count);
    }

    res.json({ status: 'success', stats: { ...stats, total } });
  } catch (err) {
    console.error('[battle-questions] GET /stats error:', err);
    res.status(500).json({ status: 'error', message: 'Erreur serveur' });
  }
});

// ─── GET /categories — distinct themes ──────────────────────────────────────

battleQuestionRoutes.get('/categories', async (_req: Request, res: Response) => {
  try {
    const pool = getMysqlPool();
    const [rows] = await pool.query(
      'SELECT DISTINCT theme FROM battle_questions ORDER BY theme',
    );

    const categories = (rows as any[]).map((r) => r.theme as string);
    res.json({ status: 'success', categories: categories.length > 0 ? categories : DEFAULT_CATEGORIES });
  } catch (err) {
    console.error('[battle-questions] GET /categories error:', err);
    res.status(500).json({ status: 'error', message: 'Erreur serveur' });
  }
});

// ─── POST / — add a question manually ──────────────────────────────────────

battleQuestionRoutes.post('/', async (req: Request, res: Response) => {
  try {
    const { question, difficulty, theme, answers, correctAnswer, help_story } = req.body;

    if (!question || !theme || !Array.isArray(answers) || answers.length !== 4 || !isDifficulty(difficulty)) {
      res.status(400).json({ status: 'error', message: 'Données invalides' });
      return;
    }

    const markedAnswers = answers.map((a: string, i: number) =>
      i === Number(correctAnswer) ? `${a} (OK)` : a,
    );

    const pool = getMysqlPool();
    const [result] = await pool.query(
      'INSERT INTO battle_questions (question, difficulty, theme, answers, help_story) VALUES (?, ?, ?, ?, ?)',
      [question, difficulty, theme, JSON.stringify(markedAnswers), help_story ?? ''],
    );

    res.status(201).json({
      status: 'success',
      message: 'Question ajoutée avec succès',
      id: (result as any).insertId,
    });
  } catch (err) {
    console.error('[battle-questions] POST / error:', err);
    res.status(500).json({ status: 'error', message: 'Erreur serveur' });
  }
});

// ─── PUT /:id — edit a question ─────────────────────────────────────────────

battleQuestionRoutes.put('/:id', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const { question, difficulty, theme, answers, correctAnswer, help_story } = req.body;

    if (!question || !theme || !Array.isArray(answers) || answers.length !== 4 || !isDifficulty(difficulty)) {
      res.status(400).json({ status: 'error', message: 'Données invalides' });
      return;
    }

    const cleaned = answers.map((a: string) => a.replace(' (OK)', ''));
    cleaned[Number(correctAnswer)] = `${cleaned[Number(correctAnswer)]} (OK)`;

    const pool = getMysqlPool();
    const [result] = await pool.query(
      'UPDATE battle_questions SET question = ?, difficulty = ?, theme = ?, answers = ?, help_story = ? WHERE id = ?',
      [question, difficulty, theme, JSON.stringify(cleaned), help_story ?? '', id],
    );

    if ((result as any).affectedRows === 0) {
      res.status(404).json({ status: 'error', message: 'Question non trouvée' });
      return;
    }

    res.json({ status: 'success', message: 'Question modifiée avec succès' });
  } catch (err) {
    console.error('[battle-questions] PUT /:id error:', err);
    res.status(500).json({ status: 'error', message: 'Erreur serveur' });
  }
});

// ─── DELETE /:id — delete a single question ─────────────────────────────────

battleQuestionRoutes.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const pool = getMysqlPool();
    const [result] = await pool.query('DELETE FROM battle_questions WHERE id = ?', [id]);

    if ((result as any).affectedRows === 0) {
      res.status(404).json({ status: 'error', message: 'Question non trouvée' });
      return;
    }

    res.json({ status: 'success', message: 'Question supprimée' });
  } catch (err) {
    console.error('[battle-questions] DELETE /:id error:', err);
    res.status(500).json({ status: 'error', message: 'Erreur serveur' });
  }
});

// ─── PATCH /:id/difficulty — change difficulty ──────────────────────────────

battleQuestionRoutes.patch('/:id/difficulty', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const { difficulty } = req.body;

    if (!isDifficulty(difficulty)) {
      res.status(400).json({ status: 'error', message: 'Difficulté invalide' });
      return;
    }

    const pool = getMysqlPool();
    const [result] = await pool.query(
      'UPDATE battle_questions SET difficulty = ? WHERE id = ?',
      [difficulty, id],
    );

    if ((result as any).affectedRows === 0) {
      res.status(404).json({ status: 'error', message: 'Question non trouvée' });
      return;
    }

    res.json({ status: 'success', message: `Question déplacée vers ${difficulty}` });
  } catch (err) {
    console.error('[battle-questions] PATCH /:id/difficulty error:', err);
    res.status(500).json({ status: 'error', message: 'Erreur serveur' });
  }
});

// ─── DELETE /clear/:difficulty — wipe all questions for a difficulty ─────────

battleQuestionRoutes.delete('/clear/:difficulty', async (req: Request, res: Response) => {
  try {
    const { difficulty } = req.params;
    if (!isDifficulty(difficulty)) {
      res.status(400).json({ status: 'error', message: 'Difficulté invalide' });
      return;
    }

    const pool = getMysqlPool();
    await pool.query('DELETE FROM battle_questions WHERE difficulty = ?', [difficulty]);

    res.json({ status: 'success', message: `Toutes les questions ${difficulty} supprimées` });
  } catch (err) {
    console.error('[battle-questions] DELETE /clear/:difficulty error:', err);
    res.status(500).json({ status: 'error', message: 'Erreur serveur' });
  }
});

// ─── POST /generate — AI question generation via OpenAI ─────────────────────

battleQuestionRoutes.post('/generate', async (req: Request, res: Response) => {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      res.status(500).json({ status: 'error', message: 'OPENAI_API_KEY non configurée' });
      return;
    }

    const difficulty: string = req.body.difficulty ?? 'Facile';
    const count = Math.min(10, Math.max(1, Number(req.body.count ?? 1)));
    const category: string = req.body.category ?? 'random';
    const hint: string = (req.body.hint ?? '').trim();

    if (!isDifficulty(difficulty)) {
      res.status(400).json({ status: 'error', message: 'Difficulté invalide' });
      return;
    }

    const pool = getMysqlPool();

    const [catRows] = await pool.query('SELECT DISTINCT theme FROM battle_questions ORDER BY theme');
    const dbCategories = (catRows as any[]).map((r) => r.theme as string);
    const categories = dbCategories.length > 0 ? dbCategories : DEFAULT_CATEGORIES;

    const [existingRows] = await pool.query(
      'SELECT question FROM battle_questions ORDER BY id DESC LIMIT 20',
    );
    const existingTexts = (existingRows as any[]).map((r) => r.question as string);
    const avoidString = existingTexts.length > 0
      ? `\n\nIMPORTANT: NE PAS générer des questions similaires à celles-ci:\n- ${existingTexts.slice(0, 5).join('\n- ')}`
      : '';

    const allGenerated: any[] = [];

    const batchCount = category === 'random' ? count : 1;
    const batchIterations = category === 'random' ? count : 1;
    const questionsPerBatch = category === 'random' ? 1 : count;

    for (let i = 0; i < batchIterations; i++) {
      const selectedCategory = category === 'random'
        ? categories[Math.floor(Math.random() * categories.length)]
        : category;

      const periods = ['années 2020', 'années 2010', 'années 2000', 'années 90', 'années 80', 'de tous les temps', 'récents', 'classiques', 'cultes', 'modernes'];
      const randomPeriod = periods[Math.floor(Math.random() * periods.length)];
      const randomSeed = Math.floor(Math.random() * 1000);

      const hintString = hint
        ? `\n\n⭐ INDICATION SPÉCIALE: Les questions doivent porter sur: "${hint}". Consigne PRIORITAIRE.`
        : '';

      const difficultyInstructions = difficulty === 'Difficile'
        ? `Questions pour CONNAISSEURS et EXPERTS. Détails techniques, anecdotes peu connues, références obscures. Les réponses doivent être proches et difficiles à différencier.`
        : `Questions ACCESSIBLES et GRAND PUBLIC que la plupart des gens peuvent connaître. Privilégie les œuvres/personnages/événements populaires.`;

      const systemPrompt = `Tu es un expert en création de quiz divertissants pour un bar gaming, ciblant un PUBLIC de 20-40 ANS. Génère ${questionsPerBatch} question(s) de niveau ${difficulty} sur le sous-thème '${selectedCategory}'.

CONSIGNES:
- ${difficultyInstructions}
- Mélange différentes époques, en particulier les ${randomPeriod}
- Réponses: MAX 40 caractères, ajouter ' (OK)' sur la bonne
- Chaque réponse doit être UNIQUE et différente des autres
- Seed aléatoire pour variété: ${randomSeed}

TON ET STYLE:
- Ajoute du FUN et de l'ORIGINALITÉ dans la formulation
- Intègre des références pop culture, memes, ou jeux de mots quand approprié
- Évite le ton encyclopédique et scolaire
- Les anecdotes doivent être SURPRENANTES et ENGAGEANTES
${avoidString}${hintString}

Format JSON STRICT (GUILLEMETS DOUBLES obligatoires):
[{
  "question": "...",
  "difficulty": "${difficulty}",
  "theme": "${selectedCategory}",
  "answers": ["Réponse 1", "Réponse 2 (OK)", "Réponse 3", "Réponse 4"],
  "help_story": "Anecdote surprenante"
}]

Retourne UNIQUEMENT le JSON, sans markdown ni commentaire.`;

      try {
        const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: 'gpt-4-turbo-preview',
            temperature: 0.9,
            max_tokens: 1500,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: 'Génère des questions créatives et variées, en évitant les sujets trop rebattus.' },
            ],
          }),
        });

        if (!openaiRes.ok) {
          console.error(`[battle-questions] OpenAI HTTP ${openaiRes.status}`);
          continue;
        }

        const openaiData = await openaiRes.json();
        const content = openaiData.choices?.[0]?.message?.content ?? '';
        const cleaned = content.replace(/```json\s*/g, '').replace(/```/g, '').trim();

        let parsed: any[] | null = null;
        try {
          parsed = JSON.parse(cleaned);
        } catch {
          const repaired = cleaned.replace(/(?<!\\)'([^']*?)(?<!\\)'(?=\s*[:,\]\}])/g, '"$1"');
          try { parsed = JSON.parse(repaired); } catch { /* skip */ }
        }

        if (Array.isArray(parsed)) {
          for (const q of parsed) {
            if (q.question && q.theme && Array.isArray(q.answers) && q.answers.length === 4) {
              allGenerated.push(q);
            }
          }
        }
      } catch (genErr) {
        console.error(`[battle-questions] Generation batch ${i} error:`, genErr);
      }
    }

    if (allGenerated.length === 0) {
      res.status(500).json({ status: 'error', message: "Aucune question générée par l'IA" });
      return;
    }

    let insertedCount = 0;
    for (const q of allGenerated) {
      try {
        await pool.query(
          'INSERT INTO battle_questions (question, difficulty, theme, answers, help_story) VALUES (?, ?, ?, ?, ?)',
          [q.question, difficulty, q.theme, JSON.stringify(q.answers), q.help_story ?? ''],
        );
        insertedCount++;
      } catch (insertErr) {
        console.error('[battle-questions] Insert generated question error:', insertErr);
      }
    }

    res.json({
      status: 'success',
      message: `${insertedCount} question(s) générée(s) avec succès`,
      inserted: insertedCount,
    });
  } catch (err) {
    console.error('[battle-questions] POST /generate error:', err);
    res.status(500).json({ status: 'error', message: 'Erreur serveur' });
  }
});

// ─── POST /import — import from external URL ────────────────────────────────

battleQuestionRoutes.post('/import', async (_req: Request, res: Response) => {
  try {
    const importUrl = process.env.BATTLE_IMPORT_URL
      ?? 'https://invadermaster-backend-production.up.railway.app/public/battle-questions';

    console.log(`[battle-questions] Import from: ${importUrl}`);

    const fetchRes = await fetch(importUrl);
    if (!fetchRes.ok) {
      res.status(500).json({ status: 'error', message: `Impossible de récupérer les données (HTTP ${fetchRes.status})` });
      return;
    }

    const externalData = await fetchRes.json();
    if (!externalData.questions) {
      res.status(400).json({ status: 'error', message: 'Structure de données invalide: clé "questions" manquante' });
      return;
    }

    const pool = getMysqlPool();

    const [existingRows] = await pool.query('SELECT question, difficulty FROM battle_questions');
    const existingKeys = new Set(
      (existingRows as any[]).map((r) => `${r.question}_${r.difficulty}`),
    );

    let addedCount = 0;

    for (const difficulty of VALID_DIFFICULTIES) {
      const questions = externalData.questions[difficulty];
      if (!Array.isArray(questions)) continue;

      for (const q of questions) {
        const key = `${q.question}_${difficulty}`;
        if (existingKeys.has(key)) continue;

        try {
          await pool.query(
            'INSERT INTO battle_questions (question, difficulty, theme, answers, help_story) VALUES (?, ?, ?, ?, ?)',
            [
              q.question,
              difficulty,
              q.theme ?? '',
              typeof q.answers === 'string' ? q.answers : JSON.stringify(q.answers),
              q.help_story ?? '',
            ],
          );
          addedCount++;
          existingKeys.add(key);
        } catch (insertErr) {
          console.error('[battle-questions] Import insert error:', insertErr);
        }
      }
    }

    const [statsRows] = await pool.query(
      'SELECT difficulty, COUNT(*) as count FROM battle_questions GROUP BY difficulty',
    );
    const stats: Record<string, number> = { Facile: 0, Moyen: 0, Difficile: 0 };
    for (const row of statsRows as any[]) {
      stats[row.difficulty] = Number(row.count);
    }

    res.json({
      status: 'success',
      message: `${addedCount} question(s) importée(s) avec succès`,
      stats,
    });
  } catch (err) {
    console.error('[battle-questions] POST /import error:', err);
    res.status(500).json({ status: 'error', message: 'Erreur serveur' });
  }
});
