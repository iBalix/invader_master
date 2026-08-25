-- Migration 048 : reglages de generation d'images par IA (carte v2)
--
-- CONTEXTE :
--   Les visuels produit sont generes par IA, avec un prompt de style reutilise
--   d'un produit a l'autre et des visuels existants joints en exemple. Les deux
--   vivaient jusqu'ici dans l'historique de conversation de l'auteur.
--
--   On les range dans carte_settings, qui est deja le singleton des reglages du
--   module carte (happy hour, commande, avis Google) et dispose deja de ses
--   routes GET/PUT generiques. Cout d'integration nul : il suffit d'ajouter les
--   deux colonnes a la whitelist ALLOWED_FIELDS de backend/src/routes/carteSettings.ts.
--
-- POURQUOI UN TABLEAU D'UUID ET PAS UNE TABLE DE JONCTION :
--   Il s'agit de trois ou quatre identifiants, relus une fois par generation.
--   Une table de jonction apporterait la cascade a la suppression d'un produit,
--   au prix d'une table, d'une route et d'un composant de plus. On prefere
--   filtrer en silence les identifiants qui ne se resolvent plus, ce que fait le
--   service de generation.

ALTER TABLE public.carte_settings
  ADD COLUMN IF NOT EXISTS image_gen_prompt TEXT,
  ADD COLUMN IF NOT EXISTS image_gen_reference_product_ids UUID[] NOT NULL DEFAULT '{}';

-- Valeur de depart, a corriger depuis le back-office (Carte v2 > Reglages).
-- Elle decrit le CADRE, pas le produit : la description du produit est saisie a
-- chaque generation et vient s'y ajouter.
UPDATE public.carte_settings
SET image_gen_prompt =
  'Photographie de produit pour la carte d''un bar retro gaming. '
  || 'Cadrage 16:9 paysage, produit centre et occupant les deux tiers de l''image, '
  || 'fond sombre legerement degrade, eclairage studio contraste, couleurs saturees, '
  || 'rendu net et appetissant. '
  || 'Aucun texte, aucun logo, aucune main, aucun filigrane.'
WHERE image_gen_prompt IS NULL;

COMMENT ON COLUMN public.carte_settings.image_gen_prompt IS
  'Prompt de style ajoute a chaque generation d''image produit. Decrit le cadre commun (cadrage, fond, lumiere), pas le produit.';
COMMENT ON COLUMN public.carte_settings.image_gen_reference_product_ids IS
  'Produits dont l''image sert d''exemple de style a l''IA. Les identifiants qui ne se resolvent plus sont ignores silencieusement.';
