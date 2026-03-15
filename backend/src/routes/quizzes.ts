import { Router } from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';

export const quizRoutes = Router();

quizRoutes.use(authMiddleware, requireRole('admin', 'salarie', 'externe'));

// List quizzes with question count
quizRoutes.get('/', async (_req, res) => {
  console.log('[quizzes] GET / handler entered');
  try {
    const { data: quizzes, error } = await supabaseAdmin
      .from('quizzes')
      .select('*')
      .order('created_at', { ascending: false });

    console.log(`[quizzes] DB result: error=${!!error}, count=${(quizzes ?? []).length}`);
    if (error) { console.error('List quizzes DB error:', error); throw error; }

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
      ...q,
      questionCount: countMap[q.id] ?? 0,
    }));

    res.json({ status: 'success', items });
  } catch (err) {
    console.error('List quizzes error:', err);
    res.status(500).json({ status: 'error', message: 'Erreur serveur' });
  }
});

// Get quiz detail with ordered questions
quizRoutes.get('/:id', async (req, res) => {
  try {
    const { data: quiz, error } = await supabaseAdmin
      .from('quizzes')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (error || !quiz) {
      res.status(404).json({ status: 'error', message: 'Quiz introuvable' });
      return;
    }

    const { data: links } = await supabaseAdmin
      .from('quiz_questions')
      .select('question_id, position')
      .eq('quiz_id', quiz.id)
      .order('position', { ascending: true });

    let questions: unknown[] = [];
    if (links && links.length > 0) {
      const ids = links.map((l) => l.question_id);
      const { data: qData } = await supabaseAdmin
        .from('questions')
        .select('*')
        .in('id', ids);

      if (qData) {
        const posMap = new Map(links.map((l) => [l.question_id, l.position]));
        questions = qData.sort(
          (a, b) => (posMap.get(a.id) ?? 0) - (posMap.get(b.id) ?? 0)
        );
      }
    }

    res.json({ status: 'success', quiz: { ...quiz, questions } });
  } catch (err) {
    console.error('Get quiz error:', err);
    res.status(500).json({ status: 'error', message: 'Erreur serveur' });
  }
});

// Create quiz (with optional inline questions)
quizRoutes.post('/', requireRole('admin', 'salarie', 'externe'), async (req, res) => {
  try {
    const { questions: questionIds, ...fields } = req.body;

    fields.last_edited_by = req.user!.id;
    fields.last_edited_by_email = req.user!.email;

    const { data: quiz, error } = await supabaseAdmin
      .from('quizzes')
      .insert(fields)
      .select()
      .single();

    if (error) {
      const msg = error.code === '23505' ? 'Un quiz avec ce nom existe déjà' : error.message;
      res.status(400).json({ status: 'error', message: msg });
      return;
    }

    if (Array.isArray(questionIds) && questionIds.length > 0) {
      const links = questionIds.map((qid: string, i: number) => ({
        quiz_id: quiz.id,
        question_id: qid,
        position: i,
      }));
      await supabaseAdmin.from('quiz_questions').insert(links);
    }

    res.status(201).json({ status: 'success', quiz });
  } catch (err) {
    console.error('Create quiz error:', err);
    res.status(500).json({ status: 'error', message: 'Erreur serveur' });
  }
});

// Update quiz fields + question order
quizRoutes.put('/:id', requireRole('admin', 'salarie', 'externe'), async (req, res) => {
  try {
    const { questions: questionIds, ...fields } = req.body;

    fields.last_edited_by = req.user!.id;
    fields.last_edited_by_email = req.user!.email;

    const { error } = await supabaseAdmin
      .from('quizzes')
      .update(fields)
      .eq('id', req.params.id);

    if (error) {
      const msg = error.code === '23505' ? 'Un quiz avec ce nom existe déjà' : error.message;
      res.status(400).json({ status: 'error', message: msg });
      return;
    }

    if (Array.isArray(questionIds)) {
      await supabaseAdmin
        .from('quiz_questions')
        .delete()
        .eq('quiz_id', req.params.id);

      if (questionIds.length > 0) {
        const links = questionIds.map((qid: string, i: number) => ({
          quiz_id: req.params.id,
          question_id: qid,
          position: i,
        }));
        await supabaseAdmin.from('quiz_questions').insert(links);
      }
    }

    const { data: quiz } = await supabaseAdmin
      .from('quizzes')
      .select('*')
      .eq('id', req.params.id)
      .single();

    res.json({ status: 'success', quiz });
  } catch (err) {
    console.error('Update quiz error:', err);
    res.status(500).json({ status: 'error', message: 'Erreur serveur' });
  }
});

// Delete quiz (+ optionally orphan questions)
quizRoutes.delete('/:id', requireRole('admin', 'salarie', 'externe'), async (req, res) => {
  try {
    const deleteOrphans = req.query.deleteOrphans === 'true';

    let orphanIds: string[] = [];
    if (deleteOrphans) {
      const { data: links } = await supabaseAdmin
        .from('quiz_questions')
        .select('question_id')
        .eq('quiz_id', req.params.id);

      if (links) {
        const qIds = links.map((l) => l.question_id);
        const { data: otherLinks } = await supabaseAdmin
          .from('quiz_questions')
          .select('question_id')
          .neq('quiz_id', req.params.id)
          .in('question_id', qIds);

        const sharedIds = new Set((otherLinks ?? []).map((l) => l.question_id));
        orphanIds = qIds.filter((id) => !sharedIds.has(id));
      }
    }

    const { error } = await supabaseAdmin
      .from('quizzes')
      .delete()
      .eq('id', req.params.id);

    if (error) throw error;

    if (orphanIds.length > 0) {
      await supabaseAdmin.from('questions').delete().in('id', orphanIds);
    }

    res.json({ status: 'success' });
  } catch (err) {
    console.error('Delete quiz error:', err);
    res.status(500).json({ status: 'error', message: 'Erreur serveur' });
  }
});
