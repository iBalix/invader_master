-- Migration 046 : Blackjack multijoueur (mode 'blackjack' + catalogue jusqu'a 8 joueurs)
--
-- CONTEXTE :
--   Deuxieme jeu web en reseau entre tables tactiles, sur le meme moteur de
--   sessions que les echecs. L'etat de partie vit dans game_sessions.runtime
--   (JSONB) : AUCUNE nouvelle table. Le catalogue games_v2 etait borne a 4
--   joueurs (contrainte de l'epoque emulateurs) : on ouvre a 8.
--
-- Idempotent : re-run safe.

-- ============================================================
-- 1) game_sessions.mode accepte 'blackjack'
-- ============================================================
ALTER TABLE public.game_sessions
  DROP CONSTRAINT IF EXISTS game_sessions_mode_check;
ALTER TABLE public.game_sessions
  ADD CONSTRAINT game_sessions_mode_check CHECK (mode IN ('quiz', 'battle', 'chess', 'blackjack'));

-- ============================================================
-- 2) games_v2.max_players : borne relevee de 4 a 8
--    (contrainte inline de migration-027, nom auto : games_v2_max_players_check)
-- ============================================================
ALTER TABLE public.games_v2
  DROP CONSTRAINT IF EXISTS games_v2_max_players_check;
ALTER TABLE public.games_v2
  ADD CONSTRAINT games_v2_max_players_check CHECK (max_players BETWEEN 1 AND 8);

-- ============================================================
-- 3) Seed : jeu "Blackjack" dans la categorie Jeux entre tables
-- ============================================================
INSERT INTO public.games_v2
  (name, name_en, subtitle, subtitle_en, description, description_en,
   file_name, console_id, platform, display_order, max_players, game_type, game_url)
SELECT
  'Blackjack', 'Blackjack',
  'La table de jeu du bar', 'The bar''s card table',
  'Blackjack en direct entre les tables du bar, jusqu''à 8 joueurs : croupier, mises, jokers et coups bas. Spectateurs bienvenus.',
  'Live blackjack between the bar tables, up to 8 players: dealer, bets, jokers and dirty tricks. Spectators welcome.',
  NULL, NULL, ARRAY['Table']::TEXT[], 11, 8, 'web', '/table/games/blackjack'
WHERE NOT EXISTS (
  SELECT 1 FROM public.games_v2 WHERE game_type = 'web' AND game_url = '/table/games/blackjack'
);

INSERT INTO public.game_category_games_v2 (category_id, game_id)
SELECT c.id, g.id
FROM public.game_categories_v2 c
JOIN public.games_v2 g ON g.game_url = '/table/games/blackjack' AND g.game_type = 'web'
WHERE c.name = 'Jeux entre tables'
ON CONFLICT DO NOTHING;
