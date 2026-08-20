-- Migration 045 : Echecs multijoueur (mode 'chess' du moteur de jeu + jeu web au catalogue)
--
-- CONTEXTE :
--   Premier jeu en reseau entre tables tactiles. L'etat de partie (fen, coups,
--   pendules, sieges, resultat) vit dans game_sessions.runtime (JSONB) :
--   AUCUNE nouvelle table de runtime, game_answers n'est pas utilisee.
--   Catalogue : games_v2 apprend a decrire un jeu "web" (route interne du SPA
--   tables) en plus des jeux emulateur (ROM + deeplink retroarch).
--
-- Idempotent : re-run safe.

-- ============================================================
-- 1) game_sessions.mode accepte 'chess'
--    (contrainte inline de migration-039, nom auto : game_sessions_mode_check)
-- ============================================================
ALTER TABLE public.game_sessions
  DROP CONSTRAINT IF EXISTS game_sessions_mode_check;
ALTER TABLE public.game_sessions
  ADD CONSTRAINT game_sessions_mode_check CHECK (mode IN ('quiz', 'battle', 'chess'));

-- ============================================================
-- 2) games_v2 : type de jeu + url web
-- ============================================================
ALTER TABLE public.games_v2 ADD COLUMN IF NOT EXISTS game_type TEXT NOT NULL DEFAULT 'emulator';
ALTER TABLE public.games_v2 ADD COLUMN IF NOT EXISTS game_url TEXT;

ALTER TABLE public.games_v2 DROP CONSTRAINT IF EXISTS games_v2_game_type_check;
ALTER TABLE public.games_v2
  ADD CONSTRAINT games_v2_game_type_check CHECK (game_type IN ('emulator', 'web'));

-- Un jeu web n'a pas de ROM : file_name devient nullable (UNIQUE tolere
-- plusieurs NULL en Postgres). resolveGame() cote backend refuse deja les jeux
-- sans file_name : aucun ordre de lancement ne peut etre cree pour un jeu web.
ALTER TABLE public.games_v2 ALTER COLUMN file_name DROP NOT NULL;

-- Invariants par type : emulator -> ROM requise ; web -> route SPA requise.
ALTER TABLE public.games_v2 DROP CONSTRAINT IF EXISTS games_v2_launch_coherence;
ALTER TABLE public.games_v2
  ADD CONSTRAINT games_v2_launch_coherence CHECK (
    (game_type = 'emulator' AND file_name IS NOT NULL)
    OR (game_type = 'web' AND game_url IS NOT NULL)
  );

-- ============================================================
-- 3) Seed : categorie + jeu "Echecs"
--    Identite du seed = game_url (stable, unique de fait pour les jeux web).
--    IMPORTANT : un jeu sans categorie est INVISIBLE sur les tables
--    (GamesPage groupe par categorie), d'ou le lien seede ici.
-- ============================================================
INSERT INTO public.game_categories_v2 (name, name_en, display_order, icon_name, color)
SELECT 'Jeux entre tables', 'Table vs table', 5, 'Swords', '#8B5CF6'
WHERE NOT EXISTS (
  SELECT 1 FROM public.game_categories_v2 WHERE name = 'Jeux entre tables'
);

INSERT INTO public.games_v2
  (name, name_en, subtitle, subtitle_en, description, description_en,
   file_name, console_id, platform, display_order, max_players, game_type, game_url)
SELECT
  'Échecs', 'Chess',
  'Défie une autre table', 'Challenge another table',
  'Partie d''échecs en direct contre n''importe quelle table du bar. Cadence au choix, spectateurs bienvenus.',
  'Live chess against any table in the bar. Pick your time control, spectators welcome.',
  NULL, NULL, ARRAY['Table']::TEXT[], 10, 2, 'web', '/table/games/chess'
WHERE NOT EXISTS (
  SELECT 1 FROM public.games_v2 WHERE game_type = 'web' AND game_url = '/table/games/chess'
);

INSERT INTO public.game_category_games_v2 (category_id, game_id)
SELECT c.id, g.id
FROM public.game_categories_v2 c
JOIN public.games_v2 g ON g.game_url = '/table/games/chess' AND g.game_type = 'web'
WHERE c.name = 'Jeux entre tables'
ON CONFLICT DO NOTHING;
