import { Router } from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';

export const carteSettingsRoutes = Router();

carteSettingsRoutes.use(authMiddleware, requireRole('admin', 'salarie'));

const ALLOWED_FIELDS = [
  'happy_hour_start',
  'happy_hour_end',
  'happy_hour_days',
  'ordering_enabled',
  'google_review_url',
] as const;

carteSettingsRoutes.get('/', async (_req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('carte_settings')
      .select('*')
      .limit(1)
      .single();

    if (error || !data) {
      res.status(404).json({ status: 'error', message: 'Configuration introuvable' });
      return;
    }

    res.json({ status: 'success', data });
  } catch (err) {
    console.error('Get carte settings error:', err);
    res.status(500).json({ status: 'error', message: 'Erreur serveur' });
  }
});

carteSettingsRoutes.put('/', async (req, res) => {
  try {
    const { data: existing, error: fetchErr } = await supabaseAdmin
      .from('carte_settings')
      .select('id')
      .limit(1)
      .single();

    if (fetchErr || !existing) {
      res.status(404).json({ status: 'error', message: 'Configuration introuvable' });
      return;
    }

    const update: Record<string, unknown> = {};
    for (const key of ALLOWED_FIELDS) {
      if (key in req.body) update[key] = req.body[key];
    }

    const { data, error } = await supabaseAdmin
      .from('carte_settings')
      .update(update)
      .eq('id', existing.id)
      .select()
      .single();

    if (error) {
      console.error('[carte-settings PUT] supabase error:', error, 'payload:', update);
      res.status(400).json({ status: 'error', message: error.message });
      return;
    }

    res.json({ status: 'success', data });
  } catch (err) {
    console.error('Update carte settings error:', err);
    res.status(500).json({ status: 'error', message: 'Erreur serveur' });
  }
});
