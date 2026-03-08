-- Migration 003: Ajout du statut published sur les quiz
-- À exécuter dans le SQL Editor du dashboard Supabase

ALTER TABLE public.quizzes
  ADD COLUMN IF NOT EXISTS published BOOLEAN NOT NULL DEFAULT true;
