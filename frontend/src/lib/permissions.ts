/**
 * Matrice de permissions unique : routes et roles autorises
 */

import type { Role } from '../types';

export const PERMISSIONS: Record<string, Role[]> = {
  '/': ['admin', 'salarie'],
  '/users': ['admin'],
  '/contenus/quiz': ['admin', 'salarie', 'externe'],
  '/contenus/carte': ['admin', 'salarie'],
  '/contenus/jeux': ['admin', 'salarie'],
  '/bientot': ['admin', 'salarie'],
};

export const DEFAULT_ROUTE_BY_ROLE: Record<Role, string> = {
  admin: '/',
  salarie: '/',
  externe: '/contenus/quiz',
};

export function hasAccess(role: Role, path: string): boolean {
  const normalizedPath = path.replace(/\/$/, '') || '/';
  const roles = PERMISSIONS[normalizedPath];
  if (roles) return roles.includes(role);

  // Check parent paths (e.g. /contenus/quiz/new -> /contenus/quiz)
  const segments = normalizedPath.split('/');
  while (segments.length > 1) {
    segments.pop();
    const parentPath = segments.join('/') || '/';
    const parentRoles = PERMISSIONS[parentPath];
    if (parentRoles) return parentRoles.includes(role);
  }

  return false;
}

export function getDefaultRouteForRole(role: Role): string {
  return DEFAULT_ROUTE_BY_ROLE[role];
}
