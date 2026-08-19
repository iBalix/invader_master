-- Migration 041 : banque de questions battle royale en Postgres
-- Remplace la table MySQL OVH legacy (import one-shot via scripts/import-battle-questions.ts).
-- Consommation NON destructive : une question posée est marquée used_at (jamais supprimée).
-- Idempotente : re-runnable sans effet de bord.

CREATE TABLE IF NOT EXISTS battle_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- id MySQL d'origine, pour un import re-runnable (upsert) ; NULL pour les
  -- questions créées directement dans Postgres
  legacy_id INTEGER UNIQUE,
  question TEXT NOT NULL,
  -- réponses PROPRES (sans le marqueur " (OK)" du legacy) ; la bonne réponse
  -- est correct_answer_index. Le marqueur est re-sérialisé par l'API pour les
  -- consommateurs legacy.
  answers TEXT[] NOT NULL,
  correct_answer_index INTEGER NOT NULL DEFAULT 0,
  difficulty TEXT NOT NULL,
  theme TEXT NOT NULL DEFAULT '',
  help_story TEXT NOT NULL DEFAULT '',
  -- consommation par le moteur battle : posée = used_at renseigné, ne ressort
  -- jamais automatiquement ; remise à NULL via POST /api/battle-questions/reset-usage
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- contraintes (drop/add pour rester re-runnable)
ALTER TABLE battle_questions DROP CONSTRAINT IF EXISTS battle_questions_difficulty_check;
ALTER TABLE battle_questions
  ADD CONSTRAINT battle_questions_difficulty_check
  CHECK (difficulty IN ('Facile', 'Moyen', 'Difficile'));

ALTER TABLE battle_questions DROP CONSTRAINT IF EXISTS battle_questions_answers_check;
ALTER TABLE battle_questions
  ADD CONSTRAINT battle_questions_answers_check
  CHECK (array_length(answers, 1) = 4);

ALTER TABLE battle_questions DROP CONSTRAINT IF EXISTS battle_questions_correct_index_check;
ALTER TABLE battle_questions
  ADD CONSTRAINT battle_questions_correct_index_check
  CHECK (correct_answer_index >= 0 AND correct_answer_index <= 3);

-- tirage du moteur : questions disponibles par difficulté
CREATE INDEX IF NOT EXISTS idx_battle_questions_available
  ON battle_questions (difficulty)
  WHERE used_at IS NULL;

-- RLS : accès service_role uniquement (piège 4.3 du CLAUDE.md : sans policy,
-- le backend PostgREST recevrait 0 ligne)
ALTER TABLE battle_questions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role full access" ON battle_questions;
CREATE POLICY "service_role full access" ON battle_questions
  FOR ALL TO service_role USING (true) WITH CHECK (true);
