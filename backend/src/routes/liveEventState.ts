/**
 * Live event state - singleton row id=1 in `live_event_state` table.
 *
 * - GET /api/live-event   (auth admin/salarie)   : monitoring back-office
 * - GET /public/live-event (public)              : tables read at boot before Pusher subscribe
 * - PUT /api/live-event   (auth OR X-Live-Event-Token header) :
 *     mutate state + trigger Pusher channel `TABLES` (event-start / event-end).
 *     Used by invader_admin (PHP) when an animateur launches/stops a quizz/battle/...
 */

import { Router } from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import { triggerSafe } from '../config/pusher.js';

export const liveEventStateAuthRoutes = Router();
export const liveEventStatePublicRoutes = Router();

async function readState() {
  const { data } = await supabaseAdmin
    .from('live_event_state')
    .select('*')
    .eq('id', 1)
    .maybeSingle();
  return data ?? { id: 1, is_live: false };
}

// Public read (used by tables at boot)
liveEventStatePublicRoutes.get('/', async (_req, res) => {
  try {
    const data = await readState();
    res.json({ status: 'success', liveEvent: data });
  } catch (err) {
    console.error('[liveEvent/public] error:', err);
    res.status(500).json({ status: 'error', message: 'Erreur serveur' });
  }
});

// Authenticated read (back-office monitoring)
liveEventStateAuthRoutes.get(
  '/',
  authMiddleware,
  requireRole('admin', 'salarie'),
  async (_req, res) => {
    try {
      const data = await readState();
      res.json({ status: 'success', liveEvent: data });
    } catch (err) {
      console.error('[liveEvent/auth] error:', err);
      res.status(500).json({ status: 'error', message: 'Erreur serveur' });
    }
  },
);

// PUT - dual auth: either back-office JWT or shared token (for invader_admin PHP)
liveEventStateAuthRoutes.put('/', async (req, res) => {
  try {
    const tokenExpected = process.env.LIVE_EVENT_TOKEN;
    const tokenProvided = req.headers['x-live-event-token'] as string | undefined;
    const hasValidToken = !!(tokenExpected && tokenProvided && tokenProvided === tokenExpected);

    let updatedBy = 'system';

    if (!hasValidToken) {
      // Fallback to JWT auth
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ status: 'error', message: 'Auth requise (Bearer token ou X-Live-Event-Token)' });
        return;
      }
      const token = authHeader.split(' ')[1];
      const { data: userData, error: authError } = await supabaseAdmin.auth.getUser(token);
      if (authError || !userData.user) {
        res.status(401).json({ status: 'error', message: 'Token invalide' });
        return;
      }
      const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('email, role')
        .eq('id', userData.user.id)
        .single();
      if (!profile || !['admin', 'salarie'].includes(profile.role)) {
        res.status(403).json({ status: 'error', message: 'Acces interdit' });
        return;
      }
      updatedBy = profile.email ?? userData.user.id;
    } else {
      updatedBy = 'invader_admin';
    }

    const { is_live, event_type, event_label, redirect_url } = req.body ?? {};
    if (typeof is_live !== 'boolean') {
      res.status(400).json({ status: 'error', message: 'is_live (boolean) requis' });
      return;
    }

    const now = new Date().toISOString();
    const update: Record<string, unknown> = {
      is_live,
      event_type: is_live ? (event_type ?? null) : null,
      event_label: is_live ? (event_label ?? null) : null,
      redirect_url: is_live ? (redirect_url ?? null) : null,
      updated_by: updatedBy,
    };
    if (is_live) {
      update.started_at = now;
      update.ended_at = null;
    } else {
      update.ended_at = now;
    }

    const { data: existing } = await supabaseAdmin
      .from('live_event_state')
      .select('id')
      .eq('id', 1)
      .maybeSingle();

    if (!existing) {
      await supabaseAdmin.from('live_event_state').insert({ id: 1, ...update });
    } else {
      await supabaseAdmin
        .from('live_event_state')
        .update(update)
        .eq('id', 1);
    }

    const { data: state } = await supabaseAdmin
      .from('live_event_state')
      .select('*')
      .eq('id', 1)
      .single();

    if (is_live) {
      await triggerSafe('TABLES', 'event-start', {
        event_type: state?.event_type ?? null,
        event_label: state?.event_label ?? null,
        redirect_url: state?.redirect_url ?? null,
        started_at: state?.started_at ?? null,
      });
    } else {
      await triggerSafe('TABLES', 'event-end', {
        ended_at: state?.ended_at ?? null,
      });
    }

    res.json({ status: 'success', liveEvent: state });
  } catch (err) {
    console.error('[liveEvent/put] error:', err);
    res.status(500).json({ status: 'error', message: 'Erreur serveur' });
  }
});
