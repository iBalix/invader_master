-- Migration 043 : durcissement des ordres de lancement (table 042)
--
-- Trois manques identifies a la relecture de la 042 :
--
--   1. RIEN n'empechait deux ordres vivants sur la meme table. La garde etait
--      applicative (lire puis annuler puis inserer), donc sujette a la course
--      entre deux clics simultanes sur les deux dalles. On la deplace dans
--      Postgres : index unique partiel. Le double lancement devient impossible
--      par construction, pas par convention.
--
--   2. Les echeances vivaient dans des setTimeout du process Node. Un
--      redeploiement Railway en pleine soiree les perdait, laissant des ordres
--      "dispatched" eternels. On les stocke en ABSOLU : l'ordonnanceur les
--      relit a chaque tick, un redemarrage ne perd plus rien.
--
--   3. Une sonde qui echoue (PC injoignable) etait confondue avec une sonde
--      qui reussit sans voir l'emulateur (jeu ferme). On compte desormais les
--      absences REELLES, pour ne pas terminer une partie au premier hoquet
--      reseau.
--
-- Additif uniquement, sur une table creee par la 042 : aucune donnee de prod
-- partagee avec les anciens sites n'est touchee.

ALTER TABLE public.table_launch_orders
  -- 'emulator' : RetroArch, sondable par nom de processus
  -- 'invader'  : jeu maison de la console "Invader", pas de processus retroarch
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'emulator',
  -- delai laisse au navigateur du master avant que l'agent prenne le relais
  ADD COLUMN IF NOT EXISTS ack_deadline_at TIMESTAMPTZ,
  -- date de la prochaine sonde due (NULL = rien a sonder)
  ADD COLUMN IF NOT EXISTS next_probe_at TIMESTAMPTZ,
  -- au-dela, l'ordre est declare en echec
  ADD COLUMN IF NOT EXISTS confirm_deadline_at TIMESTAMPTZ,
  -- absences CONFIRMEES d'emulateur (une sonde en echec ne compte pas)
  ADD COLUMN IF NOT EXISTS probe_miss_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_probe_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ended_by TEXT;

-- INVARIANT CENTRAL : au plus un ordre vivant par machine cible.
-- Deux POST concurrents -> le second recoit une violation d'unicite, que le
-- service traduit en "reprend l'ordre existant" au lieu de lancer deux fois.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_live_order_per_table
  ON public.table_launch_orders (target_hostname)
  WHERE ended_at IS NULL;

-- L'ordonnanceur ne lit que les ordres vivants : index dedie.
CREATE INDEX IF NOT EXISTS idx_launch_orders_live
  ON public.table_launch_orders (created_at)
  WHERE ended_at IS NULL;
