-- Invader Master - Schéma Supabase
-- À exécuter dans l'éditeur SQL du projet Supabase

-- Table profiles (liée à auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT 'salarie'
    CHECK (role IN ('admin', 'salarie', 'externe')),
  display_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trigger auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS profiles_updated_at ON public.profiles;
CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS (filet de sécurité ; le backend utilise service_role_key qui bypass RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Chaque user peut lire son propre profil
DROP POLICY IF EXISTS "Users read own profile" ON public.profiles;
CREATE POLICY "Users read own profile"
  ON public.profiles FOR SELECT
  USING (id = auth.uid());

-- Les admins peuvent lire tous les profils
DROP POLICY IF EXISTS "Admins read all profiles" ON public.profiles;
CREATE POLICY "Admins read all profiles"
  ON public.profiles FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

-- Insert/Update/Delete : pas de policy côté client, tout passe par le backend (service_role)

-- ============================================================
-- Content management: Quizzes & Questions
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
  do_not_delete BOOLEAN DEFAULT false,
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

CREATE TABLE IF NOT EXISTS public.quiz_questions (
  quiz_id UUID NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (quiz_id, question_id)
);

CREATE INDEX IF NOT EXISTS idx_quiz_questions_quiz ON public.quiz_questions(quiz_id);
CREATE INDEX IF NOT EXISTS idx_quiz_questions_question ON public.quiz_questions(question_id);

ALTER TABLE public.quiz_questions ENABLE ROW LEVEL SECURITY;

-- Storage bucket for media assets (images, audio)
INSERT INTO storage.buckets (id, name, public)
VALUES ('invader-assets', 'invader-assets', true)
ON CONFLICT (id) DO NOTHING;

-- Allow public read on the bucket
DROP POLICY IF EXISTS "Public read invader-assets" ON storage.objects;
CREATE POLICY "Public read invader-assets"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'invader-assets');

-- Allow authenticated uploads via service role (backend handles auth)
DROP POLICY IF EXISTS "Service upload invader-assets" ON storage.objects;
CREATE POLICY "Service upload invader-assets"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'invader-assets');

DROP POLICY IF EXISTS "Service update invader-assets" ON storage.objects;
CREATE POLICY "Service update invader-assets"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'invader-assets');

DROP POLICY IF EXISTS "Service delete invader-assets" ON storage.objects;
CREATE POLICY "Service delete invader-assets"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'invader-assets');
