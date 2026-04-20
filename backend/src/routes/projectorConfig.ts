/**
 * Routes pour la configuration projecteur (singleton).
 *
 * Note V2 (table-ui-v2) :
 * - Le CRUD des events vit desormais dans `events.ts` (table SQL renommee `events`).
 * - Le sous-routeur /events est conserve ici comme alias retro-compatible
 *   pour ne pas casser projo.php legacy qui appelle /api/projector-config/events.
 *   En production, monter la meme `eventsRoutes` aussi sur /api/projector-config/events
 *   (cf. backend/src/index.ts).
 */

import { Router } from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';

export const projectorConfigRoutes = Router();

projectorConfigRoutes.use(authMiddleware, requireRole('admin', 'salarie'));

projectorConfigRoutes.get('/', async (_req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('projector_config')
      .select('*')
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') throw error;

    res.json({ status: 'success', config: data ?? null });
  } catch (err) {
    console.error('Get projector config error:', err);
    res.status(500).json({ status: 'error', message: 'Erreur serveur' });
  }
});

projectorConfigRoutes.put('/', async (req, res) => {
  try {
    const { data: existing } = await supabaseAdmin
      .from('projector_config')
      .select('id')
      .limit(1)
      .single();

    let config;
    if (existing) {
      const { data, error } = await supabaseAdmin
        .from('projector_config')
        .update(req.body)
        .eq('id', existing.id)
        .select()
        .single();
      if (error) throw error;
      config = data;
    } else {
      const { data, error } = await supabaseAdmin
        .from('projector_config')
        .insert(req.body)
        .select()
        .single();
      if (error) throw error;
      config = data;
    }

    res.json({ status: 'success', config });
  } catch (err) {
    console.error('Update projector config error:', err);
    res.status(500).json({ status: 'error', message: 'Erreur serveur' });
  }
});
