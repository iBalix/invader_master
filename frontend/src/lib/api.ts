/**
 * Client API Axios avec intercepteurs (token, refresh)
 *
 * Refresh requests are serialized: when multiple 401s arrive concurrently,
 * only one refresh is sent; the others wait and reuse the result.
 */

import axios from 'axios';

const API_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

export const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

function forceLogout() {
  localStorage.removeItem('access_token');
  localStorage.removeItem('refresh_token');
  localStorage.removeItem('user');
  if (window.location.pathname !== '/login') {
    window.location.href = '/login';
  }
}

let refreshPromise: Promise<string | null> | null = null;

function doRefresh(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    const rt = localStorage.getItem('refresh_token');
    if (!rt) return null;
    try {
      const { data } = await axios.post(`${API_URL}/auth/refresh`, { refresh_token: rt });
      if (data.session) {
        localStorage.setItem('access_token', data.session.access_token);
        localStorage.setItem('refresh_token', data.session.refresh_token);
        return data.session.access_token as string;
      }
    } catch { /* consumed / expired */ }
    return null;
  })().finally(() => { refreshPromise = null; });

  return refreshPromise;
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      const requestToken = originalRequest.headers?.Authorization?.replace('Bearer ', '');
      const currentToken = localStorage.getItem('access_token');
      if (currentToken && currentToken !== requestToken) {
        originalRequest.headers.Authorization = `Bearer ${currentToken}`;
        return api(originalRequest);
      }

      const newToken = await doRefresh();

      if (newToken) {
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return api(originalRequest);
      }

      const latestToken = localStorage.getItem('access_token');
      if (latestToken && latestToken !== requestToken) {
        originalRequest.headers.Authorization = `Bearer ${latestToken}`;
        return api(originalRequest);
      }

      forceLogout();
    }
    return Promise.reject(error);
  }
);
