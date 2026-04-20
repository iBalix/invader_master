import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { api } from '../lib/api';
import { useAuth } from './useAuth';
import type { Role } from '../types';

export interface PageDef {
  key: string;
  label: string;
}

export const ALL_PAGES: PageDef[] = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'gestion-bar', label: 'Gestion bar' },
  { key: 'contenus/carte', label: 'Carte' },
  { key: 'contenus/jeux', label: 'Jeux' },
  { key: 'contenus/evenements', label: 'Evenements' },
  { key: 'contenus/medias', label: 'Config ecrans' },
  { key: 'contenus/traductions', label: 'Traductions' },
  { key: 'contenus/quiz', label: 'Quiz' },
  { key: 'evenements/battle-questions', label: 'Battle Royal' },
  { key: 'utilitaires/import-finances', label: 'Import finances' },
  { key: 'utilitaires/comptabilite', label: 'Comptabilite' },
  { key: 'tables-tactiles/coupons', label: 'Tables tactiles - Codes promo' },
  { key: 'tables-tactiles/orders', label: 'Tables tactiles - Commandes' },
  { key: 'tables-tactiles/preview', label: 'Tables tactiles - Apercu interface (lien externe)' },
  { key: 'users', label: 'Gestion des users' },
];

const ALL_PAGE_KEYS = ALL_PAGES.map((p) => p.key);

interface PermissionsContextValue {
  permissions: Record<Role, string[]>;
  loading: boolean;
  hasPageAccess: (role: Role, pageKey: string) => boolean;
  pathToPageKey: (path: string) => string | null;
  hasPathAccess: (role: Role, path: string) => boolean;
  getDefaultRoute: (role: Role) => string;
  reload: () => Promise<void>;
}

const defaultPerms: Record<Role, string[]> = {
  admin: [...ALL_PAGE_KEYS],
  salarie: [],
  externe: [],
};

const PermissionsContext = createContext<PermissionsContextValue | null>(null);

export function pathToPageKey(path: string): string | null {
  const normalized = path.replace(/\/$/, '') || '/';
  const stripped = normalized.startsWith('/') ? normalized.slice(1) : normalized;

  if (stripped === '' || stripped === '/') return 'dashboard';

  if (ALL_PAGE_KEYS.includes(stripped)) return stripped;

  const segments = stripped.split('/');
  while (segments.length > 1) {
    segments.pop();
    const parent = segments.join('/');
    if (ALL_PAGE_KEYS.includes(parent)) return parent;
  }

  return null;
}

export function PermissionsProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const [permissions, setPermissions] = useState<Record<Role, string[]>>(defaultPerms);
  const [loading, setLoading] = useState(isAuthenticated);
  const [prevAuth, setPrevAuth] = useState(isAuthenticated);

  if (isAuthenticated !== prevAuth) {
    setPrevAuth(isAuthenticated);
    if (isAuthenticated) {
      setLoading(true);
    } else {
      setPermissions(defaultPerms);
      setLoading(false);
    }
  }

  const load = useCallback(async () => {
    try {
      const { data } = await api.get<{ permissions: Record<Role, string[]> }>('/api/role-permissions');
      setPermissions({
        admin: [...ALL_PAGE_KEYS],
        salarie: data.permissions.salarie ?? [],
        externe: data.permissions.externe ?? [],
      });
    } catch {
      setPermissions(defaultPerms);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      load();
    }
  }, [isAuthenticated, load]);

  const hasPageAccess = useCallback(
    (role: Role, pageKey: string): boolean => {
      if (role === 'admin') return true;
      return (permissions[role] ?? []).includes(pageKey);
    },
    [permissions],
  );

  const hasPathAccess = useCallback(
    (role: Role, path: string): boolean => {
      if (role === 'admin') return true;
      const key = pathToPageKey(path);
      if (!key) return false;
      return hasPageAccess(role, key);
    },
    [hasPageAccess],
  );

  const getDefaultRoute = useCallback(
    (role: Role): string => {
      if (role === 'admin') return '/';
      const pages = permissions[role] ?? [];
      if (pages.includes('dashboard')) return '/';
      if (pages.length > 0) return `/${pages[0]}`;
      return '/login';
    },
    [permissions],
  );

  return (
    <PermissionsContext.Provider
      value={{ permissions, loading, hasPageAccess, pathToPageKey, hasPathAccess, getDefaultRoute, reload: load }}
    >
      {children}
    </PermissionsContext.Provider>
  );
}

export function usePermissions(): PermissionsContextValue {
  const ctx = useContext(PermissionsContext);
  if (!ctx) throw new Error('usePermissions doit etre utilise dans un PermissionsProvider');
  return ctx;
}
