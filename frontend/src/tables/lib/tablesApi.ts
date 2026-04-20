/**
 * Axios instance pour les endpoints publics des tables tactiles.
 *
 * Chaque requete envoie automatiquement le hostname courant en header
 * `X-Hostname` (utile pour le tracking / heartbeat / logs serveur).
 *
 * Aucune authentification Bearer : les routes /public/* sont ouvertes
 * (les tables ne sont pas connectees a un compte utilisateur).
 */

import axios from 'axios';
import { getHostname } from './hostname';

const API_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

export const publicApi = axios.create({
  baseURL: `${API_URL}/public`,
  headers: { 'Content-Type': 'application/json' },
  timeout: 15000,
});

publicApi.interceptors.request.use((config) => {
  const hostname = getHostname();
  if (hostname) {
    config.headers['X-Hostname'] = hostname;
  }
  return config;
});

export const tablesApi = axios.create({
  baseURL: `${API_URL}/public/tables`,
  headers: { 'Content-Type': 'application/json' },
  timeout: 15000,
});

tablesApi.interceptors.request.use((config) => {
  const hostname = getHostname();
  if (hostname) {
    config.headers['X-Hostname'] = hostname;
  }
  return config;
});

export const BACKEND_URL = API_URL;
