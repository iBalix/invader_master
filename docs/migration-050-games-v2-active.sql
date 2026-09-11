-- Migration 050 : games_v2.active, interrupteur actif / inactif du catalogue
--
-- POURQUOI. Deux besoins du bar : couper un jeu bugue en un clic sans le
-- supprimer (jaquette, videos, categories conservees), et developper un nouveau
-- jeu directement en prod sans l'exposer aux clients tant qu'il n'est pas pret.
--
-- SEMANTIQUE. Un jeu inactif DISPARAIT de la liste des jeux des tables tactiles
-- (GET /public/games-v2, consomme par GamesPage) et des videos de l'accueil
-- (GET /public/tables/:hostname/home). Il reste en revanche :
--   - joignable par son URL directe : les lobbies des jeux web ne consultent
--     pas le catalogue, c'est ce qui permet de le tester en prod ;
--   - lancable par un ordre de lancement emulateur : tableLaunch.resolveGame ne
--     filtre pas, un lancement en cours n'est jamais casse.
-- Par defaut tout jeu est actif : la migration ne change rien de visible.
--
-- FENETRE DE MIGRATION. Ce fichier s'applique a la main dans le SQL Editor
-- Supabase (convention du projet), alors qu'un push sur main deploie en prod
-- immediatement. Le backend sonde donc la presence de la colonne avant de
-- filtrer (backend/src/lib/gamesV2Columns.ts) : filtrer sur une colonne absente
-- renverrait 500 et la page des jeux du bar serait vide.
--
-- Idempotent : re-run safe.

ALTER TABLE public.games_v2
  ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN public.games_v2.active IS
  'Interrupteur du catalogue : false = jeu masque de la liste des tables tactiles, mais toujours joignable par URL directe et lancable par ordre emulateur. Defaut true.';
