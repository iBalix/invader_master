/**
 * Back-office: reglages globaux des tables tactiles (singleton).
 *  - screensaver_timeout_ms : duree avant bascule sur la veille
 *  - menu_button_image_url / games_button_image_url : illustrations boutons home
 */

import { Router } from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';

export const tablesSettingsRoutes = Router();

tablesSettingsRoutes.use(authMiddleware, requireRole('admin', 'salarie'));

const ALLOWED = [
  'screensaver_timeout_ms',
  'home_featured_interval_ms',
  'home_button_preview_interval_ms',
  'menu_button_image_url',
  'games_button_image_url',
  'menu_button_color',
  'games_button_color',
  'design_per_table',
] as const;

tablesSettingsRoutes.get('/', async (_req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('tables_settings')
      .select('*')
      .limit(1)
      .single();
    if (error || !data) {
      res.status(404).json({ status: 'error', message: 'Configuration introuvable' });
      return;
    }
    res.json({ status: 'success', data });
  } catch (err) {
    console.error('Get tables settings error:', err);
    res.status(500).json({ status: 'error', message: 'Erreur serveur' });
  }
});

tablesSettingsRoutes.put('/', async (req, res) => {
  try {
    const { data: existing, error: fetchErr } = await supabaseAdmin
      .from('tables_settings')
      .select('id')
      .limit(1)
      .single();
    if (fetchErr || !existing) {
      res.status(404).json({ status: 'error', message: 'Configuration introuvable' });
      return;
    }

    const update: Record<string, unknown> = {};
    for (const key of ALLOWED) {
      if (key in req.body) update[key] = req.body[key];
    }
    if (update.screensaver_timeout_ms != null) {
      const n = Number(update.screensaver_timeout_ms);
      update.screensaver_timeout_ms = Number.isFinite(n) ? Math.max(10000, Math.round(n)) : 90000;
    }
    if (update.home_featured_interval_ms != null) {
      const n = Number(update.home_featured_interval_ms);
      update.home_featured_interval_ms = Number.isFinite(n) ? Math.max(5000, Math.round(n)) : 30000;
    }
    if (update.home_button_preview_interval_ms != null) {
      const n = Number(update.home_button_preview_interval_ms);
      update.home_button_preview_interval_ms = Number.isFinite(n) ? Math.max(5000, Math.round(n)) : 20000;
    }

    const { data, error } = await supabaseAdmin
      .from('tables_settings')
      .update(update)
      .eq('id', existing.id)
      .select()
      .single();
    if (error) {
      res.status(400).json({ status: 'error', message: error.message });
      return;
    }
    res.json({ status: 'success', data });
  } catch (err) {
    console.error('Update tables settings error:', err);
    res.status(500).json({ status: 'error', message: 'Erreur serveur' });
  }
});
