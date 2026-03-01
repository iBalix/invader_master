/**
 * Auth routes: login, refresh, me
 */

import { Router, type Request } from 'express';
import { supabaseAdmin, supabaseClient } from '../config/supabase.js';
import { authMiddleware } from '../middleware/auth.js';

export const authRoutes = Router();

authRoutes.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body as { email?: string; password?: string };
    if (!email || !password) {
      res.status(400).json({ status: 'error', message: 'Email et mot de passe requis' });
      return;
    }

    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email: String(email).toLowerCase().trim(),
      password: String(password),
    });

    if (error) {
      res.status(401).json({
        status: 'error',
        message: error.message === 'Invalid login credentials' ? 'Identifiants incorrects' : error.message,
      });
      return;
    }

    if (!data.session || !data.user) {
      res.status(401).json({ status: 'error', message: 'Session invalide' });
      return;
    }

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('id, email, role')
      .eq('id', data.user.id)
      .single();

    if (!profile) {
      res.status(403).json({ status: 'error', message: 'Profil utilisateur introuvable' });
      return;
    }

    res.json({
      status: 'success',
      session: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_at: data.session.expires_at,
      },
      user: {
        id: profile.id,
        email: profile.email,
        role: profile.role,
      },
    });
  } catch (err) {
    console.error('Auth login error:', err);
    res.status(500).json({ status: 'error', message: 'Erreur de connexion' });
  }
});

authRoutes.post('/refresh', async (req, res) => {
  try {
    const { refresh_token } = req.body as { refresh_token?: string };
    if (!refresh_token) {
      res.status(400).json({ status: 'error', message: 'refresh_token requis' });
      return;
    }

    const { data, error } = await supabaseAdmin.auth.refreshSession({
      refresh_token: String(refresh_token),
    });

    if (error || !data.session) {
      res.status(401).json({ status: 'error', message: 'Token de rafraîchissement invalide' });
      return;
    }

    res.json({
      status: 'success',
      session: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_at: data.session.expires_at,
      },
    });
  } catch (err) {
    console.error('Auth refresh error:', err);
    res.status(500).json({ status: 'error', message: 'Erreur de rafraîchissement' });
  }
});

authRoutes.get('/me', authMiddleware, (req: Request, res) => {
  if (!req.user) {
    res.status(401).json({ status: 'error', message: 'Non authentifié' });
    return;
  }
  res.json({ status: 'success', user: req.user });
});
