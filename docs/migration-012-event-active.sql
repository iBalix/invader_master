-- Migration 012: Ajout colonne active sur projector_events
-- À exécuter dans le SQL Editor du dashboard Supabase

ALTER TABLE public.projector_events ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true;
