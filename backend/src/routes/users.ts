/**
 * Users CRUD routes (admin only)
 */

import { Router, type Request } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import { supabaseAdmin } from '../config/supabase.js';
import type { Role } from '../types/index.js';

export const userRoutes = Router();

userRoutes.use(authMiddleware);
userRoutes.use(requireRole('admin'));

userRoutes.get('/', async (_req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('profiles')
      .select('id, email, role, display_name, created_at, updated_at')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('List users error:', error);
      res.status(500).json({ status: 'error', message: 'Erreur lors du chargement des utilisateurs' });
      return;
    }

    res.json({ status: 'success', users: data ?? [] });
  } catch (err) {
    console.error('List users error:', err);
    res.status(500).json({ status: 'error', message: 'Erreur serveur' });
  }
});

userRoutes.post('/', async (req, res) => {
  try {
    const { email, password, role } = req.body as { email?: string; password?: string; role?: Role };
    if (!email || !password || !role) {
      res.status(400).json({
        status: 'error',
        message: 'email, password et role sont requis',
      });
      return;
    }
    const validRoles: Role[] = ['admin', 'salarie', 'externe'];
    if (!validRoles.includes(role)) {
      res.status(400).json({ status: 'error', message: 'role invalide' });
      return;
    }

    const normalizedEmail = String(email).toLowerCase().trim();

    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: normalizedEmail,
      password: String(password),
      email_confirm: true,
    });

    if (authError) {
      if (authError.message.includes('already been registered')) {
        res.status(409).json({ status: 'error', message: 'Cet email est déjà utilisé' });
        return;
      }
      console.error('Create user auth error:', authError);
      res.status(400).json({ status: 'error', message: authError.message });
      return;
    }

    if (!authData.user) {
      res.status(500).json({ status: 'error', message: 'Utilisateur non créé' });
      return;
    }

    const { error: profileError } = await supabaseAdmin.from('profiles').insert({
      id: authData.user.id,
      email: normalizedEmail,
      role,
    });

    if (profileError) {
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      console.error('Create profile error:', profileError);
      res.status(500).json({ status: 'error', message: 'Erreur lors de la création du profil' });
      return;
    }

    res.status(201).json({
      status: 'success',
      user: {
        id: authData.user.id,
        email: normalizedEmail,
        role,
      },
    });
  } catch (err) {
    console.error('Create user error:', err);
    res.status(500).json({ status: 'error', message: 'Erreur serveur' });
  }
});

userRoutes.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { role } = req.body as { role?: Role };
    if (!role) {
      res.status(400).json({ status: 'error', message: 'role requis' });
      return;
    }
    const validRoles: Role[] = ['admin', 'salarie', 'externe'];
    if (!validRoles.includes(role)) {
      res.status(400).json({ status: 'error', message: 'role invalide' });
      return;
    }

    const { data, error } = await supabaseAdmin
      .from('profiles')
      .update({ role, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('id, email, role, updated_at')
      .single();

    if (error) {
      console.error('Update user error:', error);
      res.status(500).json({ status: 'error', message: 'Erreur lors de la mise à jour' });
      return;
    }

    if (!data) {
      res.status(404).json({ status: 'error', message: 'Utilisateur introuvable' });
      return;
    }

    res.json({ status: 'success', user: data });
  } catch (err) {
    console.error('Update user error:', err);
    res.status(500).json({ status: 'error', message: 'Erreur serveur' });
  }
});

userRoutes.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const reqUser = (req as Request).user;
    if (reqUser && reqUser.id === id) {
      res.status(400).json({ status: 'error', message: 'Vous ne pouvez pas supprimer votre propre compte' });
      return;
    }

    const { error: deleteAuthError } = await supabaseAdmin.auth.admin.deleteUser(id);

    if (deleteAuthError) {
      console.error('Delete user error:', deleteAuthError);
      res.status(500).json({ status: 'error', message: 'Erreur lors de la suppression' });
      return;
    }

    res.json({ status: 'success', message: 'Utilisateur supprimé' });
  } catch (err) {
    console.error('Delete user error:', err);
    res.status(500).json({ status: 'error', message: 'Erreur serveur' });
  }
});
