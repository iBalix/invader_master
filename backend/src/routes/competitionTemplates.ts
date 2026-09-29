/**
 * Modèles d'événements (configurations enregistrées sous un nom, relançables
 * en un clic depuis la console du gestionnaire d'événements).
 * Montées sur /api/competition-templates (auth admin/salarie).
 *
 * La config est validée et complétée à l'enregistrement (normalize) : un
 * modèle en base est toujours lançable tel quel.
 */

import { Router } from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import { normalizeTournamentConfig } from '../games/tournament/registry.js';
import { createTournamentSession } from '../games/tournament/tournamentFlow.js';
import { tournamentConfigOf } from '../games/tournament/types.js';
import { switchScreensToGame } from '../games/screens.js';

export const competitionTemplateRoutes = Router();

competitionTemplateRoutes.use(authMiddleware, requireRole('admin', 'salarie'));

function httpError(res: Parameters<Parameters<typeof competitionTemplateRoutes.get>[1]>[1], err: unknown): void {
  const status = (err as { httpStatus?: number }).httpStatus ?? 500;
  const message = err instanceof Error ? err.message : 'Erreur interne';
  if (status >= 500) console.error('[competitionTemplates]', err);
  res.status(status).json({ status: 'error', message });
}

interface TemplateRow {
  id: string;
  name: string;
  mode: string;
  config: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  last_used_at: string | null;
}

function toCamel(row: TemplateRow): Record<string, unknown> {
  return {
    id: row.id,
    name: row.name,
    mode: row.mode,
    config: row.config,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastUsedAt: row.last_used_at,
  };
}

function cleanName(v: unknown): string {
  const name = typeof v === 'string' ? v.trim().slice(0, 60) : '';
  if (!name) throw Object.assign(new Error('Donne un nom à ce modèle'), { httpStatus: 400 });
  return name;
}

function duplicateName(err: { code?: string; message?: string } | null): boolean {
  return Boolean(err && (err.code === '23505' || `${err.message}`.includes('duplicate')));
}

/**
 * Config enregistrée : sans les champs propres à un lancement. Titre vide =
 * le nom du modèle (sinon la normalisation poserait « Tournoi »).
 */
function storedConfig(input: unknown, name: string): Record<string, unknown> {
  const src = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const title = typeof src.title === 'string' && src.title.trim() ? src.title : name;
  const { templateId: _id, templateName: _name, ...rest } = normalizeTournamentConfig({ ...src, title });
  return rest;
}

competitionTemplateRoutes.get('/', async (_req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('competition_templates')
      .select('*')
      .order('last_used_at', { ascending: false, nullsFirst: false })
      .order('name', { ascending: true });
    if (error) throw error;
    res.json({ status: 'success', items: ((data as TemplateRow[]) ?? []).map(toCamel) });
  } catch (err) {
    httpError(res, err);
  }
});

competitionTemplateRoutes.post('/', async (req, res) => {
  try {
    const body = req.body as { name?: string; config?: unknown };
    const name = cleanName(body.name);
    const { data, error } = await supabaseAdmin
      .from('competition_templates')
      .insert({ name, mode: 'tournament', config: storedConfig(body.config, name), created_by: req.user?.id ?? null })
      .select('*')
      .single();
    if (error) {
      if (duplicateName(error)) {
        res.status(409).json({ status: 'error', message: 'Un modèle porte déjà ce nom' });
        return;
      }
      throw error;
    }
    res.status(201).json({ status: 'success', data: toCamel(data as TemplateRow) });
  } catch (err) {
    httpError(res, err);
  }
});

competitionTemplateRoutes.put('/:id', async (req, res) => {
  try {
    const body = req.body as { name?: string; config?: unknown };
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.name !== undefined) patch.name = cleanName(body.name);
    if (body.config !== undefined) {
      patch.config = storedConfig(body.config, typeof patch.name === 'string' ? patch.name : 'Tournoi');
    }
    // fail-loud : .select() pour détecter un id inexistant (0 ligne)
    const { data, error } = await supabaseAdmin
      .from('competition_templates')
      .update(patch)
      .eq('id', req.params.id)
      .select('*');
    if (error) {
      if (duplicateName(error)) {
        res.status(409).json({ status: 'error', message: 'Un modèle porte déjà ce nom' });
        return;
      }
      throw error;
    }
    if (!data || data.length === 0) {
      res.status(404).json({ status: 'error', message: 'Modèle introuvable' });
      return;
    }
    res.json({ status: 'success', data: toCamel(data[0] as TemplateRow) });
  } catch (err) {
    httpError(res, err);
  }
});

competitionTemplateRoutes.delete('/:id', async (req, res) => {
  try {
    const { error } = await supabaseAdmin.from('competition_templates').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ status: 'success' });
  } catch (err) {
    httpError(res, err);
  }
});

/** Lancer un événement depuis un modèle (écrans du bar basculés, sauf test) */
competitionTemplateRoutes.post('/:id/launch', async (req, res) => {
  try {
    const body = req.body as { force?: boolean; testMode?: boolean };
    const { data, error } = await supabaseAdmin
      .from('competition_templates')
      .select('*')
      .eq('id', req.params.id)
      .maybeSingle();
    if (error) throw error;
    const tpl = data as TemplateRow | null;
    if (!tpl) {
      res.status(404).json({ status: 'error', message: 'Modèle introuvable' });
      return;
    }
    const config = {
      ...tpl.config,
      title: (tpl.config.title as string | undefined) || tpl.name,
      ...(typeof body.testMode === 'boolean' ? { testMode: body.testMode } : {}),
    };
    const session = await createTournamentSession(config, {
      force: body.force === true,
      templateId: tpl.id,
      templateName: tpl.name,
    });
    if (!tournamentConfigOf(session).testMode) {
      switchScreensToGame(`tournament ${session.id.slice(0, 8)}`);
    }
    res.json({ status: 'success', data: { id: session.id, joinCode: session.join_code } });
  } catch (err) {
    httpError(res, err);
  }
});
