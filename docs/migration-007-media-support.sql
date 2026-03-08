-- Migration 007: Tables projector_config, projector_events, tv_configs
-- À exécuter dans le SQL Editor du dashboard Supabase

-- ============================================================
-- Table projector_config (singleton)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.projector_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  next_event_title TEXT,
  next_event_subtitle TEXT,
  next_event_description TEXT,
  next_event_image_url TEXT,
  background_video_youtube TEXT,
  contentful_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

DROP TRIGGER IF EXISTS projector_config_updated_at ON public.projector_config;
CREATE TRIGGER projector_config_updated_at
  BEFORE UPDATE ON public.projector_config
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE public.projector_config ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- Table projector_events
-- ============================================================
CREATE TABLE IF NOT EXISTS public.projector_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  date TIMESTAMPTZ NOT NULL,
  icon TEXT,
  contentful_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_projector_events_date ON public.projector_events(date);
CREATE INDEX IF NOT EXISTS idx_projector_events_contentful ON public.projector_events(contentful_id) WHERE contentful_id IS NOT NULL;

DROP TRIGGER IF EXISTS projector_events_updated_at ON public.projector_events;
CREATE TRIGGER projector_events_updated_at
  BEFORE UPDATE ON public.projector_events
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE public.projector_events ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- Table tv_configs
-- ============================================================
CREATE TABLE IF NOT EXISTS public.tv_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  youtube_videos TEXT[] DEFAULT '{}',
  media_video_urls TEXT[] DEFAULT '{}',
  media_image_urls TEXT[] DEFAULT '{}',
  target TEXT[] DEFAULT '{}',
  contentful_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tv_configs_contentful ON public.tv_configs(contentful_id) WHERE contentful_id IS NOT NULL;

DROP TRIGGER IF EXISTS tv_configs_updated_at ON public.tv_configs;
CREATE TRIGGER tv_configs_updated_at
  BEFORE UPDATE ON public.tv_configs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE public.tv_configs ENABLE ROW LEVEL SECURITY;
