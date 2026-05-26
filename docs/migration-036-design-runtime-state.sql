-- Stickiness de la config design "effective" quand plusieurs configs sont a
-- egalite de priorite. On memorise le choix (aleatoire) courant + son horodatage
-- pour qu'il reste stable ~15 min, au lieu de re-tirer a chaque refresh de borne.
-- Singleton (une seule ligne, id = true).

CREATE TABLE IF NOT EXISTS public.design_runtime_state (
  id BOOLEAN PRIMARY KEY DEFAULT true,
  current_config_id UUID REFERENCES public.design_configs(id) ON DELETE SET NULL,
  chosen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT design_runtime_state_singleton CHECK (id)
);

INSERT INTO public.design_runtime_state (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.design_runtime_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "design_runtime_state service_role full" ON public.design_runtime_state;
CREATE POLICY "design_runtime_state service_role full"
  ON public.design_runtime_state FOR ALL
  TO service_role USING (true) WITH CHECK (true);
