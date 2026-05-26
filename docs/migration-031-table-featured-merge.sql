-- Migration 031 : Fusion des mises en avant + table de reglages globaux tables tactiles
--
-- CONTEXTE :
--   Avant : 2 tables separees (table_home_featured, table_screensaver_featured).
--   Apres : 1 table unique `table_featured` avec 2 booleens d'emplacement
--   (show_on_home, show_on_screensaver) => une mise en avant peut apparaitre
--   sur l'accueil et/ou la veille via des cases a cocher.
--
--   Ajout aussi de `tables_settings` (singleton) pour les reglages globaux :
--   duree avant veille, images des boutons Carte/Jeux de la home.
--
--   Les anciennes tables sont conservees (non droppees) pour rollback ; elles
--   ne sont plus lues par le backend apres cette migration.

-- ============================================================
-- table_featured (fusion)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.table_featured (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  position INTEGER NOT NULL DEFAULT 0,
  title TEXT NOT NULL,
  subtitle TEXT,
  description TEXT,
  image_url TEXT,
  cta_label TEXT,
  cta_target TEXT,
  lottie_url TEXT,
  show_on_home BOOLEAN NOT NULL DEFAULT true,
  show_on_screensaver BOOLEAN NOT NULL DEFAULT false,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_table_featured_position ON public.table_featured(position);

DROP TRIGGER IF EXISTS table_featured_updated_at ON public.table_featured;
CREATE TRIGGER table_featured_updated_at
  BEFORE UPDATE ON public.table_featured
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE public.table_featured ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.table_featured NO FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role full access" ON public.table_featured;
CREATE POLICY "service_role full access" ON public.table_featured
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon read active" ON public.table_featured;
CREATE POLICY "anon read active" ON public.table_featured
  FOR SELECT TO anon USING (active = true);

DROP POLICY IF EXISTS "authenticated read" ON public.table_featured;
CREATE POLICY "authenticated read" ON public.table_featured
  FOR SELECT TO authenticated USING (true);

-- ============================================================
-- tables_settings (singleton — reglages globaux)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.tables_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  screensaver_timeout_ms INTEGER NOT NULL DEFAULT 90000 CHECK (screensaver_timeout_ms >= 10000),
  menu_button_image_url TEXT,
  games_button_image_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

DROP TRIGGER IF EXISTS tables_settings_updated_at ON public.tables_settings;
CREATE TRIGGER tables_settings_updated_at
  BEFORE UPDATE ON public.tables_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE public.tables_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tables_settings NO FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role full access" ON public.tables_settings;
CREATE POLICY "service_role full access" ON public.tables_settings
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon read" ON public.tables_settings;
CREATE POLICY "anon read" ON public.tables_settings
  FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "authenticated read" ON public.tables_settings;
CREATE POLICY "authenticated read" ON public.tables_settings
  FOR SELECT TO authenticated USING (true);

-- Seed singleton
INSERT INTO public.tables_settings (id)
SELECT gen_random_uuid()
WHERE NOT EXISTS (SELECT 1 FROM public.tables_settings);

-- ============================================================
-- Migration des donnees existantes -> table_featured
-- ============================================================
-- Home featured -> show_on_home=true
INSERT INTO public.table_featured (
  id, position, title, subtitle, description, image_url, cta_label, cta_target,
  lottie_url, show_on_home, show_on_screensaver, active, created_at, updated_at
)
SELECT
  id, position, title, subtitle, description, image_url, cta_label, cta_target,
  NULL, true, false, active, created_at, updated_at
FROM public.table_home_featured
ON CONFLICT (id) DO NOTHING;

-- Screensaver featured -> show_on_screensaver=true
INSERT INTO public.table_featured (
  id, position, title, subtitle, description, image_url, cta_label, cta_target,
  lottie_url, show_on_home, show_on_screensaver, active, created_at, updated_at
)
SELECT
  id, position, title, subtitle, NULL, image_url, NULL, NULL,
  lottie_url, false, true, active, created_at, updated_at
FROM public.table_screensaver_featured
ON CONFLICT (id) DO NOTHING;
