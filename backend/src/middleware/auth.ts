/**
 * Auth middleware: validates JWT and loads user profile (role) from profiles table
 */

import type { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import type { AuthUser } from '../types/index.js';

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export const authMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        status: 'error',
        message: "Token d'authentification manquant",
      });
      return;
    }

    const token = authHeader.split(' ')[1];

    const {
      data: { user },
      error: authError,
    } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      res.status(401).json({
        status: 'error',
        message: 'Token invalide ou expiré',
      });
      return;
    }

    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('id, email, role')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      res.status(403).json({
        status: 'error',
        message: 'Profil utilisateur introuvable',
      });
      return;
    }

    req.user = {
      id: profile.id,
      email: profile.email,
      role: profile.role as AuthUser['role'],
    };

    next();
  } catch (err) {
    console.error('Erreur middleware auth:', err);
    res.status(500).json({
      status: 'error',
      message: "Erreur lors de la vérification de l'authentification",
    });
  }
};
