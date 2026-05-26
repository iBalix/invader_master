-- Migration 028 : RLS policies sur les 5 tables Games v2
--
-- CONTEXTE :
--   Migration 027 cree les tables avec ENABLE ROW LEVEL SECURITY mais sans
--   policy => deny by default (cf. CLAUDE.md §4.3).
--
-- POLICIES (idempotentes) :
--   - service_role : FOR ALL (read + write).
--   - anon         : FOR SELECT (bornes tactiles).
--   - authenticated: FOR SELECT (back-office user logge).

ALTER TABLE public.game_categories_v2      NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.game_consoles_v2        NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.games_v2                NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.game_images_v2          NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.game_category_games_v2  NO FORCE ROW LEVEL SECURITY;

-- service_role full access
DROP POLICY IF EXISTS "service_role full access" ON public.game_categories_v2;
DROP POLICY IF EXISTS "service_role full access" ON public.game_consoles_v2;
DROP POLICY IF EXISTS "service_role full access" ON public.games_v2;
DROP POLICY IF EXISTS "service_role full access" ON public.game_images_v2;
DROP POLICY IF EXISTS "service_role full access" ON public.game_category_games_v2;

CREATE POLICY "service_role full access" ON public.game_categories_v2     FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role full access" ON public.game_consoles_v2       FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role full access" ON public.games_v2               FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role full access" ON public.game_images_v2         FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role full access" ON public.game_category_games_v2 FOR ALL TO service_role USING (true) WITH CHECK (true);

-- anon read (bornes tactiles publiques)
DROP POLICY IF EXISTS "anon read" ON public.game_categories_v2;
DROP POLICY IF EXISTS "anon read" ON public.game_consoles_v2;
DROP POLICY IF EXISTS "anon read" ON public.games_v2;
DROP POLICY IF EXISTS "anon read" ON public.game_images_v2;
DROP POLICY IF EXISTS "anon read" ON public.game_category_games_v2;

CREATE POLICY "anon read" ON public.game_categories_v2     FOR SELECT TO anon USING (true);
CREATE POLICY "anon read" ON public.game_consoles_v2       FOR SELECT TO anon USING (true);
CREATE POLICY "anon read" ON public.games_v2               FOR SELECT TO anon USING (true);
CREATE POLICY "anon read" ON public.game_images_v2         FOR SELECT TO anon USING (true);
CREATE POLICY "anon read" ON public.game_category_games_v2 FOR SELECT TO anon USING (true);

-- authenticated read (back-office user JWT supabase)
DROP POLICY IF EXISTS "authenticated read" ON public.game_categories_v2;
DROP POLICY IF EXISTS "authenticated read" ON public.game_consoles_v2;
DROP POLICY IF EXISTS "authenticated read" ON public.games_v2;
DROP POLICY IF EXISTS "authenticated read" ON public.game_images_v2;
DROP POLICY IF EXISTS "authenticated read" ON public.game_category_games_v2;

CREATE POLICY "authenticated read" ON public.game_categories_v2     FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated read" ON public.game_consoles_v2       FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated read" ON public.games_v2               FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated read" ON public.game_images_v2         FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated read" ON public.game_category_games_v2 FOR SELECT TO authenticated USING (true);
