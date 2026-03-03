-- Migration 009: Ajout colonnes _en pour internationalisation
-- À exécuter dans le SQL Editor du dashboard Supabase

ALTER TABLE public.menu_categories ADD COLUMN IF NOT EXISTS name_en TEXT DEFAULT '';
ALTER TABLE public.menu_products ADD COLUMN IF NOT EXISTS name_en TEXT DEFAULT '';
ALTER TABLE public.menu_products ADD COLUMN IF NOT EXISTS subtitle_en TEXT DEFAULT '';
ALTER TABLE public.menu_products ADD COLUMN IF NOT EXISTS description_en TEXT DEFAULT '';
ALTER TABLE public.game_categories ADD COLUMN IF NOT EXISTS name_en TEXT DEFAULT '';
ALTER TABLE public.games ADD COLUMN IF NOT EXISTS name_en TEXT DEFAULT '';
ALTER TABLE public.games ADD COLUMN IF NOT EXISTS subtitle_en TEXT DEFAULT '';
ALTER TABLE public.games ADD COLUMN IF NOT EXISTS description_en TEXT DEFAULT '';
