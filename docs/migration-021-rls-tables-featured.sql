-- Migration 021 : RLS policies sur table_home_featured + table_screensaver_featured
--
-- CONTEXTE :
--   Les tables table_home_featured et table_screensaver_featured (migration 018)
--   ont RLS active mais aucune policy. Resultat : "deny by default" pour tous
--   les roles sauf superuser.
--
--   Le backend tape Supabase via PostgREST avec la SUPABASE_SERVICE_ROLE_KEY.
--   PostgREST se connecte en "authenticator" puis fait SET LOCAL ROLE service_role
--   par requete. Dans ce mode, l'attribut BYPASSRLS du role service_role n'est
--   pas applique => les SELECT/INSERT renvoient 0 ligne / RLS violation 42501.
--
--   On observait :
--     - SET ROLE service_role; SELECT count(*) FROM table_home_featured  -> 3 (OK)
--     - Backend (via PostgREST + JWT service_role) GET /api/table-home-featured -> 0
--
-- FIX :
--   Creer des policies explicites pour service_role (ALL), anon (SELECT actifs)
--   et authenticated (SELECT all). Idempotent.

ALTER TABLE public.table_home_featured        NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.table_screensaver_featured NO FORCE ROW LEVEL SECURITY;

-- Cleanup d'eventuelles policies existantes (re-run safe)
DROP POLICY IF EXISTS "service_role full access" ON public.table_home_featured;
DROP POLICY IF EXISTS "service_role full access" ON public.table_screensaver_featured;
DROP POLICY IF EXISTS "anon read active"         ON public.table_home_featured;
DROP POLICY IF EXISTS "anon read active"         ON public.table_screensaver_featured;
DROP POLICY IF EXISTS "authenticated read"       ON public.table_home_featured;
DROP POLICY IF EXISTS "authenticated read"       ON public.table_screensaver_featured;

-- Backend (service_role) : full access
CREATE POLICY "service_role full access"
  ON public.table_home_featured
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "service_role full access"
  ON public.table_screensaver_featured
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Tables tactiles si on tape Supabase directement en anon : SELECT actifs uniquement
CREATE POLICY "anon read active"
  ON public.table_home_featured
  FOR SELECT TO anon
  USING (active = true);

CREATE POLICY "anon read active"
  ON public.table_screensaver_featured
  FOR SELECT TO anon
  USING (active = true);

-- Authenticated : SELECT all (back-office user logge)
CREATE POLICY "authenticated read"
  ON public.table_home_featured
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "authenticated read"
  ON public.table_screensaver_featured
  FOR SELECT TO authenticated
  USING (true);
