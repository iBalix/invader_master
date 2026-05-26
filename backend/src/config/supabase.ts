/**
 * Supabase clients: anon (public) and admin (service role, bypasses RLS)
 */

import { createClient } from '@supabase/supabase-js';

// .trim() : indispensable car les plateformes type Railway ajoutent parfois un
// retour a la ligne / espace en fin de variable. Une cle JWT avec un \n final
// est rejetee par PostgREST -> la requete retombe en role "anon" (RLS non
// bypasse) et les UPDATE sur tables protegees echouent silencieusement (406).
// Nettoie une variable d'env : retire espaces/retours a la ligne en bord + une
// eventuelle paire de guillemets entourant la valeur (collee par erreur).
function cleanEnv(v: string | undefined): string | undefined {
  if (v == null) return v;
  return v.trim().replace(/^(['"])(.*)\1$/s, '$2').trim();
}

const url = cleanEnv(process.env.SUPABASE_URL);
const anonKey = cleanEnv(process.env.SUPABASE_ANON_KEY);
const serviceRoleKey = cleanEnv(process.env.SUPABASE_SERVICE_ROLE_KEY);

if (!url || !anonKey || !serviceRoleKey) {
  throw new Error(
    'Missing Supabase env: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY'
  );
}

// Sanity-check au boot : decode le payload JWT du service_role et verifie que
// le role est bien "service_role". Si l'env contient par erreur l'anon key,
// on log un warning explicite (la cle reste utilisee, mais l'INSERT echouera
// avec "new row violates row-level security policy").
function decodeJwtRole(jwt: string): string | null {
  try {
    const part = jwt.split('.')[1];
    if (!part) return null;
    const json = Buffer.from(part.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    const payload = JSON.parse(json) as { role?: string };
    return payload.role ?? null;
  } catch {
    return null;
  }
}

const detectedRole = decodeJwtRole(serviceRoleKey);
if (detectedRole !== 'service_role') {
  console.warn(
    `[supabase] WARNING: SUPABASE_SERVICE_ROLE_KEY ne semble pas etre une service_role key (role detecte = "${detectedRole ?? 'inconnu'}"). RLS NE SERA PAS BYPASSE et les INSERT/UPDATE echoueront. Recopier la "service_role" key depuis Supabase Dashboard > Project Settings > API.`
  );
} else {
  console.log('[supabase] service_role key OK (RLS bypass actif)');
}

export const supabaseClient = createClient(url, anonKey);
export const supabaseAdmin = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
