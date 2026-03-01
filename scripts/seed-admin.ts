/**
 * Seed du premier admin : romain.darbas7@gmail.com / admin
 * Usage : npx tsx scripts/seed-admin.ts (depuis la racine du projet)
 */

import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  console.error('Variables SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY requises.');
  process.exit(1);
}

const supabase = createClient(url, serviceRoleKey);

const ADMIN_EMAIL = 'romain.darbas7@gmail.com';
const ADMIN_PASSWORD = 'admin';

async function seed() {
  console.log('Vérification / création de l\'admin...');

  const { data: existing } = await supabase
    .from('profiles')
    .select('id, email, role')
    .eq('email', ADMIN_EMAIL)
    .single();

  if (existing) {
    console.log('Admin déjà présent:', existing.email, '- rôle:', existing.role);
    const { error: updateErr } = await supabase
      .from('profiles')
      .update({ role: 'admin' })
      .eq('id', existing.id);
    if (updateErr) console.error('Erreur mise à jour rôle:', updateErr);
    else console.log('Rôle admin confirmé.');
    return;
  }

  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
    email_confirm: true,
  });

  if (authError) {
    console.error('Erreur création auth:', authError.message);
    process.exit(1);
  }

  if (!authData.user) {
    console.error('Utilisateur non créé');
    process.exit(1);
  }

  const { error: profileError } = await supabase.from('profiles').insert({
    id: authData.user.id,
    email: ADMIN_EMAIL,
    role: 'admin',
  });

  if (profileError) {
    console.error('Erreur création profil:', profileError.message);
    await supabase.auth.admin.deleteUser(authData.user.id);
    process.exit(1);
  }

  console.log('Admin créé avec succès:', ADMIN_EMAIL);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
