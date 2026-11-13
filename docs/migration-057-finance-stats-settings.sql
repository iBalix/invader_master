-- Migration 057 : objectifs de la section Stats (points morts, marge cible)
--
-- CONTEXTE :
--   La section Stats du back-office trace des lignes de reference sur les
--   graphiques de chiffre d'affaires (points morts mensuels) et compare la
--   marge brute a une cible. Ces valeurs etaient codees en dur dans l'ancien
--   rapport Looker Studio ; elles deviennent editables depuis la page
--   Stats > Rentabilite.
--
-- SINGLETON :
--   Une seule ligne (id = 1). Tant que cette migration n'est pas appliquee, le
--   backend sert les valeurs par defaut et refuse l'enregistrement
--   (cf. backend/src/services/statsSettings.ts).
--
-- A executer dans le SQL Editor du dashboard Supabase. Idempotente.

CREATE TABLE IF NOT EXISTS public.finance_stats_settings (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  -- [{ "label": "PM 2026/27", "monthly": 16500 }, ...]
  break_even JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- entre 0 et 1 (0.75 = 75 %)
  gross_margin_target NUMERIC NOT NULL DEFAULT 0.75
    CHECK (gross_margin_target > 0 AND gross_margin_target < 1),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

DROP TRIGGER IF EXISTS finance_stats_settings_updated_at ON public.finance_stats_settings;
CREATE TRIGGER finance_stats_settings_updated_at
  BEFORE UPDATE ON public.finance_stats_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Valeurs reprises du rapport Looker Studio.
INSERT INTO public.finance_stats_settings (id, break_even, gross_margin_target)
VALUES (
  1,
  '[{"label":"PM 2025","monthly":14800},{"label":"PM 2026/27","monthly":16500},{"label":"PM 2028","monthly":17000}]'::jsonb,
  0.75
)
ON CONFLICT (id) DO NOTHING;

-- RLS : donnees financieres, lues et ecrites par le backend uniquement.
-- Sans policy service_role, PostgREST renvoie 0 ligne (cf. CLAUDE.md 4.3).
ALTER TABLE public.finance_stats_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_stats_settings NO FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role full access" ON public.finance_stats_settings;
CREATE POLICY "service_role full access" ON public.finance_stats_settings
  FOR ALL TO service_role USING (true) WITH CHECK (true);
