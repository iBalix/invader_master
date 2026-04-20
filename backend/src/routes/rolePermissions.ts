import { Router } from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';

export const rolePermissionRoutes = Router();

const ALL_PAGE_KEYS = [
  'dashboard',
  'gestion-bar',
  'contenus/carte',
  'contenus/jeux',
  'contenus/medias',
  'contenus/evenements',
  'contenus/traductions',
  'contenus/quiz',
  'evenements/battle-questions',
  'utilitaires/import-finances',
  'utilitaires/comptabilite',
  'tables-tactiles/devices',
  'tables-tactiles/coupons',
  'tables-tactiles/orders',
  'users',
];

rolePermissionRoutes.use(authMiddleware);

rolePermissionRoutes.get('/', async (_req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('role_permissions')
      .select('role, page_key');

    if (error) throw error;

    const perms: Record<string, string[]> = {
      admin: [...ALL_PAGE_KEYS],
      salarie: [],
      externe: [],
    };

    for (const row of data ?? []) {
      if (row.role !== 'admin' && perms[row.role]) {
        perms[row.role].push(row.page_key);
      }
    }

    res.json({ status: 'success', permissions: perms });
  } catch (err) {
    console.error('Role permissions list error:', err);
    res.status(500).json({ status: 'error', message: 'Erreur serveur' });
  }
});

rolePermissionRoutes.put('/:role', requireRole('admin'), async (req, res) => {
  try {
    const { role } = req.params;

    if (role === 'admin') {
      res.status(400).json({ status: 'error', message: 'Les permissions admin ne sont pas modifiables' });
      return;
    }

    if (!['salarie', 'externe'].includes(role)) {
      res.status(400).json({ status: 'error', message: 'Role invalide' });
      return;
    }

    const { pages } = req.body as { pages?: string[] };
    if (!Array.isArray(pages)) {
      res.status(400).json({ status: 'error', message: 'pages (array) requis' });
      return;
    }

    const validPages = pages.filter((p) => ALL_PAGE_KEYS.includes(p));

    const { error: deleteError } = await supabaseAdmin
      .from('role_permissions')
      .delete()
      .eq('role', role);

    if (deleteError) throw deleteError;

    if (validPages.length > 0) {
      const rows = validPages.map((page_key) => ({ role, page_key }));
      const { error: insertError } = await supabaseAdmin
        .from('role_permissions')
        .insert(rows);

      if (insertError) throw insertError;
    }

    res.json({ status: 'success', pages: validPages });
  } catch (err) {
    console.error('Role permissions update error:', err);
    res.status(500).json({ status: 'error', message: 'Erreur serveur' });
  }
});
