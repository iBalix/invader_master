-- Migration 005: Tables menu_categories, menu_products, category_products
-- À exécuter dans le SQL Editor du dashboard Supabase

-- ============================================================
-- Table menu_categories
-- ============================================================
CREATE TABLE IF NOT EXISTS public.menu_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  parent_id UUID REFERENCES public.menu_categories(id) ON DELETE SET NULL,
  is_main_category BOOLEAN NOT NULL DEFAULT false,
  weight INTEGER NOT NULL DEFAULT 0,
  begin_hour TEXT,
  end_hour TEXT,
  contentful_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_menu_categories_parent ON public.menu_categories(parent_id);
CREATE INDEX IF NOT EXISTS idx_menu_categories_contentful ON public.menu_categories(contentful_id) WHERE contentful_id IS NOT NULL;

DROP TRIGGER IF EXISTS menu_categories_updated_at ON public.menu_categories;
CREATE TRIGGER menu_categories_updated_at
  BEFORE UPDATE ON public.menu_categories
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE public.menu_categories ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- Table menu_products
-- ============================================================
CREATE TABLE IF NOT EXISTS public.menu_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  subtitle TEXT,
  price NUMERIC(10,2) NOT NULL,
  price_hh NUMERIC(10,2),
  price_second NUMERIC(10,2),
  icon_url TEXT,
  image_url TEXT,
  display_order INTEGER NOT NULL DEFAULT 100,
  contentful_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_menu_products_contentful ON public.menu_products(contentful_id) WHERE contentful_id IS NOT NULL;

DROP TRIGGER IF EXISTS menu_products_updated_at ON public.menu_products;
CREATE TRIGGER menu_products_updated_at
  BEFORE UPDATE ON public.menu_products
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE public.menu_products ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- Table de jonction categorie <-> produits (ordonnée)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.category_products (
  category_id UUID NOT NULL REFERENCES public.menu_categories(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.menu_products(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (category_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_category_products_cat ON public.category_products(category_id);
CREATE INDEX IF NOT EXISTS idx_category_products_prod ON public.category_products(product_id);

ALTER TABLE public.category_products ENABLE ROW LEVEL SECURITY;
