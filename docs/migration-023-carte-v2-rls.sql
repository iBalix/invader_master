-- Migration 023 : RLS policies sur les 5 tables Carte v2
--
-- CONTEXTE :
--   Migration 022 cree les tables avec ENABLE ROW LEVEL SECURITY mais sans
--   policy => deny by default pour tous les roles (cf. CLAUDE.md §4.3).
--   PostgREST + service_role n'active PAS BYPASSRLS, donc le backend lit 0 ligne
--   tant que les policies service_role explicites ne sont pas creees.
--
-- POLICIES (idempotentes) :
--   - service_role : FOR ALL (read + write).
--   - anon         : FOR SELECT (tables tactiles accessibles publiquement).
--   - authenticated: FOR SELECT (back-office user logge en JWT supabase).

ALTER TABLE public.menu_categories_v2       NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.menu_products_v2         NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.category_products_v2     NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.product_v2_conditionings NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.product_v2_variants      NO FORCE ROW LEVEL SECURITY;

-- ============================================================
-- service_role : full access (idempotent)
-- ============================================================
DROP POLICY IF EXISTS "service_role full access" ON public.menu_categories_v2;
DROP POLICY IF EXISTS "service_role full access" ON public.menu_products_v2;
DROP POLICY IF EXISTS "service_role full access" ON public.category_products_v2;
DROP POLICY IF EXISTS "service_role full access" ON public.product_v2_conditionings;
DROP POLICY IF EXISTS "service_role full access" ON public.product_v2_variants;

CREATE POLICY "service_role full access" ON public.menu_categories_v2
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role full access" ON public.menu_products_v2
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role full access" ON public.category_products_v2
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role full access" ON public.product_v2_conditionings
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role full access" ON public.product_v2_variants
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- anon : SELECT (lecture publique pour tables tactiles)
-- ============================================================
DROP POLICY IF EXISTS "anon read" ON public.menu_categories_v2;
DROP POLICY IF EXISTS "anon read" ON public.menu_products_v2;
DROP POLICY IF EXISTS "anon read" ON public.category_products_v2;
DROP POLICY IF EXISTS "anon read" ON public.product_v2_conditionings;
DROP POLICY IF EXISTS "anon read" ON public.product_v2_variants;

CREATE POLICY "anon read" ON public.menu_categories_v2       FOR SELECT TO anon USING (true);
CREATE POLICY "anon read" ON public.menu_products_v2         FOR SELECT TO anon USING (true);
CREATE POLICY "anon read" ON public.category_products_v2     FOR SELECT TO anon USING (true);
CREATE POLICY "anon read" ON public.product_v2_conditionings FOR SELECT TO anon USING (true);
CREATE POLICY "anon read" ON public.product_v2_variants      FOR SELECT TO anon USING (true);

-- ============================================================
-- authenticated : SELECT (back-office user JWT supabase)
-- ============================================================
DROP POLICY IF EXISTS "authenticated read" ON public.menu_categories_v2;
DROP POLICY IF EXISTS "authenticated read" ON public.menu_products_v2;
DROP POLICY IF EXISTS "authenticated read" ON public.category_products_v2;
DROP POLICY IF EXISTS "authenticated read" ON public.product_v2_conditionings;
DROP POLICY IF EXISTS "authenticated read" ON public.product_v2_variants;

CREATE POLICY "authenticated read" ON public.menu_categories_v2       FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated read" ON public.menu_products_v2         FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated read" ON public.category_products_v2     FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated read" ON public.product_v2_conditionings FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated read" ON public.product_v2_variants      FOR SELECT TO authenticated USING (true);
