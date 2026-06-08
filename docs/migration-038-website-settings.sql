-- Migration 038 : table website_settings (singleton, parametres du site web public)
--
-- CONTEXTE :
--   Centralise la configuration du site vitrine (invader.bar). Premier usage :
--   les messages du bandeau de haut de page (TopBanner), un par jour de la
--   semaine + un override prioritaire.
--
--   Remplace l'ancienne source Contentful (content type "traductions",
--   champs siteTopBarText*). Le site lit desormais ces valeurs via
--   GET /public/website-settings.
--
-- SINGLETON :
--   Une seule row. Le backend tape un select limit(1).single() puis update sur cette row.

CREATE TABLE IF NOT EXISTS public.website_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  top_banner_monday    TEXT,
  top_banner_tuesday   TEXT,
  top_banner_wednesday TEXT,
  top_banner_thursday  TEXT,
  top_banner_friday    TEXT,
  top_banner_saturday  TEXT,
  top_banner_sunday    TEXT,
  top_banner_override  TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

DROP TRIGGER IF EXISTS website_settings_updated_at ON public.website_settings;
CREATE TRIGGER website_settings_updated_at
  BEFORE UPDATE ON public.website_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE public.website_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.website_settings NO FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role full access" ON public.website_settings;
CREATE POLICY "service_role full access" ON public.website_settings
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon read" ON public.website_settings;
CREATE POLICY "anon read" ON public.website_settings
  FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "authenticated read" ON public.website_settings;
CREATE POLICY "authenticated read" ON public.website_settings
  FOR SELECT TO authenticated USING (true);

-- Seed initial : insert une row par defaut si la table est vide.
INSERT INTO public.website_settings (
  top_banner_monday,
  top_banner_tuesday,
  top_banner_wednesday,
  top_banner_thursday,
  top_banner_friday,
  top_banner_saturday,
  top_banner_sunday,
  top_banner_override
)
SELECT
  '🟢 Ouvert ce soir de 18h à 23h30',
  '🟢 Ouvert ce soir de 18h à 23h30',
  '🟢 Ouvert ce soir de 18h à 23h30',
  '🟢 Ouvert ce soir de 18h à 23h30',
  '🟢 Ouvert ce soir de 18h à 0h30',
  '🟢 Ouvert ce soir de 18h à 0h30',
  '🟢 Ouvert ce soir de 17h30 à 23h',
  NULL
WHERE NOT EXISTS (SELECT 1 FROM public.website_settings);
