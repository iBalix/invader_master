-- Migration 032 : delai entre apparitions des mises en avant sur la home
--
-- L'evenement reste affiche en permanence dans le bandeau home ; une mise en
-- avant fait une apparition temporaire toutes les `home_featured_interval_ms`,
-- puis l'evenement reprend sa place.
ALTER TABLE public.tables_settings
  ADD COLUMN IF NOT EXISTS home_featured_interval_ms INTEGER NOT NULL DEFAULT 30000
    CHECK (home_featured_interval_ms >= 5000);
