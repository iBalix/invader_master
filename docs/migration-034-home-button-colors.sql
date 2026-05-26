-- Migration 034 : couleurs configurables des boutons home (Carte / Jeux)
--
-- Le gradient du bouton ET les particules qui en emanent utilisent ces couleurs.
ALTER TABLE public.tables_settings
  ADD COLUMN IF NOT EXISTS menu_button_color TEXT NOT NULL DEFAULT '#7b2bff'
    CHECK (menu_button_color ~ '^#[0-9A-Fa-f]{6}$'),
  ADD COLUMN IF NOT EXISTS games_button_color TEXT NOT NULL DEFAULT '#ff2bd6'
    CHECK (games_button_color ~ '^#[0-9A-Fa-f]{6}$');
