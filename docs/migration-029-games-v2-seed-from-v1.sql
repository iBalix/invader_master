-- Migration 029 : Seed Games v2 a partir des Games v1 (one-shot, ne PAS reappliquer apres modifs v2)
--
-- CONTEXTE :
--   Copie game_consoles / game_categories / games / game_images / game_category_games
--   dans leurs jumeaux _v2. UUIDs preserves pour tracer le lien.
--
--   Cleanup applique pendant la copie :
--   - Exclut les categories "Nos preferes" et "4 joueurs"
--   - Backfill max_players=4 pour les jeux qui etaient lies a la categorie "4 joueurs"
--
--   Une fois les bornes branchees sur v2, NE PAS reappliquer cette migration sous peine
--   d'ecraser les modifs v2 (en pratique ON CONFLICT DO NOTHING protege, mais soyez vigilant).

BEGIN;

-- 1. Consoles
INSERT INTO public.game_consoles_v2 (id, name, library, logo_url, contentful_id, created_at, updated_at)
SELECT id, name, library, logo_url, contentful_id, created_at, updated_at
FROM public.game_consoles
ON CONFLICT (id) DO NOTHING;

-- 2. Categories (sauf "Nos preferes" et "4 joueurs")
INSERT INTO public.game_categories_v2 (id, name, name_en, display_order, contentful_id, created_at, updated_at)
SELECT id, name, NULLIF(name_en, ''), display_order, contentful_id, created_at, updated_at
FROM public.game_categories
WHERE NOT (name ILIKE '%préf%' OR name ILIKE '%prefer%' OR name ILIKE '%4 joueur%')
ON CONFLICT (id) DO NOTHING;

-- 3. Games avec backfill max_players=4 pour les ex-"4 joueurs"
WITH four_player_games AS (
  SELECT DISTINCT gcg.game_id
  FROM public.game_category_games gcg
  JOIN public.game_categories gc ON gc.id = gcg.category_id
  WHERE gc.name ILIKE '%4 joueur%'
)
INSERT INTO public.games_v2 (
  id, name, name_en, subtitle, subtitle_en, description, description_en,
  file_name, console_id, platform, competition, competition_link, display_order,
  max_players, contentful_id, created_at, updated_at
)
SELECT
  g.id, g.name, NULLIF(g.name_en, ''), g.subtitle, NULLIF(g.subtitle_en, ''),
  g.description, NULLIF(g.description_en, ''),
  g.file_name, g.console_id, g.platform, g.competition, g.competition_link, g.display_order,
  CASE WHEN g.id IN (SELECT game_id FROM four_player_games) THEN 4 ELSE 1 END,
  g.contentful_id, g.created_at, g.updated_at
FROM public.games g
ON CONFLICT (id) DO NOTHING;

-- 4. Images
INSERT INTO public.game_images_v2 (id, game_id, image_url, position)
SELECT id, game_id, image_url, position
FROM public.game_images
ON CONFLICT (id) DO NOTHING;

-- 5. Jonction (sauf liens vers categories filtrees)
INSERT INTO public.game_category_games_v2 (category_id, game_id)
SELECT gcg.category_id, gcg.game_id
FROM public.game_category_games gcg
WHERE EXISTS (SELECT 1 FROM public.game_categories_v2 c2 WHERE c2.id = gcg.category_id)
ON CONFLICT (category_id, game_id) DO NOTHING;

COMMIT;
