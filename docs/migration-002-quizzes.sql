-- Migration 002: Tables quizzes, questions, quiz_questions + storage bucket
-- À exécuter dans le SQL Editor du dashboard Supabase

-- ============================================================
-- Table quizzes
-- ============================================================
CREATE TABLE IF NOT EXISTS public.quizzes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  theme TEXT NOT NULL,
  background_media_youtube TEXT,
  background_music_url TEXT,
  background_image_url TEXT,
  pause_promotional_text TEXT,
  end_winner_text TEXT,
  end_text_final TEXT,
  published BOOLEAN NOT NULL DEFAULT true,
  do_not_delete BOOLEAN DEFAULT false,
  last_edited_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  last_edited_by_email TEXT,
  contentful_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quizzes_contentful_id ON public.quizzes(contentful_id) WHERE contentful_id IS NOT NULL;

DROP TRIGGER IF EXISTS quizzes_updated_at ON public.quizzes;
CREATE TRIGGER quizzes_updated_at
  BEFORE UPDATE ON public.quizzes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE public.quizzes ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- Table questions
-- ============================================================
CREATE TABLE IF NOT EXISTS public.questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question TEXT NOT NULL,
  difficulty TEXT[] DEFAULT '{}',
  answers TEXT[] DEFAULT '{}',
  correct_answer_index INTEGER DEFAULT 0,
  theme TEXT,
  help_animator TEXT,
  music_url TEXT,
  video_youtube TEXT,
  image_question_url TEXT,
  image_answer_url TEXT,
  contentful_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_questions_contentful_id ON public.questions(contentful_id) WHERE contentful_id IS NOT NULL;

DROP TRIGGER IF EXISTS questions_updated_at ON public.questions;
CREATE TRIGGER questions_updated_at
  BEFORE UPDATE ON public.questions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- Table de jonction quiz <-> questions (ordonnée)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.quiz_questions (
  quiz_id UUID NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (quiz_id, question_id)
);

CREATE INDEX IF NOT EXISTS idx_quiz_questions_quiz ON public.quiz_questions(quiz_id);
CREATE INDEX IF NOT EXISTS idx_quiz_questions_question ON public.quiz_questions(question_id);

ALTER TABLE public.quiz_questions ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- Storage bucket pour les médias (images, audio)
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('invader-assets', 'invader-assets', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public read invader-assets"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'invader-assets');

CREATE POLICY "Service upload invader-assets"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'invader-assets');

CREATE POLICY "Service update invader-assets"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'invader-assets');

CREATE POLICY "Service delete invader-assets"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'invader-assets');
