/**
 * Hook useAuth - AuthContext + AuthProvider
 *
 * User state is hydrated synchronously from localStorage on mount (no network
 * request).  Expired tokens are handled lazily by the Axios 401 interceptor
 * when the first real API call fails, eliminating race conditions between a
 * background /auth/me check and the login flow.
 */

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from 'react';
import { api } from '../lib/api';
import type { AuthUser } from '../types';

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; message?: string; role?: string }>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function loadSavedUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem('user');
    if (raw) return JSON.parse(raw) as AuthUser;
  } catch { /* corrupted – ignore */ }
  return null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(loadSavedUser);
  const [loading, setLoading] = useState(false);

  const refreshUser = useCallback(async () => {
    const token = localStorage.getItem('access_token');
    if (!token) {
      setUser(null);
      return;
    }
    try {
      const { data } = await api.get<{ status: string; user: AuthUser }>('/auth/me');
      if (data.status === 'success' && data.user) {
        setUser(data.user);
        localStorage.setItem('user', JSON.stringify(data.user));
      }
    } catch { /* interceptor handles 401 */ }
  }, []);

  const login = useCallback(
    async (email: string, password: string): Promise<{ success: boolean; message?: string; role?: string }> => {
      setLoading(true);
      try {
        const { data } = await api.post<{
          status: string;
          session?: { access_token: string; refresh_token: string };
          user?: AuthUser;
          message?: string;
        }>('/auth/login', { email, password });

        if (data.status === 'success' && data.session && data.user) {
          localStorage.setItem('access_token', data.session.access_token);
          localStorage.setItem('refresh_token', data.session.refresh_token);
          localStorage.setItem('user', JSON.stringify(data.user));
          setUser(data.user);
          return { success: true, role: data.user.role as string };
        }
        return { success: false, message: data.message ?? 'Erreur de connexion' };
      } catch (err: unknown) {
        const msg =
          (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
          'Erreur de connexion';
        return { success: false, message: msg };
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const logout = useCallback(() => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('user');
    setUser(null);
  }, []);

  const value: AuthContextValue = {
    user,
    loading,
    isAuthenticated: !!user,
    login,
    logout,
    refreshUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth doit être utilisé dans un AuthProvider');
  return ctx;
}
