-- Migration 051 : Flappy Bar multijoueur (mode 'flappybar' + records du bar + catalogue jusqu'a 20 joueurs)
--
-- PREREQUIS : migration-050 (ajoute la colonne games_v2.active) DOIT etre
--   appliquee AVANT celle-ci : le seed ci-dessous ecrit `active`.
--
-- CONTEXTE :
--   Troisieme jeu web en reseau entre tables tactiles, sur le meme moteur de
--   sessions que les echecs et le blackjack. L'etat de partie vit dans
--   game_sessions.runtime (JSONB), les flaps en direct ne touchent jamais la
--   base (WebSocket + memoire serveur).
--   NOUVEAU : une table game_records, commune a TOUS les jeux, pour le tableau
--   d'honneur du bar. Un record par (mode, pseudo normalise) : la liste reste
--   courte et lisible sur une dalle, chaque joueur n'y figure qu'avec sa
--   meilleure marque. Le catalogue games_v2 etait borne a 8 joueurs
--   (migration-046) : on ouvre a 20, tout le bar peut jouer la meme manche.
--
-- Idempotent : re-run safe.

-- ============================================================
-- 1) game_sessions.mode accepte 'flappybar'
-- ============================================================
ALTER TABLE public.game_sessions
  DROP CONSTRAINT IF EXISTS game_sessions_mode_check;
ALTER TABLE public.game_sessions
  ADD CONSTRAINT game_sessions_mode_check
  CHECK (mode IN ('quiz', 'battle', 'chess', 'blackjack', 'flappybar'));

-- ============================================================
-- 2) game_records : records du bar, tous jeux
--    score NUMERIC : metres a une decimale pour Flappy Bar, points entiers
--    ailleurs ; `unit` porte l'unite d'affichage ('m', 'pts', ...).
--    details JSONB : contexte libre par jeu (tuyaux, temps, manche...).
-- ============================================================
CREATE TABLE IF NOT EXISTS public.game_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mode TEXT NOT NULL,
  pseudo TEXT NOT NULL,
  pseudo_norm TEXT NOT NULL,
  score NUMERIC NOT NULL,
  unit TEXT NOT NULL DEFAULT '',
  details JSONB NOT NULL DEFAULT '{}',
  session_id UUID REFERENCES public.game_sessions(id) ON DELETE SET NULL,
  device TEXT,
  achieved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (mode, pseudo_norm)
);

CREATE INDEX IF NOT EXISTS idx_game_records_mode_score
  ON public.game_records (mode, score DESC);

-- RLS : le backend passe par PostgREST avec la service_role key, qui ne
-- beneficie PAS de BYPASSRLS dans ce mode (cf. migration-021). Sans policy
-- explicite, "deny by default" : SELECT vides et INSERT en 42501.
ALTER TABLE public.game_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_records NO FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role full access" ON public.game_records;
CREATE POLICY "service_role full access"
  ON public.game_records
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ============================================================
-- 3) games_v2.max_players : borne relevee de 8 a 20
--    (contrainte inline de migration-027, recreee par migration-046)
-- ============================================================
ALTER TABLE public.games_v2
  DROP CONSTRAINT IF EXISTS games_v2_max_players_check;
ALTER TABLE public.games_v2
  ADD CONSTRAINT games_v2_max_players_check CHECK (max_players BETWEEN 1 AND 20);

-- ============================================================
-- 4) Seed : jeu "Flappy Bar" dans la categorie Jeux entre tables
--    Inactif (active = false) tant que le front n'est pas deploye : le staff
--    l'allume depuis le back-office.
-- ============================================================
INSERT INTO public.games_v2
  (name, name_en, subtitle, subtitle_en, description, description_en,
   file_name, console_id, platform, display_order, max_players, player_counts,
   game_type, game_url, cover_url, active)
SELECT
  'Flappy Bar', 'Flappy Bar',
  'La course d''oiseaux du bar', 'The bar''s bird race',
  'Flappy Bird multijoueur entre les tables : même parcours pour tous, les autres joueurs en fantômes, records du bar.',
  'Multiplayer Flappy Bird between the tables: same course for everyone, other players as ghosts, bar records.',
  NULL, NULL, ARRAY['Table']::TEXT[], 12, 20, ARRAY['1', '2', '3', '4', '4+']::TEXT[],
  'web', '/table/games/flappybar', NULL, false
WHERE NOT EXISTS (
  SELECT 1 FROM public.games_v2 WHERE game_type = 'web' AND game_url = '/table/games/flappybar'
);

INSERT INTO public.game_category_games_v2 (category_id, game_id)
SELECT c.id, g.id
FROM public.game_categories_v2 c
JOIN public.games_v2 g ON g.game_url = '/table/games/flappybar' AND g.game_type = 'web'
WHERE c.name = 'Jeux entre tables'
ON CONFLICT DO NOTHING;
