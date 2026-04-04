/**
 * Hook useAuth - AuthContext + AuthProvider
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const loginSucceeded = useRef(false);

  const refreshUser = useCallback(async () => {
    const token = localStorage.getItem('access_token');
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const { data } = await api.get<{ status: string; user: AuthUser }>('/auth/me');
      if (data.status === 'success' && data.user) {
        setUser(data.user);
        localStorage.setItem('user', JSON.stringify(data.user));
      } else if (!loginSucceeded.current) {
        setUser(null);
      }
    } catch {
      if (!loginSucceeded.current) {
        setUser(null);
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        localStorage.removeItem('user');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem('user');
    if (saved) {
      try {
        setUser(JSON.parse(saved) as AuthUser);
      } catch {
        setUser(null);
      }
    }
    refreshUser();
  }, [refreshUser]);

  const login = useCallback(
    async (email: string, password: string): Promise<{ success: boolean; message?: string; role?: string }> => {
      loginSucceeded.current = false;
      try {
        const { data } = await api.post<{
          status: string;
          session?: { access_token: string; refresh_token: string };
          user?: AuthUser;
          message?: string;
        }>('/auth/login', { email, password });

        if (data.status === 'success' && data.session && data.user) {
          loginSucceeded.current = true;
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
      }
    },
    []
  );

  const logout = useCallback(() => {
    loginSucceeded.current = false;
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
