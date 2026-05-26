-- Mention speciale (texte libre) affichee dans la modale de lancement d'un jeu,
-- a cote du rappel des touches manette. La modale s'ouvre des qu'il y a une
-- mention OU au moins une touche configuree.
ALTER TABLE public.games_v2 ADD COLUMN IF NOT EXISTS special_note TEXT;
