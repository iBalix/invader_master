import { Router } from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import { isAgentConnected, sendCommand, getPingStatus } from '../websocket/agent-bridge.js';

export const barRoutes = Router();

barRoutes.use(authMiddleware, requireRole('admin', 'salarie'));

// ── Agent status ────────────────────────────────────────────────────

barRoutes.get('/agent-status', (_req, res) => {
  res.json({ status: 'success', connected: isAgentConnected() });
});

// ── Execute command on local agent ──────────────────────────────────

barRoutes.post('/execute-command', async (req, res) => {
  try {
    const { command, targetName, gameName } = req.body;

    if (!command || !targetName) {
      res.status(400).json({ status: 'error', message: 'command et targetName requis' });
      return;
    }

    const result = await sendCommand(command, { targetName, gameName: gameName ?? '' });
    res.json({ status: 'success', result });
  } catch (err: any) {
    console.error('Execute command error:', err);
    res.status(503).json({ status: 'error', message: err.message ?? 'Erreur agent' });
  }
});

// ── Ping status ────────────────────────────────────────────────────

barRoutes.get('/ping-status', (_req, res) => {
  res.json({ status: 'success', results: getPingStatus() });
});

// ── Machine labels ──────────────────────────────────────────────────

barRoutes.get('/machine-labels', async (_req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('machine_labels')
      .select('machine_name, display_name, technical_name');

    if (error) throw error;

    const labels: Record<string, { display_name: string; technical_name: string }> = {};
    for (const row of data ?? []) {
      labels[row.machine_name] = {
        display_name: row.display_name,
        technical_name: row.technical_name,
      };
    }

    res.json({ status: 'success', labels });
  } catch (err) {
    console.error('Machine labels list error:', err);
    res.status(500).json({ status: 'error', message: 'Erreur serveur' });
  }
});

barRoutes.put('/machine-labels/:machineName', requireRole('admin'), async (req, res) => {
  try {
    const { machineName } = req.params;
    const { display_name, technical_name } = req.body;

    if (typeof display_name !== 'string' || typeof technical_name !== 'string') {
      res.status(400).json({ status: 'error', message: 'display_name et technical_name requis' });
      return;
    }

    const { error } = await supabaseAdmin
      .from('machine_labels')
      .upsert(
        { machine_name: machineName, display_name, technical_name },
        { onConflict: 'machine_name' },
      );

    if (error) throw error;

    res.json({ status: 'success' });
  } catch (err) {
    console.error('Machine label update error:', err);
    res.status(500).json({ status: 'error', message: 'Erreur serveur' });
  }
});

// ── Incidents CRUD ──────────────────────────────────────────────────

barRoutes.get('/incidents', async (req, res) => {
  try {
    let query = supabaseAdmin
      .from('bar_incidents')
      .select('*')
      .order('created_at', { ascending: false });

    if (req.query.resolved !== undefined) {
      query = query.eq('resolved', req.query.resolved === 'true');
    }
    if (req.query.machine) {
      query = query.eq('machine_name', req.query.machine);
    }

    const { data, error } = await query;
    if (error) throw error;

    res.json({ status: 'success', items: data ?? [] });
  } catch (err) {
    console.error('List incidents error:', err);
    res.status(500).json({ status: 'error', message: 'Erreur serveur' });
  }
});

barRoutes.get('/incidents/:machineName', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('bar_incidents')
      .select('*')
      .eq('machine_name', req.params.machineName)
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json({ status: 'success', items: data ?? [] });
  } catch (err) {
    console.error('List machine incidents error:', err);
    res.status(500).json({ status: 'error', message: 'Erreur serveur' });
  }
});

barRoutes.post('/incidents', async (req, res) => {
  try {
    const { machine_name, machine_type, reason, description } = req.body;

    if (!machine_name || !machine_type || !reason) {
      res.status(400).json({ status: 'error', message: 'machine_name, machine_type et reason requis' });
      return;
    }

    const { data, error } = await supabaseAdmin
      .from('bar_incidents')
      .insert({
        machine_name,
        machine_type,
        reason,
        description: description ?? null,
        created_by: req.user!.id,
      })
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({ status: 'success', incident: data });
  } catch (err) {
    console.error('Create incident error:', err);
    res.status(500).json({ status: 'error', message: 'Erreur serveur' });
  }
});

barRoutes.patch('/incidents/:id/resolve', async (req, res) => {
  try {
    const resolved = Boolean(req.body.resolved);

    const { data, error } = await supabaseAdmin
      .from('bar_incidents')
      .update({
        resolved,
        resolved_at: resolved ? new Date().toISOString() : null,
        resolved_by: resolved ? req.user!.id : null,
      })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;

    res.json({ status: 'success', incident: data });
  } catch (err) {
    console.error('Resolve incident error:', err);
    res.status(500).json({ status: 'error', message: 'Erreur serveur' });
  }
});
