-- Migration 026 : Tags catalogue + jonction produit_v2 <-> tag
--
-- CONTEXTE :
--   Les "tags" sont des labels reutilisables partages entre plusieurs produits
--   (ex: "Fait maison", "Bio", "Sans alcool", "Vegan"...). Contrairement aux
--   conditionnements et variantes qui sont owned par un produit, les tags
--   forment un catalogue partage.
--
--   Affichage cible : pastille/chip mis en avant sur la ligne produit cote
--   tables tactiles + chip dans le tableau produits du back-office.

-- ============================================================
-- Catalogue de tags
-- ============================================================
CREATE TABLE IF NOT EXISTS public.product_v2_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  name_en TEXT,
  color TEXT CHECK (color IS NULL OR color ~ '^#[0-9A-Fa-f]{6}$'),
  icon_name TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_product_v2_tags_position ON public.product_v2_tags(position);

DROP TRIGGER IF EXISTS product_v2_tags_updated_at ON public.product_v2_tags;
CREATE TRIGGER product_v2_tags_updated_at
  BEFORE UPDATE ON public.product_v2_tags
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE public.product_v2_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_v2_tags NO FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role full access" ON public.product_v2_tags;
CREATE POLICY "service_role full access" ON public.product_v2_tags
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon read" ON public.product_v2_tags;
CREATE POLICY "anon read" ON public.product_v2_tags
  FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "authenticated read" ON public.product_v2_tags;
CREATE POLICY "authenticated read" ON public.product_v2_tags
  FOR SELECT TO authenticated USING (true);

-- ============================================================
-- Jonction produit <-> tag
-- ============================================================
CREATE TABLE IF NOT EXISTS public.product_v2_product_tags (
  product_id UUID NOT NULL REFERENCES public.menu_products_v2(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES public.product_v2_tags(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (product_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_product_v2_product_tags_product ON public.product_v2_product_tags(product_id);
CREATE INDEX IF NOT EXISTS idx_product_v2_product_tags_tag ON public.product_v2_product_tags(tag_id);

ALTER TABLE public.product_v2_product_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_v2_product_tags NO FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role full access" ON public.product_v2_product_tags;
CREATE POLICY "service_role full access" ON public.product_v2_product_tags
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon read" ON public.product_v2_product_tags;
CREATE POLICY "anon read" ON public.product_v2_product_tags
  FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "authenticated read" ON public.product_v2_product_tags;
CREATE POLICY "authenticated read" ON public.product_v2_product_tags
  FOR SELECT TO authenticated USING (true);

-- ============================================================
-- Seed initial : tag "Fait maison"
-- ============================================================
INSERT INTO public.product_v2_tags (name, name_en, color, icon_name, position)
VALUES ('Fait maison', 'Homemade', '#16a34a', 'ChefHat', 0)
ON CONFLICT (name) DO NOTHING;
