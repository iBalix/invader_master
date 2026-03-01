/**
 * Matrice de permissions unique : routes et roles autorises
 */

import type { Role } from '../types';

export const PERMISSIONS: Record<string, Role[]> = {
  '/': ['admin', 'salarie'],
  '/users': ['admin'],
  '/contenus': ['admin', 'salarie', 'externe'],
  '/bientot': ['admin', 'salarie'],
};

export const DEFAULT_ROUTE_BY_ROLE: Record<Role, string> = {
  admin: '/',
  salarie: '/',
  externe: '/contenus',
};

export function hasAccess(role: Role, path: string): boolean {
  const normalizedPath = path.replace(/\/$/, '') || '/';
  const roles = PERMISSIONS[normalizedPath];
  return roles ? roles.includes(role) : false;
}

export function getDefaultRouteForRole(role: Role): string {
  return DEFAULT_ROUTE_BY_ROLE[role];
}
