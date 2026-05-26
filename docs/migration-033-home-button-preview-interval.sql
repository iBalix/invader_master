-- Migration 033 : intervalle des previews video sur les boutons de la home
--
-- De temps en temps, le fond des boutons Carte / Jeux fait un fondu et joue
-- une courte video (3s) : une video produit aleatoire pour Carte, un gameplay
-- YouTube aleatoire pour Jeux. Ce reglage controle le delai entre 2 previews.
ALTER TABLE public.tables_settings
  ADD COLUMN IF NOT EXISTS home_button_preview_interval_ms INTEGER NOT NULL DEFAULT 20000
    CHECK (home_button_preview_interval_ms >= 5000);
