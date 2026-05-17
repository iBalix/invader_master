-- Migration 022 : Carte v2 — schema (categories_v2, products_v2, junction, conditionings, variants)
--
-- CONTEXTE :
--   Nouvelle carte parallele a la v1 (menu_categories / menu_products / category_products).
--   Permet de gerer :
--     - icone Lucide et couleur par categorie
--     - conditionnements multiples par produit (33cl / 50cl / bouteille / verre...)
--     - variantes informatives/selectionnables par produit (parfums, gouts...)
--   La v1 reste intacte. Switch des tables tactiles -> v2 fait en M4.
--   Cleanup / remplacement de la v1 deferre au M6 quand v2 valide en prod.
--
-- RLS : voir migration-023-carte-v2-rls.sql. Sans policies, le backend voit 0 ligne (cf. CLAUDE.md §4.3).

-- ============================================================
-- Table menu_categories_v2
-- ============================================================
CREATE TABLE IF NOT EXISTS public.menu_categories_v2 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  name_en TEXT,
  parent_id UUID REFERENCES public.menu_categories_v2(id) ON DELETE SET NULL,
  is_main_category BOOLEAN NOT NULL DEFAULT false,
  weight INTEGER NOT NULL DEFAULT 0,
  icon_name TEXT,
  color TEXT CHECK (color IS NULL OR color ~ '^#[0-9A-Fa-f]{6}$'),
  contentful_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_menu_categories_v2_parent ON public.menu_categories_v2(parent_id);
CREATE INDEX IF NOT EXISTS idx_menu_categories_v2_contentful ON public.menu_categories_v2(contentful_id) WHERE contentful_id IS NOT NULL;

DROP TRIGGER IF EXISTS menu_categories_v2_updated_at ON public.menu_categories_v2;
CREATE TRIGGER menu_categories_v2_updated_at
  BEFORE UPDATE ON public.menu_categories_v2
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE public.menu_categories_v2 ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- Table menu_products_v2
-- ============================================================
CREATE TABLE IF NOT EXISTS public.menu_products_v2 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  name_en TEXT,
  description TEXT,
  description_en TEXT,
  subtitle TEXT,
  subtitle_en TEXT,
  price NUMERIC(10,2) NOT NULL,
  price_hh NUMERIC(10,2),
  price_second NUMERIC(10,2),
  icon_url TEXT,
  image_url TEXT,
  video_url TEXT,
  display_order INTEGER NOT NULL DEFAULT 100,
  contentful_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_menu_products_v2_contentful ON public.menu_products_v2(contentful_id) WHERE contentful_id IS NOT NULL;

DROP TRIGGER IF EXISTS menu_products_v2_updated_at ON public.menu_products_v2;
CREATE TRIGGER menu_products_v2_updated_at
  BEFORE UPDATE ON public.menu_products_v2
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE public.menu_products_v2 ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- Table de jonction categorie <-> produits (ordonnee)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.category_products_v2 (
  category_id UUID NOT NULL REFERENCES public.menu_categories_v2(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.menu_products_v2(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (category_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_category_products_v2_cat ON public.category_products_v2(category_id);
CREATE INDEX IF NOT EXISTS idx_category_products_v2_prod ON public.category_products_v2(product_id);

ALTER TABLE public.category_products_v2 ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- Table conditionnements (33cl, 50cl, bouteille...)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.product_v2_conditionings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.menu_products_v2(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  label_en TEXT,
  price NUMERIC(10,2) NOT NULL,
  price_hh NUMERIC(10,2),
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_product_v2_conditionings_product ON public.product_v2_conditionings(product_id);

DROP TRIGGER IF EXISTS product_v2_conditionings_updated_at ON public.product_v2_conditionings;
CREATE TRIGGER product_v2_conditionings_updated_at
  BEFORE UPDATE ON public.product_v2_conditionings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE public.product_v2_conditionings ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- Table variantes (parfums, gouts...)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.product_v2_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.menu_products_v2(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  label_en TEXT,
  color TEXT CHECK (color IS NULL OR color ~ '^#[0-9A-Fa-f]{6}$'),
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_product_v2_variants_product ON public.product_v2_variants(product_id);

DROP TRIGGER IF EXISTS product_v2_variants_updated_at ON public.product_v2_variants;
CREATE TRIGGER product_v2_variants_updated_at
  BEFORE UPDATE ON public.product_v2_variants
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE public.product_v2_variants ENABLE ROW LEVEL SECURITY;
