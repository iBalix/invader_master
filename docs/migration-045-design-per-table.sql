-- Migration 045 : un design de fond par table
--
-- Jusqu'ici resolveEffectiveDesign() ne prenait aucun parametre : il tirait au
-- hasard parmi les designs actifs et memorisait le choix dans le singleton
-- design_runtime_state. Consequence, TOUTES les bornes du bar affichaient le
-- meme fond, et il changeait toutes les 15 minutes (fenetre d'adherence).
--
-- Avec ce reglage a true, l'attribution devient deterministe : la table N recoit
-- le Nieme design actif dans l'ordre d'affichage du back-office (created_at).
-- Les deux dalles d'une meme table partagent donc le meme fond sans aucun etat
-- a synchroniser, puisque TABLExx-1 et TABLExx-2 donnent le meme numero de
-- table. A false, on retrouve exactement le comportement aleatoire precedent.
--
-- Additif sur un singleton existant, aucune donnee touchee.

ALTER TABLE public.tables_settings
  ADD COLUMN IF NOT EXISTS design_per_table BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN public.tables_settings.design_per_table IS
  'true = chaque table recoit un design distinct (Nieme design pour la table N) ; false = tirage aleatoire global';
