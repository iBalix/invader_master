-- Migration 010: Ajout colonne active sur tv_configs
-- À exécuter dans le SQL Editor du dashboard Supabase

ALTER TABLE public.tv_configs ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true;
