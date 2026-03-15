import { Router } from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';

export const questionRoutes = Router();

questionRoutes.use(authMiddleware, requireRole('admin', 'salarie', 'externe'));

// List questions with optional filters
questionRoutes.get('/', async (req, res) => {
  try {
    const { search } = req.query;

    let query = supabaseAdmin
      .from('questions')
      .select('*')
      .order('created_at', { ascending: false });

    if (typeof search === 'string' && search.trim()) {
      query = query.ilike('question', `%${search.trim()}%`);
    }

    const { data, error } = await query;
    if (error) throw error;

    res.json({ status: 'success', items: data ?? [] });
  } catch (err) {
    console.error('List questions error:', err);
    res.status(500).json({ status: 'error', message: 'Erreur serveur' });
  }
});

// Get single question
questionRoutes.get('/:id', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('questions')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (error || !data) {
      res.status(404).json({ status: 'error', message: 'Question introuvable' });
      return;
    }

    res.json({ status: 'success', question: data });
  } catch (err) {
    console.error('Get question error:', err);
    res.status(500).json({ status: 'error', message: 'Erreur serveur' });
  }
});

// Create question (+ optionally link to a quiz)
questionRoutes.post('/', requireRole('admin', 'salarie', 'externe'), async (req, res) => {
  try {
    const { quiz_id, ...fields } = req.body;

    const { data, error } = await supabaseAdmin
      .from('questions')
      .insert(fields)
      .select()
      .single();

    if (error) {
      res.status(400).json({ status: 'error', message: error.message });
      return;
    }

    if (quiz_id) {
      const { data: maxPos } = await supabaseAdmin
        .from('quiz_questions')
        .select('position')
        .eq('quiz_id', quiz_id)
        .order('position', { ascending: false })
        .limit(1)
        .single();

      const nextPos = maxPos ? maxPos.position + 1 : 0;

      await supabaseAdmin.from('quiz_questions').insert({
        quiz_id,
        question_id: data.id,
        position: nextPos,
      });

      await supabaseAdmin
        .from('quizzes')
        .update({
          last_edited_by: req.user!.id,
          last_edited_by_email: req.user!.email,
        })
        .eq('id', quiz_id);
    }

    res.status(201).json({ status: 'success', question: data });
  } catch (err) {
    console.error('Create question error:', err);
    res.status(500).json({ status: 'error', message: 'Erreur serveur' });
  }
});

// Update question + propagate last editor to parent quizzes
questionRoutes.put('/:id', requireRole('admin', 'salarie', 'externe'), async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('questions')
      .update(req.body)
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) {
      res.status(400).json({ status: 'error', message: error.message });
      return;
    }

    const { data: links } = await supabaseAdmin
      .from('quiz_questions')
      .select('quiz_id')
      .eq('question_id', req.params.id);

    if (links && links.length > 0) {
      const quizIds = links.map((l) => l.quiz_id);
      await supabaseAdmin
        .from('quizzes')
        .update({
          last_edited_by: req.user!.id,
          last_edited_by_email: req.user!.email,
        })
        .in('id', quizIds);
    }

    res.json({ status: 'success', question: data });
  } catch (err) {
    console.error('Update question error:', err);
    res.status(500).json({ status: 'error', message: 'Erreur serveur' });
  }
});

// Delete question (only if not linked to any quiz, or force)
questionRoutes.delete('/:id', requireRole('admin', 'salarie', 'externe'), async (req, res) => {
  try {
    const force = req.query.force === 'true';

    if (!force) {
      const { data: links } = await supabaseAdmin
        .from('quiz_questions')
        .select('quiz_id')
        .eq('question_id', req.params.id)
        .limit(1);

      if (links && links.length > 0) {
        res.status(409).json({
          status: 'error',
          message: 'Cette question est liée à un quiz. Utilisez ?force=true pour forcer.',
        });
        return;
      }
    }

    await supabaseAdmin
      .from('quiz_questions')
      .delete()
      .eq('question_id', req.params.id);

    const { error } = await supabaseAdmin
      .from('questions')
      .delete()
      .eq('id', req.params.id);

    if (error) throw error;

    res.json({ status: 'success' });
  } catch (err) {
    console.error('Delete question error:', err);
    res.status(500).json({ status: 'error', message: 'Erreur serveur' });
  }
});
