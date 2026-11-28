-- Migration 058 : games.staging_only, jeu visible uniquement en staging
--
-- POURQUOI. Depuis le 28/11/2026 le back-office a deux environnements Railway,
-- production (branche main, le bar) et staging (branche staging), qui
-- partagent cette base. Cette colonne permet de montrer un jeu en cours
-- d'essai sur les tables de staging sans l'exposer aux clients du bar.
--
-- SEMANTIQUE. Un jeu "staging uniquement" est TOUJOURS inactif :
--   active = true                          -> visible partout (bar et staging)
--   active = false, staging_only = true    -> visible en staging seulement
--   active = false, staging_only = false   -> masque partout
-- Le backend garantit a l'ecriture que les deux ne sont jamais vrais ensemble
-- (backend/src/routes/gameRoutes.ts). La production continue de filtrer sur
-- `active` comme depuis la migration 050 : elle n'a pas besoin de connaitre
-- cette colonne, et aucune version de son code ne peut donc montrer au bar un
-- jeu en cours d'essai. Seul staging lit staging_only
-- (backend/src/lib/gamesColumns.ts).
--
-- FENETRE DE MIGRATION. Comme pour la 050, le backend sonde la presence de la
-- colonne : tant qu'elle manque, l'option est ignoree et rien ne casse.
--
-- A executer dans le SQL Editor du dashboard Supabase. Idempotente.

ALTER TABLE public.games
  ADD COLUMN IF NOT EXISTS staging_only BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.games.staging_only IS
  'true = jeu visible uniquement sur l''environnement staging (toujours avec active = false, donc masque au bar). Defaut false.';
