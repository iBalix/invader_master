-- Fix RLS pour les tables tactiles V2 (migration 018)
--
-- CONTEXTE :
--   La migration 018 active RLS sur les nouvelles tables sans creer de policies.
--   En theorie, le backend (qui utilise SUPABASE_SERVICE_ROLE_KEY) bypass RLS.
--   Mais on observe une erreur 42501 ("new row violates row-level security policy")
--   sur table_screensaver_featured a l'INSERT depuis le back-office.
--
-- CAUSES POSSIBLES :
--   1. La table a FORCE ROW LEVEL SECURITY active (force meme service_role a
--      respecter les policies).
--   2. Une policy ajoutee manuellement depuis le dashboard bloque l'INSERT.
--   3. Le client supabase utilise par erreur l'anon key au lieu de service_role.
--
-- CE SCRIPT :
--   - Desactive FORCE RLS (au cas ou)
--   - DROP les policies existantes (cleanup)
--   - Cree une policy explicite "service_role full access" (ceinture + bretelles)
--   - Cree des policies SELECT public pour anon/authenticated sur les rows actifs
--     (utile si un jour on tape Supabase directement depuis le front).
--
-- A executer dans le SQL Editor du dashboard Supabase.

-- ============================================================
-- Helper : applique le pattern "service_role + read public" sur une table
-- ============================================================

-- ---------- table_screensaver_featured ----------
ALTER TABLE public.table_screensaver_featured ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.table_screensaver_featured NO FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role full access" ON public.table_screensaver_featured;
DROP POLICY IF EXISTS "anon read active" ON public.table_screensaver_featured;
DROP POLICY IF EXISTS "authenticated read active" ON public.table_screensaver_featured;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.table_screensaver_featured;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON public.table_screensaver_featured;

CREATE POLICY "service_role full access"
  ON public.table_screensaver_featured
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "anon read active"
  ON public.table_screensaver_featured
  FOR SELECT TO anon
  USING (active = true);

CREATE POLICY "authenticated read active"
  ON public.table_screensaver_featured
  FOR SELECT TO authenticated
  USING (true);

-- ---------- table_home_featured ----------
ALTER TABLE public.table_home_featured ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.table_home_featured NO FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role full access" ON public.table_home_featured;
DROP POLICY IF EXISTS "anon read active" ON public.table_home_featured;
DROP POLICY IF EXISTS "authenticated read active" ON public.table_home_featured;

CREATE POLICY "service_role full access"
  ON public.table_home_featured
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "anon read active"
  ON public.table_home_featured
  FOR SELECT TO anon
  USING (active = true);

CREATE POLICY "authenticated read active"
  ON public.table_home_featured
  FOR SELECT TO authenticated
  USING (true);

-- ---------- live_event_state ----------
ALTER TABLE public.live_event_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_event_state NO FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role full access" ON public.live_event_state;
DROP POLICY IF EXISTS "anon read" ON public.live_event_state;
DROP POLICY IF EXISTS "authenticated read" ON public.live_event_state;

CREATE POLICY "service_role full access"
  ON public.live_event_state
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "anon read"
  ON public.live_event_state
  FOR SELECT TO anon
  USING (true);

CREATE POLICY "authenticated read"
  ON public.live_event_state
  FOR SELECT TO authenticated
  USING (true);

-- ---------- table_devices ----------
ALTER TABLE public.table_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.table_devices NO FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role full access" ON public.table_devices;
DROP POLICY IF EXISTS "authenticated read" ON public.table_devices;

CREATE POLICY "service_role full access"
  ON public.table_devices
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "authenticated read"
  ON public.table_devices
  FOR SELECT TO authenticated
  USING (true);

-- ---------- coupons ----------
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupons NO FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role full access" ON public.coupons;
DROP POLICY IF EXISTS "authenticated read" ON public.coupons;

CREATE POLICY "service_role full access"
  ON public.coupons
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "authenticated read"
  ON public.coupons
  FOR SELECT TO authenticated
  USING (true);

-- ---------- table_orders ----------
ALTER TABLE public.table_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.table_orders NO FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role full access" ON public.table_orders;
DROP POLICY IF EXISTS "authenticated read" ON public.table_orders;

CREATE POLICY "service_role full access"
  ON public.table_orders
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "authenticated read"
  ON public.table_orders
  FOR SELECT TO authenticated
  USING (true);

-- ---------- table_order_items ----------
ALTER TABLE public.table_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.table_order_items NO FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role full access" ON public.table_order_items;
DROP POLICY IF EXISTS "authenticated read" ON public.table_order_items;

CREATE POLICY "service_role full access"
  ON public.table_order_items
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "authenticated read"
  ON public.table_order_items
  FOR SELECT TO authenticated
  USING (true);

-- ============================================================
-- Verification : doit retourner 1 row par table tactile,
-- avec rowsecurity = true et forcerowsecurity = false
-- ============================================================
SELECT
  schemaname,
  tablename,
  rowsecurity,
  forcerowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'table_screensaver_featured',
    'table_home_featured',
    'live_event_state',
    'table_devices',
    'coupons',
    'table_orders',
    'table_order_items'
  )
ORDER BY tablename;

-- Liste des policies appliquees
SELECT
  schemaname,
  tablename,
  policyname,
  roles,
  cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'table_screensaver_featured',
    'table_home_featured',
    'live_event_state',
    'table_devices',
    'coupons',
    'table_orders',
    'table_order_items'
  )
ORDER BY tablename, policyname;
