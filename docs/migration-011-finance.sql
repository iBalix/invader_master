-- Migration 011: Tables sales et flux (finance imports Popina / Tiime)
-- À exécuter dans le SQL Editor du dashboard Supabase

-- ============================================================
-- Table sales (ventes Popina)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.sales (
  id TEXT PRIMARY KEY,
  date TIMESTAMPTZ NOT NULL,
  salle TEXT DEFAULT '',
  table_number TEXT DEFAULT '',
  parent TEXT DEFAULT '',
  cat TEXT DEFAULT '',
  name TEXT NOT NULL,
  unit TEXT DEFAULT '',
  tier TEXT DEFAULT '',
  tax NUMERIC DEFAULT 0,
  quantity NUMERIC DEFAULT 0,
  brut NUMERIC DEFAULT 0,
  discount NUMERIC DEFAULT 0,
  net NUMERIC DEFAULT 0,
  tva NUMERIC DEFAULT 0,
  ht NUMERIC DEFAULT 0,
  ticket TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sales_date ON public.sales(date);
CREATE INDEX IF NOT EXISTS idx_sales_ticket ON public.sales(ticket);
CREATE INDEX IF NOT EXISTS idx_sales_name ON public.sales(name);

ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sales_read_authenticated" ON public.sales
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "sales_insert_authenticated" ON public.sales
  FOR INSERT TO authenticated WITH CHECK (true);

-- ============================================================
-- Table flux (transactions bancaires Tiime)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.flux (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  designation TEXT NOT NULL,
  amount NUMERIC NOT NULL DEFAULT 0,
  label TEXT,
  category TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_flux_date ON public.flux(date);
CREATE INDEX IF NOT EXISTS idx_flux_label ON public.flux(label);
CREATE INDEX IF NOT EXISTS idx_flux_date_designation ON public.flux(date, designation);

DROP TRIGGER IF EXISTS flux_updated_at ON public.flux;
CREATE TRIGGER flux_updated_at
  BEFORE UPDATE ON public.flux
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE public.flux ENABLE ROW LEVEL SECURITY;

CREATE POLICY "flux_read_authenticated" ON public.flux
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "flux_insert_authenticated" ON public.flux
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "flux_update_authenticated" ON public.flux
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
