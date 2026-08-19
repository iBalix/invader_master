-- Migration 039 : Moteur de jeu (runtime quiz/battle) — game_sessions, game_players, game_answers
--
-- CONTEXTE :
--   Portage des modes de jeu legacy (invader_admin/invader_table) vers invader_master.
--   L'etat de partie vivait dans des fichiers JSON a plat sur le serveur du bar ;
--   il passe en Postgres. Ces tables sont communes aux modes quiz et battle
--   (game_sessions.mode). Les clients (joueurs, ecrans, GM) ne tapent JAMAIS ces
--   tables directement : tout passe par le backend (service_role), la diffusion
--   temps reel se fait par Supabase Realtime broadcast (pas de postgres_changes).
--
-- IDempotent : re-run safe.

-- ============================================================
-- game_sessions : une partie (quiz ou battle)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.game_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mode TEXT NOT NULL DEFAULT 'quiz' CHECK (mode IN ('quiz', 'battle')),
  -- lobby | rules | announce | question | locked | judging | reveal
  -- | leaderboard | cinematic | pause | rewards | end  (quiz)
  -- (le mode battle ajoutera les siens : round_finished, final_round, ...)
  status TEXT NOT NULL DEFAULT 'lobby',
  previous_status TEXT,
  join_code TEXT NOT NULL UNIQUE,
  quiz_id UUID REFERENCES public.quizzes(id) ON DELETE SET NULL,
  -- reglages de la session (defauts geres cote backend) :
  -- announceMs, questionMs, revealDelayMs, speedBonus (bool), qdPerPlayer,
  -- showScoresDuringGame (bool), musicUrl, wifiSsid, wifiPassword, ...
  config JSONB NOT NULL DEFAULT '{}',
  -- ordre des questions fige au demarrage (array d'UUID) + snapshot leger
  question_order JSONB NOT NULL DEFAULT '[]',
  current_question_index INTEGER NOT NULL DEFAULT -1,
  phase_started_at TIMESTAMPTZ,
  phase_ends_at TIMESTAMPTZ,
  -- etat volatile de la phase courante : reveal (resultats, fastest, percents),
  -- activations quitte-ou-double de la question, etape de cinematique,
  -- verdicts IA en attente de validation GM, mentions de fin, ...
  runtime JSONB NOT NULL DEFAULT '{}',
  -- incremente a CHAQUE mutation ; transporte par les events realtime,
  -- les clients resynchronisent si leur version ne suit pas
  state_version INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_game_sessions_active
  ON public.game_sessions (created_at DESC)
  WHERE ended_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_game_sessions_join_code
  ON public.game_sessions (join_code);

-- ============================================================
-- game_players : un joueur (ou une equipe = un pseudo) dans une session
-- ============================================================
CREATE TABLE IF NOT EXISTS public.game_players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  pseudo TEXT NOT NULL,
  pseudo_norm TEXT NOT NULL, -- lower(trim(pseudo)) pour unicite insensible a la casse
  device TEXT NOT NULL DEFAULT 'mobile', -- mobile | TABLExx-y
  -- secret remis au client a l'inscription (localStorage) ; permet la reprise
  -- de session apres refresh / rescan du QR
  player_token TEXT NOT NULL,
  score INTEGER NOT NULL DEFAULT 0,
  -- active | eliminated | waiting (battle) | removed
  status TEXT NOT NULL DEFAULT 'active',
  -- stocks de bonus joueur, ex {"qdLeft": 2}
  bonuses JSONB NOT NULL DEFAULT '{}',
  -- stats de partie : strike, bestStrike, correctCount, answerCount, totalTimeMs
  stats JSONB NOT NULL DEFAULT '{}',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (session_id, pseudo_norm)
);

CREATE INDEX IF NOT EXISTS idx_game_players_session
  ON public.game_players (session_id);

-- ============================================================
-- game_answers : une reponse d'un joueur a une question
-- L'unicite (session, joueur, question) rend le POST reponse idempotent :
-- le client peut reessayer sans risque de doublon.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.game_answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES public.game_players(id) ON DELETE CASCADE,
  question_index INTEGER NOT NULL,
  -- {"choice": 2} (qcm) | {"number": 1969} (estimation) | {"text": "..."} (reponse libre)
  answer JSONB NOT NULL,
  -- temps de reponse mesure COTE CLIENT (affichage effectif -> clic), en ms.
  -- Insensible a la latence reseau ; plausibilite verifiee cote serveur.
  elapsed_ms INTEGER,
  -- bonus joueur actif sur cette question ('quitte_double' | null)
  bonus TEXT,
  -- remplis a la revelation (jamais avant) :
  is_correct BOOLEAN,
  points_awarded INTEGER,
  -- verdict du juge IA pour les reponses libres :
  -- {"accepted": bool, "source": "exact"|"fuzzy"|"ai"|"gm", "reason": "..."}
  ai_verdict JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (session_id, player_id, question_index)
);

CREATE INDEX IF NOT EXISTS idx_game_answers_session_question
  ON public.game_answers (session_id, question_index);

-- ============================================================
-- RLS : deny by default + service_role full access (pattern migration-021).
-- Aucune policy anon/authenticated : les clients passent par le backend.
-- ============================================================
ALTER TABLE public.game_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_players  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_answers  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.game_sessions NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.game_players  NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.game_answers  NO FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role full access" ON public.game_sessions;
DROP POLICY IF EXISTS "service_role full access" ON public.game_players;
DROP POLICY IF EXISTS "service_role full access" ON public.game_answers;

CREATE POLICY "service_role full access"
  ON public.game_sessions FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "service_role full access"
  ON public.game_players FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "service_role full access"
  ON public.game_answers FOR ALL TO service_role
  USING (true) WITH CHECK (true);
