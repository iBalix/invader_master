/**
 * Back-office: tables tactiles enregistrees (table_devices).
 */

import { Router } from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import { triggerSafe } from '../config/pusher.js';

export const tableDevicesRoutes = Router();

tableDevicesRoutes.use(authMiddleware, requireRole('admin', 'salarie'));

tableDevicesRoutes.get('/', async (_req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('table_devices')
      .select('*')
      .order('hostname', { ascending: true });
    if (error) throw error;
    res.json({ status: 'success', items: data ?? [] });
  } catch (err) {
    console.error('List table devices error:', err);
    res.status(500).json({ status: 'error', message: 'Erreur serveur' });
  }
});

tableDevicesRoutes.put('/:id', async (req, res) => {
  try {
    const { display_name, inactivity_timeout_ms, active } = req.body ?? {};
    const update: Record<string, unknown> = {};
    if (typeof display_name === 'string') update.display_name = display_name;
    if (typeof inactivity_timeout_ms === 'number') update.inactivity_timeout_ms = inactivity_timeout_ms;
    if (typeof active === 'boolean') update.active = active;

    const { data, error } = await supabaseAdmin
      .from('table_devices')
      .update(update)
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) {
      res.status(400).json({ status: 'error', message: error.message });
      return;
    }
    res.json({ status: 'success', device: data });
  } catch (err) {
    console.error('Update table device error:', err);
    res.status(500).json({ status: 'error', message: 'Erreur serveur' });
  }
});

tableDevicesRoutes.delete('/:id', async (req, res) => {
  try {
    const { error } = await supabaseAdmin
      .from('table_devices')
      .delete()
      .eq('id', req.params.id);
    if (error) throw error;
    res.json({ status: 'success' });
  } catch (err) {
    console.error('Delete table device error:', err);
    res.status(500).json({ status: 'error', message: 'Erreur serveur' });
  }
});

// POST /api/table-devices/:hostname/reload
// Force un reload sur une table specifique (pousse Pusher event `reload`)
tableDevicesRoutes.post('/:hostname/reload', async (req, res) => {
  try {
    const hostname = req.params.hostname;
    if (!/^TABLE\d{2}-[12]$/.test(hostname)) {
      res.status(400).json({ status: 'error', message: 'hostname invalide' });
      return;
    }
    await triggerSafe(hostname, 'reload', {});
    res.json({ status: 'success' });
  } catch (err) {
    console.error('Reload table device error:', err);
    res.status(500).json({ status: 'error', message: 'Erreur serveur' });
  }
});
