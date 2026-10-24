-- Migration 054 : suppression des vues de compatibilite *_v2
--
-- A appliquer APRES la migration 053, une fois le backend renomme en ligne sur
-- Railway (plus aucun appel a .from('games_v2') etc.). Les vues ne servaient
-- qu'a couvrir la fenetre du build.
--
-- Idempotent : re-run safe.

DROP VIEW IF EXISTS public.menu_categories_v2;
DROP VIEW IF EXISTS public.menu_products_v2;
DROP VIEW IF EXISTS public.category_products_v2;
DROP VIEW IF EXISTS public.product_v2_conditionings;
DROP VIEW IF EXISTS public.product_v2_variants;
DROP VIEW IF EXISTS public.product_v2_tags;
DROP VIEW IF EXISTS public.product_v2_product_tags;
DROP VIEW IF EXISTS public.game_categories_v2;
DROP VIEW IF EXISTS public.game_consoles_v2;
DROP VIEW IF EXISTS public.games_v2;
DROP VIEW IF EXISTS public.game_images_v2;
DROP VIEW IF EXISTS public.game_category_games_v2;
