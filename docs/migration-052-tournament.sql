-- Migration 052 : gestionnaire d'evenements, premier mode « tournoi en rondes suisses »
--
-- CONTEXTE :
--   Nouveau mode de session 'tournament' sur le moteur de jeu commun (etat
--   complet dans game_sessions.runtime.tournament, joueurs dans game_players,
--   diffusion par le signal 'sync' habituel). Les resultats des matchs sont
--   remontes automatiquement depuis les parties d'echecs des tables.
--   Les configurations d'evenement se sauvegardent sous un nom pour etre
--   relancees en un clic : c'est la table competition_templates. Elle ne
--   s'appelle pas « events » : ce nom est deja pris par l'agenda d'affichage
--   (table events, page Contenus > Evenements), sans rapport avec les sessions.
--
-- ORDRE : a appliquer AVANT le deploiement du code qui cree des sessions
--   'tournament' (la contrainte de mode refuserait l'insert). Sans effet sur
--   l'existant : rien ne lit la nouvelle table ni le nouveau mode avant ce code.
--
-- Idempotent : re-run safe.

-- ============================================================
-- 1) game_sessions.mode accepte 'tournament'
-- ============================================================
ALTER TABLE public.game_sessions
  DROP CONSTRAINT IF EXISTS game_sessions_mode_check;
ALTER TABLE public.game_sessions
  ADD CONSTRAINT game_sessions_mode_check
  CHECK (mode IN ('quiz', 'battle', 'chess', 'blackjack', 'flappybar', 'tournament'));

-- ============================================================
-- 2) competition_templates : configurations d'evenement enregistrees
--    config JSONB : TournamentConfig (backend/src/games/tournament/types.ts),
--    validee et completee par le backend a chaque lancement.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.competition_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'tournament',
  config JSONB NOT NULL DEFAULT '{}',
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_competition_templates_name
  ON public.competition_templates (lower(name));

-- RLS : le backend passe par PostgREST avec la service_role key, qui ne
-- beneficie PAS de BYPASSRLS dans ce mode (cf. migration-021). Sans policy
-- explicite, « deny by default » : SELECT vides et INSERT en 42501.
ALTER TABLE public.competition_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.competition_templates NO FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role full access" ON public.competition_templates;
CREATE POLICY "service_role full access"
  ON public.competition_templates
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ============================================================
-- 3) Index : sessions d'un mode, les plus recentes d'abord
--    Sert la console (GET /api/game?mode=), le lookup des tables et le
--    rattrapage des resultats d'echecs (parties creees depuis le tirage).
--    Chaque partie et chaque revanche d'echecs cree une session : sans filtre
--    par mode, la liste des 20 dernieres ne contenait plus la session active.
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_game_sessions_mode_created
  ON public.game_sessions (mode, created_at DESC);

-- ============================================================
-- 4) Permissions : console du gestionnaire d'evenements pour le role salarie
--    (l'admin a tout en code)
-- ============================================================
INSERT INTO public.role_permissions (role, page_key) VALUES
  ('salarie', 'evenements/gestionnaire')
ON CONFLICT DO NOTHING;
