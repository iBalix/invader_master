-- Migration 055 : Bar Invaders multijoueur (mode 'barinvaders' + seed catalogue)
--
-- PREREQUIS : migrations 051 (table game_records) et 053/054 (catalogue
--   renomme sans _v2 : games, game_categories, game_category_games).
--
-- CONTEXTE :
--   Quatrieme jeu web en reseau entre tables tactiles, sur le meme moteur de
--   sessions que les echecs, le blackjack et Flappy Bar : une reprise de Space
--   Invaders (Taito 1978) ou chaque joueur joue SA partie sur SA dalle, avec
--   les adversaires dans un panneau lateral. L'etat de partie vit dans
--   game_sessions.runtime (JSONB), les entrees en direct ne touchent jamais la
--   base (WebSocket + memoire serveur). Les records du bar reutilisent
--   game_records (mode 'barinvaders', unite 'pts') : rien a creer.
--
-- A APPLIQUER AVANT le deploiement du code (ou de tout test local, le .env
--   pointant sur la prod) : sans le nouveau mode, la creation d'une partie est
--   refusee par la contrainte game_sessions_mode_check.
--
-- Idempotent : re-run safe.

-- ============================================================
-- 1) game_sessions.mode accepte 'barinvaders'
--    (liste de la migration 052 + le nouveau mode)
-- ============================================================
ALTER TABLE public.game_sessions
  DROP CONSTRAINT IF EXISTS game_sessions_mode_check;
ALTER TABLE public.game_sessions
  ADD CONSTRAINT game_sessions_mode_check
  CHECK (mode IN ('quiz', 'battle', 'chess', 'blackjack', 'flappybar', 'tournament', 'barinvaders'));

-- ============================================================
-- 2) Seed : jeu "Bar Invaders" dans la categorie Jeux entre tables
--    Inactif (active = false) : invisible des clients, joignable par URL
--    directe pour les tests ; le staff l'allume depuis le back-office.
-- ============================================================
INSERT INTO public.games
  (name, name_en, subtitle, subtitle_en, description, description_en,
   file_name, console_id, platform, display_order, max_players, player_counts,
   game_type, game_url, cover_url, active)
SELECT
  'Bar Invaders', 'Bar Invaders',
  'L''invasion du bar', 'The bar invasion',
  'Space Invaders multijoueur entre les tables : chacun défend sa base sur sa dalle, les adversaires s''affichent sur le côté (score, vies, en jeu ou non), le meilleur score de la manche l''emporte. Records du bar.',
  'Multiplayer Space Invaders between the tables: everyone defends their base on their own screen, rivals are shown on the side (score, lives, still in or not), the best score of the round wins. Bar records.',
  NULL, NULL, ARRAY['Table']::TEXT[], 13, 8, ARRAY['1', '2', '3', '4', '4+']::TEXT[],
  'web', '/table/games/barinvaders', NULL, false
WHERE NOT EXISTS (
  SELECT 1 FROM public.games WHERE game_type = 'web' AND game_url = '/table/games/barinvaders'
);

INSERT INTO public.game_category_games (category_id, game_id)
SELECT c.id, g.id
FROM public.game_categories c
JOIN public.games g ON g.game_url = '/table/games/barinvaders' AND g.game_type = 'web'
WHERE c.name = 'Jeux entre tables'
ON CONFLICT DO NOTHING;
