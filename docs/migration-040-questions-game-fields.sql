-- Migration 040 : Extensions de public.questions pour le runtime quiz
--
-- Nouveaux types de questions (estimation chiffree, reponse libre jugee par IA)
-- et override du bareme par question (1 a 5 points) decide par le gamemaster.
-- Les questions existantes restent des QCM (type par defaut).
--
-- Idempotent : re-run safe.

ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'qcm',
  ADD COLUMN IF NOT EXISTS points_override INTEGER,
  ADD COLUMN IF NOT EXISTS expected_answer TEXT,
  ADD COLUMN IF NOT EXISTS expected_number NUMERIC,
  -- paliers d'ecart pour l'estimation, tries cote backend :
  -- [{"maxGap": 5, "points": 5}, {"maxGap": 20, "points": 3}, {"maxGap": 50, "points": 1}]
  ADD COLUMN IF NOT EXISTS estimation_scoring JSONB;

-- Contraintes legeres (drop + add pour re-run safe)
ALTER TABLE public.questions DROP CONSTRAINT IF EXISTS questions_type_check;
ALTER TABLE public.questions ADD CONSTRAINT questions_type_check
  CHECK (type IN ('qcm', 'estimation', 'free_text'));

ALTER TABLE public.questions DROP CONSTRAINT IF EXISTS questions_points_override_check;
ALTER TABLE public.questions ADD CONSTRAINT questions_points_override_check
  CHECK (points_override IS NULL OR (points_override >= 1 AND points_override <= 5));
