-- Migration 027 : Games v2 — schema (categories_v2, consoles_v2, games_v2, images_v2, jonction)
--
-- CONTEXTE :
--   Clone des tables Games v1 (game_categories, game_consoles, games, game_images,
--   game_category_games) en v2 avec enrichissements :
--   - categories : icon_name (Lucide), color (#hex), texture_url (image fond bouton sidebar)
--   - consoles : display_name (nom court affiche borne)
--   - games : max_players, youtube_video_id/start/duration, 8 colonnes control_*
--
--   La v1 reste intacte. Bornes basculent sur v2 en M4 via useGamesV2.
--   Cleanup / drop v1 deferre quand v2 validee en bar.
--
-- RLS : voir migration-028-games-v2-rls.sql. Sans policies, le backend voit 0 ligne (CLAUDE.md §4.3).

-- ============================================================
-- game_categories_v2 (clone + branding visuel)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.game_categories_v2 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  name_en TEXT,
  display_order INTEGER NOT NULL DEFAULT 100,
  icon_name TEXT,
  color TEXT CHECK (color IS NULL OR color ~ '^#[0-9A-Fa-f]{6}$'),
  texture_url TEXT,
  contentful_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

DROP TRIGGER IF EXISTS game_categories_v2_updated_at ON public.game_categories_v2;
CREATE TRIGGER game_categories_v2_updated_at
  BEFORE UPDATE ON public.game_categories_v2
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE public.game_categories_v2 ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- game_consoles_v2 (clone + display_name)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.game_consoles_v2 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  display_name TEXT,
  library TEXT NOT NULL,
  logo_url TEXT,
  contentful_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

DROP TRIGGER IF EXISTS game_consoles_v2_updated_at ON public.game_consoles_v2;
CREATE TRIGGER game_consoles_v2_updated_at
  BEFORE UPDATE ON public.game_consoles_v2
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE public.game_consoles_v2 ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- games_v2 (clone + max_players + youtube + controls)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.games_v2 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  name_en TEXT,
  subtitle TEXT,
  subtitle_en TEXT,
  description TEXT,
  description_en TEXT,
  file_name TEXT NOT NULL UNIQUE,
  console_id UUID REFERENCES public.game_consoles_v2(id) ON DELETE SET NULL,
  platform TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  competition BOOLEAN NOT NULL DEFAULT false,
  competition_link TEXT,
  display_order INTEGER NOT NULL DEFAULT 100,
  max_players INTEGER NOT NULL DEFAULT 1 CHECK (max_players BETWEEN 1 AND 4),
  youtube_video_id TEXT,
  youtube_start_sec INTEGER NOT NULL DEFAULT 0 CHECK (youtube_start_sec >= 0),
  youtube_duration_sec INTEGER CHECK (youtube_duration_sec IS NULL OR youtube_duration_sec > 0),
  control_a TEXT,
  control_b TEXT,
  control_x TEXT,
  control_y TEXT,
  control_l TEXT,
  control_r TEXT,
  control_start TEXT,
  control_select TEXT,
  contentful_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_games_v2_console ON public.games_v2(console_id);

DROP TRIGGER IF EXISTS games_v2_updated_at ON public.games_v2;
CREATE TRIGGER games_v2_updated_at
  BEFORE UPDATE ON public.games_v2
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE public.games_v2 ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- game_images_v2 (clone)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.game_images_v2 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID NOT NULL REFERENCES public.games_v2(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_game_images_v2_game ON public.game_images_v2(game_id);

ALTER TABLE public.game_images_v2 ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- game_category_games_v2 (jonction)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.game_category_games_v2 (
  category_id UUID NOT NULL REFERENCES public.game_categories_v2(id) ON DELETE CASCADE,
  game_id UUID NOT NULL REFERENCES public.games_v2(id) ON DELETE CASCADE,
  PRIMARY KEY (category_id, game_id)
);

CREATE INDEX IF NOT EXISTS idx_game_category_games_v2_cat ON public.game_category_games_v2(category_id);
CREATE INDEX IF NOT EXISTS idx_game_category_games_v2_game ON public.game_category_games_v2(game_id);

ALTER TABLE public.game_category_games_v2 ENABLE ROW LEVEL SECURITY;
