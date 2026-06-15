-- Texture (image paysage 16:9) appliquee en background des boutons sidebar
-- Carte aux bornes, avec un degrade noir gauche -> transparent droit pour
-- garantir la lisibilite du libelle (meme rendu que sur la sidebar Jeux).
ALTER TABLE public.menu_categories_v2 ADD COLUMN IF NOT EXISTS texture_url TEXT;
