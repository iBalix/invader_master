-- Migration 025 : Seed Carte v2 a partir de la Carte v1 (one-shot, ne PAS reappliquer apres modifs v2)
--
-- CONTEXTE :
--   Copie l'integralite de menu_categories / menu_products / category_products
--   dans leurs jumeaux _v2. UUIDs preserves pour tracer le lien et rendre la
--   migration idempotente (ON CONFLICT DO NOTHING).
--
--   Une fois les bornes branchees sur v2, toute modif faite cote v2 ne doit pas
--   etre ecrasee : NE PAS reappliquer cette migration. Si besoin de re-seed,
--   TRUNCATE manuellement les tables _v2 d'abord.
--
--   Les colonnes icon_name, color (categories_v2) restent NULL.
--   Les conditionnements / variants ne sont pas seedes (champs nouveaux v2).

BEGIN;

-- ============================================================
-- Categories v2
-- ============================================================
INSERT INTO public.menu_categories_v2 (
  id, name, name_en, parent_id, is_main_category, weight, contentful_id, created_at, updated_at
)
SELECT
  id,
  name,
  NULLIF(name_en, ''),
  parent_id,
  is_main_category,
  weight,
  contentful_id,
  created_at,
  updated_at
FROM public.menu_categories
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- Produits v2
-- ============================================================
INSERT INTO public.menu_products_v2 (
  id, name, name_en, description, description_en, subtitle, subtitle_en,
  price, price_hh, price_second, icon_url, image_url, video_url,
  display_order, contentful_id, created_at, updated_at
)
SELECT
  id, name, NULLIF(name_en, ''),
  description, NULLIF(description_en, ''),
  subtitle, NULLIF(subtitle_en, ''),
  price, price_hh, price_second, icon_url, image_url, video_url,
  display_order, contentful_id, created_at, updated_at
FROM public.menu_products
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- Liens categorie <-> produit (jonction)
-- ============================================================
INSERT INTO public.category_products_v2 (category_id, product_id, position)
SELECT category_id, product_id, position
FROM public.category_products
ON CONFLICT (category_id, product_id) DO NOTHING;

COMMIT;
