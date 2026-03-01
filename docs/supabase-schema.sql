-- Invader Master - Schéma Supabase
-- À exécuter dans l'éditeur SQL du projet Supabase

-- Table profiles (liée à auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT 'salarie'
    CHECK (role IN ('admin', 'salarie', 'externe')),
  display_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trigger auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS profiles_updated_at ON public.profiles;
CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS (filet de sécurité ; le backend utilise service_role_key qui bypass RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Chaque user peut lire son propre profil
DROP POLICY IF EXISTS "Users read own profile" ON public.profiles;
CREATE POLICY "Users read own profile"
  ON public.profiles FOR SELECT
  USING (id = auth.uid());

-- Les admins peuvent lire tous les profils
DROP POLICY IF EXISTS "Admins read all profiles" ON public.profiles;
CREATE POLICY "Admins read all profiles"
  ON public.profiles FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

-- Insert/Update/Delete : pas de policy côté client, tout passe par le backend (service_role)

-- Storage bucket (à créer depuis le dashboard si nécessaire)
-- INSERT INTO storage.buckets (id, name, public)
-- VALUES ('invader-assets', 'invader-assets', false)
-- ON CONFLICT (id) DO NOTHING;
