-- Migration 004: Tracking du dernier éditeur sur les quiz
-- À exécuter dans le SQL Editor du dashboard Supabase

ALTER TABLE public.quizzes
  ADD COLUMN IF NOT EXISTS last_edited_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS last_edited_by_email TEXT;
