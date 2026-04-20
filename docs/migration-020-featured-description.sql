-- Migration 020 : ajout d'une description longue sur les mises en avant accueil
--
-- Ajoute une colonne `description` (TEXT, optionnelle) a la table
-- `table_home_featured`. Si la mise en avant n'a pas de CTA defini
-- (cta_target = NULL), un clic sur la card cote table tactile ouvre une
-- modale qui affiche image + titre + description.
--
-- Idempotent.

ALTER TABLE public.table_home_featured
  ADD COLUMN IF NOT EXISTS description TEXT;

COMMENT ON COLUMN public.table_home_featured.description IS
  'Description longue, affichee dans la modale de detail cote tables tactiles quand la card n''a pas de CTA. Null = pas de description.';
