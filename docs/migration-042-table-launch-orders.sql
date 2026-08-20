-- Migration 042 : ordres de lancement de jeu sur les tables tactiles
--
-- CONTEXTE
--   Jusqu'ici, lancer un jeu etait un "fire and forget" : la page poussait un
--   deeplink invader:\\run?... et un evenement Pusher, sans jamais savoir si
--   quoi que ce soit avait abouti. Un prompt de navigateur bloque, un PC gele
--   ou un evenement perdu passaient totalement inapercus cote client.
--
--   On persiste desormais l'INTENTION de lancer. L'ordre devient la source de
--   verite que tous les acteurs consultent :
--     - le client qui a clique suit l'avancement (pop-up "Lancement en cours")
--     - le PC master lit les ordres qui lui sont adresses
--     - l'agent du bar confirme que l'emulateur tourne, ou relance en secours
--
--   Consequence importante : le temps reel (Pusher) devient un ACCELERATEUR,
--   plus une dependance. Meme si l'evenement se perd, le sondage de l'ordre
--   fait aboutir le lancement.
--
-- Idempotent : re-run safe. Table nouvelle, aucune table existante modifiee.

CREATE TABLE IF NOT EXISTS public.table_launch_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- PC qui doit REELLEMENT lancer (toujours un master "TABLExx-1" :
  -- lui seul est cable aux deux dalles et sait basculer l'ecran du slave)
  target_hostname TEXT NOT NULL,
  -- PC d'ou vient la demande (master lui-meme, ou son slave "TABLExx-2")
  requested_by TEXT NOT NULL,

  game_id UUID,
  game_name TEXT NOT NULL DEFAULT '',
  -- deeplink complet calcule au moment de la demande, rejoue tel quel par le
  -- master ET par l'agent en secours : une seule definition du lancement
  launch_url TEXT NOT NULL,

  -- pending    : cree, personne ne l'a encore pris en charge
  -- dispatched : le master a declenche le deeplink (ou l'agent en secours)
  -- confirmed  : un emulateur tourne reellement sur la machine cible
  -- failed     : abandonne apres tentatives (le client voit une erreur claire)
  -- cancelled  : remplace par un ordre plus recent sur la meme table
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'dispatched', 'confirmed', 'failed', 'cancelled')),

  -- qui a effectivement declenche : 'browser' (chemin rapide) ou 'agent' (secours)
  dispatched_by TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  dispatched_at TIMESTAMPTZ,
  confirmed_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ
);

-- Un seul ordre vivant par machine cible : sert a la fois au sondage du master
-- et a la garde anti-double-lancement.
CREATE INDEX IF NOT EXISTS idx_launch_orders_target_live
  ON public.table_launch_orders (target_hostname, created_at DESC)
  WHERE ended_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_launch_orders_created
  ON public.table_launch_orders (created_at DESC);

-- RLS : pattern du projet (migration-021). Les bornes ne tapent JAMAIS Supabase
-- en direct, tout passe par le backend en service_role.
ALTER TABLE public.table_launch_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.table_launch_orders NO FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role full access" ON public.table_launch_orders;
CREATE POLICY "service_role full access"
  ON public.table_launch_orders
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);
