-- Migration 030 : Patch — ajoute cover_url sur games_v2 (oubli dans 027) + backfill depuis v1
ALTER TABLE public.games_v2 ADD COLUMN IF NOT EXISTS cover_url TEXT;

UPDATE public.games_v2 v2
SET cover_url = v1.cover_url
FROM public.games v1
WHERE v2.id = v1.id AND v2.cover_url IS NULL AND v1.cover_url IS NOT NULL;
