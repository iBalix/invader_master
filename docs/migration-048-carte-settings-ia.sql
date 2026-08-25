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
-- LE PROMPT EST UN GABARIT, PAS UN TEXTE FIXE :
--   Il porte trois marqueurs que le serveur remplace a chaque generation.
--     {PRODUCT_NAME}        nom du produit en cours d'edition
--     {PRODUCT_TYPE}        cocktail | shooter | food, choisi dans la boite
--     {PRODUCT_DESCRIPTION} description du produit, plus les precisions saisies
--   L'operateur ne ressaisit donc jamais le prompt : il n'ecrit que ce qui
--   change d'une image a l'autre. Un gabarit sans marqueur reste valide, la
--   description est alors simplement ajoutee a la fin.
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

-- Gabarit de depart, modifiable ensuite depuis Carte v2 > Reglages.
-- Si la colonne porte deja une valeur (migration rejouee), on n'ecrase rien.
UPDATE public.carte_settings
SET image_gen_prompt =
'Moody retro-arcade bar product shot of {PRODUCT_NAME}, a {PRODUCT_TYPE}:
{PRODUCT_DESCRIPTION}.

RENDERING STYLE: semi-realistic cinematic digital render, halfway between
appetising food and drink photography and a polished digital painting. Smooth
gradients, soft airbrushed highlights, crisp edges, subtle film grain. Richly
detailed on the subject, never cartoonish, never flat vector, never 3D toy-like.

COMPOSITION: one single hero subject, isolated, large in frame, shot at counter
level with a slight low angle, resting on a dark polished wooden bar top with
visible warm wood grain. Generous empty dark space around it. Shallow depth of
field: subject tack sharp, background heavily blurred.

LIGHTING: warm amber key light from the upper side, strong orange rim light
outlining the subject, deep falloff into darkness towards the edges of the
frame. Glowing bokeh highlights. Low-key, intimate, cinematic night mood.

BACKGROUND: dimly lit retro gaming bar interior, dark brick wall, blurred
vintage arcade cabinets with faint glowing blue and violet screens, small warm
neon glows. Everything out of focus and very dark so the subject pops.

COLOUR PALETTE: deep near-black browns, burnt orange and amber, warm golden
highlights. Cool blue and violet accents only in the blurred background screens.
No other strong colours.

CONDITIONAL RULE, apply exactly one branch:
- If {PRODUCT_TYPE} is a cocktail or a shooter: the glass sits on the right side
  of the frame, and a rectangular outlined neon sign glowing warm orange is
  mounted on the dark brick wall in the upper left, clearly readable, in a bold
  condensed uppercase sans-serif, displaying exactly and only this text,
  correctly spelled: "{PRODUCT_NAME}". The neon casts a soft orange bloom on the
  wall and a faint reflection on the glass. No other text anywhere in the image.
- If {PRODUCT_TYPE} is food: the dish is centred, served generously on a round
  dark wooden serving board with a bevelled edge, glistening and freshly made,
  with steam or melted cheese detail where relevant. Absolutely no text, no
  lettering and no signage anywhere in the image.

NEGATIVE: no people, no hands, no faces, no cutlery in use, no watermark, no
brand logos, no video game characters or pixel-art sprites, no bright daylight,
no white or pale background, no cluttered scene, no borders or frames, no
misspelled or duplicated text.'
WHERE image_gen_prompt IS NULL;

COMMENT ON COLUMN public.carte_settings.image_gen_prompt IS
  'Gabarit de prompt applique a chaque generation d''image produit. Marqueurs remplaces par le serveur : {PRODUCT_NAME}, {PRODUCT_TYPE}, {PRODUCT_DESCRIPTION}.';
COMMENT ON COLUMN public.carte_settings.image_gen_reference_product_ids IS
  'Produits dont l''image sert d''exemple de style a l''IA. Les identifiants qui ne se resolvent plus sont ignores silencieusement.';
