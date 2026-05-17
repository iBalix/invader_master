import type { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../config/supabase.js';

export async function requireOrderingEnabled(_req: Request, res: Response, next: NextFunction) {
  try {
    const { data, error } = await supabaseAdmin
      .from('carte_settings')
      .select('ordering_enabled')
      .limit(1)
      .single();

    if (error || !data) {
      res.status(503).json({ status: 'error', message: 'Configuration carte indisponible' });
      return;
    }

    if (!data.ordering_enabled) {
      res.status(403).json({ status: 'error', message: 'Module de commande désactivé' });
      return;
    }

    next();
  } catch (err) {
    console.error('[requireOrderingEnabled] error:', err);
    res.status(500).json({ status: 'error', message: 'Erreur serveur' });
  }
}
