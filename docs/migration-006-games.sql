-- Migration 006: Tables game_categories, game_consoles, games, game_images, game_category_games
-- À exécuter dans le SQL Editor du dashboard Supabase

-- ============================================================
-- Table game_categories
-- ============================================================
CREATE TABLE IF NOT EXISTS public.game_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 100,
  contentful_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_game_categories_contentful ON public.game_categories(contentful_id) WHERE contentful_id IS NOT NULL;

DROP TRIGGER IF EXISTS game_categories_updated_at ON public.game_categories;
CREATE TRIGGER game_categories_updated_at
  BEFORE UPDATE ON public.game_categories
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE public.game_categories ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- Table game_consoles
-- ============================================================
CREATE TABLE IF NOT EXISTS public.game_consoles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  library TEXT NOT NULL,
  logo_url TEXT,
  contentful_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_game_consoles_contentful ON public.game_consoles(contentful_id) WHERE contentful_id IS NOT NULL;

DROP TRIGGER IF EXISTS game_consoles_updated_at ON public.game_consoles;
CREATE TRIGGER game_consoles_updated_at
  BEFORE UPDATE ON public.game_consoles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE public.game_consoles ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- Table games
-- ============================================================
CREATE TABLE IF NOT EXISTS public.games (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  subtitle TEXT,
  description TEXT,
  cover_url TEXT,
  file_name TEXT NOT NULL UNIQUE,
  console_id UUID NOT NULL REFERENCES public.game_consoles(id) ON DELETE RESTRICT,
  platform TEXT[] DEFAULT '{}',
  competition BOOLEAN NOT NULL DEFAULT false,
  competition_link TEXT,
  display_order INTEGER NOT NULL DEFAULT 100,
  contentful_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_games_console ON public.games(console_id);
CREATE INDEX IF NOT EXISTS idx_games_contentful ON public.games(contentful_id) WHERE contentful_id IS NOT NULL;

DROP TRIGGER IF EXISTS games_updated_at ON public.games;
CREATE TRIGGER games_updated_at
  BEFORE UPDATE ON public.games
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE public.games ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- Table game_images (screenshots/images supplementaires)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.game_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_game_images_game ON public.game_images(game_id);

ALTER TABLE public.game_images ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- Table de jonction categories <-> jeux
-- ============================================================
CREATE TABLE IF NOT EXISTS public.game_category_games (
  category_id UUID NOT NULL REFERENCES public.game_categories(id) ON DELETE CASCADE,
  game_id UUID NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  PRIMARY KEY (category_id, game_id)
);

CREATE INDEX IF NOT EXISTS idx_gcg_cat ON public.game_category_games(category_id);
CREATE INDEX IF NOT EXISTS idx_gcg_game ON public.game_category_games(game_id);

ALTER TABLE public.game_category_games ENABLE ROW LEVEL SECURITY;
