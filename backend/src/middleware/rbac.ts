/**
 * RBAC middleware: require one of the given roles to access the route
 */

import type { Request, Response, NextFunction } from 'express';
import type { Role } from '../types/index.js';

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
