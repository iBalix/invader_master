-- Migration 035 : Configs design des tables tactiles (presets activables + planifies)
--
-- Une "config design" regroupe l'image de fond (home + veille) et les couleurs
-- des boutons Carte / Jeux (utilisees aussi comme accent sur les pages Carte/Jeux).
--
-- Plusieurs configs possibles ; on resout la config "effective" ainsi :
--   - parmi les configs actives, celles dont la planification matche l'instant T
--     (plage de dates OU plage recurrente) sont prioritaires sur les configs
--     'always' (par defaut). Hors plage -> on retombe sur la config 'always'.
--
-- schedule_type :
--   - 'always'     : pas de restriction (config par defaut)
--   - 'date_range' : starts_at <= now <= ends_at
--   - 'recurring'  : jour courant ∈ recurring_days ET heure ∈ [start_time, end_time]

CREATE TABLE IF NOT EXISTS public.design_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  background_image_url TEXT,
  menu_button_color TEXT NOT NULL DEFAULT '#7b2bff' CHECK (menu_button_color ~ '^#[0-9A-Fa-f]{6}$'),
  games_button_color TEXT NOT NULL DEFAULT '#ff2bd6' CHECK (games_button_color ~ '^#[0-9A-Fa-f]{6}$'),
  active BOOLEAN NOT NULL DEFAULT false,
  schedule_type TEXT NOT NULL DEFAULT 'always' CHECK (schedule_type IN ('always', 'date_range', 'recurring')),
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  recurring_days TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[]
    CHECK (recurring_days <@ ARRAY['mon','tue','wed','thu','fri','sat','sun']),
  start_time TIME,
  end_time TIME,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

DROP TRIGGER IF EXISTS design_configs_updated_at ON public.design_configs;
CREATE TRIGGER design_configs_updated_at
  BEFORE UPDATE ON public.design_configs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE public.design_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.design_configs NO FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role full access" ON public.design_configs;
CREATE POLICY "service_role full access" ON public.design_configs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon read" ON public.design_configs;
CREATE POLICY "anon read" ON public.design_configs
  FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "authenticated read" ON public.design_configs;
CREATE POLICY "authenticated read" ON public.design_configs
  FOR SELECT TO authenticated USING (true);

-- Seed : config "Standard" active, couleurs reprises des reglages actuels
INSERT INTO public.design_configs (name, background_image_url, menu_button_color, games_button_color, active, schedule_type)
SELECT 'Standard', NULL,
  COALESCE((SELECT menu_button_color FROM public.tables_settings LIMIT 1), '#7b2bff'),
  COALESCE((SELECT games_button_color FROM public.tables_settings LIMIT 1), '#ff2bd6'),
  true, 'always'
WHERE NOT EXISTS (SELECT 1 FROM public.design_configs);
