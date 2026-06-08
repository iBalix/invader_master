import { Router } from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';

export const websiteSettingsRoutes = Router();

websiteSettingsRoutes.use(authMiddleware, requireRole('admin', 'salarie'));

const ALLOWED_FIELDS = [
  'top_banner_monday',
  'top_banner_tuesday',
  'top_banner_wednesday',
  'top_banner_thursday',
  'top_banner_friday',
  'top_banner_saturday',
  'top_banner_sunday',
  'top_banner_override',
] as const;

websiteSettingsRoutes.get('/', async (_req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('website_settings')
      .select('*')
      .limit(1)
      .single();

    if (error || !data) {
      res.status(404).json({ status: 'error', message: 'Configuration introuvable' });
      return;
    }

    res.json({ status: 'success', data });
  } catch (err) {
    console.error('Get website settings error:', err);
    res.status(500).json({ status: 'error', message: 'Erreur serveur' });
  }
});

websiteSettingsRoutes.put('/', async (req, res) => {
  try {
    const { data: existing, error: fetchErr } = await supabaseAdmin
      .from('website_settings')
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
      .from('website_settings')
      .update(update)
      .eq('id', existing.id)
      .select()
      .single();

    if (error) {
      console.error('[website-settings PUT] supabase error:', error, 'payload:', update);
      res.status(400).json({ status: 'error', message: error.message });
      return;
    }

    res.json({ status: 'success', data });
  } catch (err) {
    console.error('Update website settings error:', err);
    res.status(500).json({ status: 'error', message: 'Erreur serveur' });
  }
});
