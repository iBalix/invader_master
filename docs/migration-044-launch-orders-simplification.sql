-- Migration 044 : retrait de la confirmation de lancement
--
-- La 042/043 prevoyaient de VERIFIER qu'un emulateur avait bien demarre :
-- sondes via l'agent du bar, reprise automatique, lancement de secours, codes
-- d'erreur detailles. Arbitrage du proprietaire : le lancement par deeplink
-- n'a jamais pose probleme au bar, et le client voit de ses yeux si le jeu
-- demarre. Le cout (une tache planifiee a provisionner sur chaque PC de table,
-- plus un agent capable de sonder sans se figer) ne se justifiait pas.
--
-- Ce qui reste est ce qui reparait des pannes reelles : un ordre persiste, lu
-- par les deux dalles, qui permet a l'ecran secondaire de lancer un jeu et
-- l'empeche de rester bloque sur "partie en cours".
--
-- Sans risque : table creee dans la meme session de travail, zero ligne, aucun
-- autre code ne la lit. Rien a voir avec les donnees partagees avec les
-- anciens sites Invader.

ALTER TABLE public.table_launch_orders
  -- servaient a la sonde et a la reprise, plus personne ne les ecrit
  DROP COLUMN IF EXISTS kind,
  DROP COLUMN IF EXISTS next_probe_at,
  DROP COLUMN IF EXISTS confirm_deadline_at,
  DROP COLUMN IF EXISTS probe_miss_count,
  DROP COLUMN IF EXISTS last_probe_at,
  DROP COLUMN IF EXISTS confirmed_at,
  DROP COLUMN IF EXISTS attempts,
  -- un seul chemin d'execution : le navigateur du master
  DROP COLUMN IF EXISTS dispatched_by,
  -- une seule cause d'echec possible : personne n'a reclame l'ordre.
  -- Le texte est traduit cote borne, les tables sont bilingues.
  DROP COLUMN IF EXISTS error_code,
  DROP COLUMN IF EXISTS error_message;

-- 'confirmed' n'est plus jamais ecrit : 'dispatched' signifie desormais
-- "le deeplink est parti, la partie est en cours".
ALTER TABLE public.table_launch_orders
  DROP CONSTRAINT IF EXISTS table_launch_orders_status_check;
ALTER TABLE public.table_launch_orders
  ADD CONSTRAINT table_launch_orders_status_check
  CHECK (status IN ('pending', 'dispatched', 'failed', 'cancelled'));
