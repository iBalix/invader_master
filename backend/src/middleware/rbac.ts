/**
 * RBAC middleware: require one of the given roles to access the route
 */

import type { Request, Response, NextFunction } from 'express';
import type { Role } from '../types/index.js';
import { supabaseAdmin } from '../config/supabase.js';

export const requireRole = (...allowedRoles: Role[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ status: 'error', message: 'Non authentifié' });
      return;
    }
    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({ status: 'error', message: 'Accès interdit' });
      return;
    }
    next();
  };
};

/**
 * Acces par page, aligne sur le reglage "Permissions" du back-office : un admin
 * passe toujours, un autre role passe s'il a au moins une des pages demandees
 * dans `role_permissions`. A utiliser quand la donnee servie est sensible et
 * que le garde de route cote front ne suffit pas (ex. stats financieres).
 */
export const requirePageAccess = (...pageKeys: string[]) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ status: 'error', message: 'Non authentifié' });
      return;
    }
    if (req.user.role === 'admin') {
      next();
      return;
    }
    try {
      const { data, error } = await supabaseAdmin
        .from('role_permissions')
        .select('page_key')
        .eq('role', req.user.role)
        .in('page_key', pageKeys)
        .limit(1);
      if (error) throw error;
      if (data && data.length > 0) {
        next();
        return;
      }
      res.status(403).json({ status: 'error', message: 'Accès interdit' });
    } catch (err) {
      console.error('requirePageAccess error:', err);
      res.status(500).json({ status: 'error', message: 'Erreur serveur' });
    }
  };
};
