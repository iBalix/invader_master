-- Migration 047 : games_v2.player_counts — configurations de joueurs supportees
--
-- POURQUOI. `max_players` decrivait un PLAFOND, et le filtre des bornes en
-- deduisait "tout ce qui est en dessous marche aussi". Faux des qu'un jeu impose
-- un minimum : les echecs se jouent a 2, exactement 2, et pourtant un
-- max_players a 2 les faisait apparaitre sous le filtre "1 joueur".
--
-- On passe donc d'un plafond a un ENSEMBLE : la liste des configurations sous
-- lesquelles le jeu doit etre proposé. Les valeurs correspondent une a une aux
-- puces de filtre de la borne, pour qu'un jeu soit trouvable exactement la ou on
-- l'a tague : '1', '2', '3', '4', '4+'.
--
-- `max_players` est CONSERVE mais n'est plus saisi a la main : le backend le
-- recalcule depuis les tags a chaque enregistrement ('4+' vaut 8, le plafond du
-- CHECK depuis migration-046 ; sinon le tag le plus haut), pour ne pas laisser
-- deux sources de verite diverger. Il ne sert plus qu'au repli quand
-- player_counts est vide, y compris pendant la fenetre entre le deploiement du
-- code et l'application de cette migration : d'ici la, le front derive les tags
-- de max_players et le comportement visible reste celui d'hier.

ALTER TABLE public.games_v2
  ADD COLUMN IF NOT EXISTS player_counts TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE public.games_v2 DROP CONSTRAINT IF EXISTS games_v2_player_counts_check;
ALTER TABLE public.games_v2
  ADD CONSTRAINT games_v2_player_counts_check
  CHECK (player_counts <@ ARRAY['1', '2', '3', '4', '4+']::TEXT[]);

-- Remplissage : on reproduit A L'IDENTIQUE ce que le filtre affichait hier, donc
-- 1..N plus '4+' au-dela de 4. Aucun client ne verra de changement tant que les
-- tags n'ont pas ete corriges a la main dans le back-office.
--
-- C'est volontaire : deviner ici quels jeux imposent un minimum serait du
-- pifometre. Seuls les echecs sont corriges plus bas, le cas ayant ete signale.
UPDATE public.games_v2
SET player_counts = (
  SELECT ARRAY(
    SELECT v FROM unnest(ARRAY['1', '2', '3', '4']) AS v
    WHERE v::INTEGER <= LEAST(COALESCE(max_players, 1), 4)
    UNION ALL
    SELECT '4+' WHERE COALESCE(max_players, 1) > 4
  )
)
WHERE player_counts = '{}';

-- Les echecs : exactement deux joueurs, jamais un.
UPDATE public.games_v2
SET player_counts = ARRAY['2']::TEXT[]
WHERE game_type = 'web' AND lower(name) LIKE '%chec%';

COMMENT ON COLUMN public.games_v2.player_counts IS
  'Configurations de joueurs supportees, alignees sur les puces de filtre des bornes : 1, 2, 3, 4, 4+. Un ensemble, pas un plafond : les echecs valent {2} et non {1,2}.';
