-- Migration 015: Role permissions table
-- Stocke les pages autorisees par role (admin a tout par defaut en code)

CREATE TABLE IF NOT EXISTS role_permissions (
  role TEXT NOT NULL,
  page_key TEXT NOT NULL,
  PRIMARY KEY (role, page_key)
);

-- Seed: permissions initiales
INSERT INTO role_permissions (role, page_key) VALUES
  ('salarie', 'dashboard'),
  ('salarie', 'gestion-bar'),
  ('salarie', 'contenus/quiz'),
  ('salarie', 'evenements/battle-questions'),
  ('externe', 'contenus/quiz')
ON CONFLICT DO NOTHING;
