-- Migration 008: Table translations
-- À exécuter dans le SQL Editor du dashboard Supabase

CREATE TABLE IF NOT EXISTS public.translations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  value_fr TEXT NOT NULL DEFAULT '',
  value_en TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

DROP TRIGGER IF EXISTS translations_updated_at ON public.translations;
CREATE TRIGGER translations_updated_at
  BEFORE UPDATE ON public.translations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE public.translations ENABLE ROW LEVEL SECURITY;
