-- Migration 024 : table carte_settings (singleton, parametres globaux de la carte)
--
-- CONTEXTE :
--   Centralise les parametres globaux du module carte :
--     - happy_hour_start / happy_hour_end / happy_hour_days
--     - ordering_enabled : toggle module commande pour tables tactiles
--     - google_review_url : CTA affiche en bas de la carte quand commande off
--
--   Remplace l'ancienne logique hardcodee dans MenuPage.tsx (window HH lun-ven 17h30-19h
--   en dur, detection categorie HH par nom).
--
-- SINGLETON :
--   Une seule row. Le backend tape un select limit(1).single() puis update sur cette row.

CREATE TABLE IF NOT EXISTS public.carte_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  happy_hour_start TIME NOT NULL DEFAULT '17:30',
  happy_hour_end TIME NOT NULL DEFAULT '19:00',
  happy_hour_days TEXT[] NOT NULL DEFAULT ARRAY['mon','tue','wed','thu','fri'],
  ordering_enabled BOOLEAN NOT NULL DEFAULT true,
  google_review_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CHECK (happy_hour_end > happy_hour_start),
  CHECK (happy_hour_days <@ ARRAY['mon','tue','wed','thu','fri','sat','sun'])
);

DROP TRIGGER IF EXISTS carte_settings_updated_at ON public.carte_settings;
CREATE TRIGGER carte_settings_updated_at
  BEFORE UPDATE ON public.carte_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE public.carte_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.carte_settings NO FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role full access" ON public.carte_settings;
CREATE POLICY "service_role full access" ON public.carte_settings
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon read" ON public.carte_settings;
CREATE POLICY "anon read" ON public.carte_settings
  FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "authenticated read" ON public.carte_settings;
CREATE POLICY "authenticated read" ON public.carte_settings
  FOR SELECT TO authenticated USING (true);

-- Seed initial : insert une row par defaut si la table est vide.
INSERT INTO public.carte_settings (id)
SELECT gen_random_uuid()
WHERE NOT EXISTS (SELECT 1 FROM public.carte_settings);
