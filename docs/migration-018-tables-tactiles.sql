-- Migration 018: Tables tactiles V2
-- Renommage projector_events -> events, nouvelles tables :
--   live_event_state (singleton)
--   table_devices, table_screensaver_featured, table_home_featured
--   coupons, table_orders, table_order_items
--
-- A executer dans le SQL Editor du dashboard Supabase.

-- ============================================================
-- 0. Renommage projector_events -> events
-- (la table devient generique : sert au projecteur ET aux tables tactiles)
-- ============================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'projector_events')
     AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'events') THEN
    ALTER TABLE public.projector_events RENAME TO events;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.triggers WHERE event_object_schema = 'public' AND event_object_table = 'events' AND trigger_name = 'projector_events_updated_at') THEN
    ALTER TRIGGER projector_events_updated_at ON public.events RENAME TO events_updated_at;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_projector_events_date') THEN
    ALTER INDEX public.idx_projector_events_date RENAME TO idx_events_date;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_projector_events_contentful') THEN
    ALTER INDEX public.idx_projector_events_contentful RENAME TO idx_events_contentful;
  END IF;
END $$;

-- Ajout d'une colonne optionnelle pour rendre le teaser cliquable depuis les tables (V2)
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS cta_redirect_url TEXT;

-- ============================================================
-- 1. live_event_state (singleton, 1 seul row id=1)
-- Maintient l'etat live de l'event en cours (declenche par invader_admin)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.live_event_state (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  is_live BOOLEAN NOT NULL DEFAULT false,
  event_type TEXT,
  event_label TEXT,
  redirect_url TEXT,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  updated_by TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO public.live_event_state (id, is_live)
VALUES (1, false)
ON CONFLICT (id) DO NOTHING;

DROP TRIGGER IF EXISTS live_event_state_updated_at ON public.live_event_state;
CREATE TRIGGER live_event_state_updated_at
  BEFORE UPDATE ON public.live_event_state
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE public.live_event_state ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 2. table_devices
-- Tables tactiles enregistrees (1 row par hostname TABLEXX-1/-2)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.table_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hostname TEXT UNIQUE NOT NULL,
  table_number TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('master', 'slave')),
  display_name TEXT,
  inactivity_timeout_ms INTEGER NOT NULL DEFAULT 90000,
  active BOOLEAN NOT NULL DEFAULT true,
  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_table_devices_hostname ON public.table_devices(hostname);
CREATE INDEX IF NOT EXISTS idx_table_devices_table_number ON public.table_devices(table_number);

DROP TRIGGER IF EXISTS table_devices_updated_at ON public.table_devices;
CREATE TRIGGER table_devices_updated_at
  BEFORE UPDATE ON public.table_devices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE public.table_devices ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 3. table_screensaver_featured
-- Items mis en avant ecran de veille (carrousel)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.table_screensaver_featured (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  position INTEGER NOT NULL DEFAULT 0,
  title TEXT NOT NULL,
  subtitle TEXT,
  image_url TEXT NOT NULL,
  lottie_url TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_table_screensaver_featured_position ON public.table_screensaver_featured(position);

DROP TRIGGER IF EXISTS table_screensaver_featured_updated_at ON public.table_screensaver_featured;
CREATE TRIGGER table_screensaver_featured_updated_at
  BEFORE UPDATE ON public.table_screensaver_featured
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE public.table_screensaver_featured ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 4. table_home_featured
-- Items mis en avant ecran d'accueil (carrousel)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.table_home_featured (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  position INTEGER NOT NULL DEFAULT 0,
  title TEXT NOT NULL,
  subtitle TEXT,
  image_url TEXT,
  cta_label TEXT,
  cta_target TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_table_home_featured_position ON public.table_home_featured(position);

DROP TRIGGER IF EXISTS table_home_featured_updated_at ON public.table_home_featured;
CREATE TRIGGER table_home_featured_updated_at
  BEFORE UPDATE ON public.table_home_featured
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE public.table_home_featured ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 5. coupons
-- Codes promo utilisables au passage de commande
-- ============================================================
CREATE TABLE IF NOT EXISTS public.coupons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  description TEXT,
  discount_type TEXT NOT NULL CHECK (discount_type IN ('percentage', 'amount')),
  discount_value NUMERIC(10,2) NOT NULL,
  min_order_amount NUMERIC(10,2),
  valid_from TIMESTAMPTZ,
  valid_until TIMESTAMPTZ,
  max_uses INTEGER,
  current_uses INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_coupons_code ON public.coupons(code);

DROP TRIGGER IF EXISTS coupons_updated_at ON public.coupons;
CREATE TRIGGER coupons_updated_at
  BEFORE UPDATE ON public.coupons
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 6. table_orders + table_order_items
-- Commandes passees depuis les tables (V1 stub, V2 = KDS)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.table_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number SERIAL,
  hostname TEXT NOT NULL,
  table_number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'received'
    CHECK (status IN ('received', 'preparing', 'ready', 'delivered', 'cancelled')),
  payment_method TEXT CHECK (payment_method IN ('card', 'cash')),
  subtotal NUMERIC(10,2) NOT NULL,
  happy_hour_discount NUMERIC(10,2) NOT NULL DEFAULT 0,
  coupon_id UUID REFERENCES public.coupons(id) ON DELETE SET NULL,
  coupon_code TEXT,
  coupon_discount NUMERIC(10,2) NOT NULL DEFAULT 0,
  total NUMERIC(10,2) NOT NULL,
  customer_note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  ready_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_table_orders_status ON public.table_orders(status);
CREATE INDEX IF NOT EXISTS idx_table_orders_hostname ON public.table_orders(hostname);
CREATE INDEX IF NOT EXISTS idx_table_orders_created_at ON public.table_orders(created_at DESC);

ALTER TABLE public.table_orders ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.table_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.table_orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.menu_products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(10,2) NOT NULL,
  applied_price NUMERIC(10,2) NOT NULL,
  happy_hour_applied BOOLEAN NOT NULL DEFAULT false,
  subtotal NUMERIC(10,2) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_table_order_items_order ON public.table_order_items(order_id);

ALTER TABLE public.table_order_items ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 7. Permissions back-office (page_keys nouvelles pages tables tactiles + events)
-- ============================================================
-- Aucun seed obligatoire : les admins ont tout, les autres roles
-- recevront leurs permissions via la page Gestion des users.
-- Les nouvelles cles seront automatiquement disponibles dans la liste
-- ALL_PAGES (cf. usePermissions.tsx + rolePermissions.ts).

-- ============================================================
-- 8. RLS policies (service_role bypass + lecture publique sur les rows actifs)
-- Sans ces policies + si FORCE RLS est active manuellement sur une table,
-- meme la service_role est bloquee a l'INSERT (erreur 42501). On rend tout
-- explicite et idempotent ici.
-- ============================================================

-- table_screensaver_featured
ALTER TABLE public.table_screensaver_featured NO FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role full access" ON public.table_screensaver_featured;
DROP POLICY IF EXISTS "anon read active" ON public.table_screensaver_featured;
DROP POLICY IF EXISTS "authenticated read" ON public.table_screensaver_featured;
CREATE POLICY "service_role full access" ON public.table_screensaver_featured
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "anon read active" ON public.table_screensaver_featured
  FOR SELECT TO anon USING (active = true);
CREATE POLICY "authenticated read" ON public.table_screensaver_featured
  FOR SELECT TO authenticated USING (true);

-- table_home_featured
ALTER TABLE public.table_home_featured NO FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role full access" ON public.table_home_featured;
DROP POLICY IF EXISTS "anon read active" ON public.table_home_featured;
DROP POLICY IF EXISTS "authenticated read" ON public.table_home_featured;
CREATE POLICY "service_role full access" ON public.table_home_featured
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "anon read active" ON public.table_home_featured
  FOR SELECT TO anon USING (active = true);
CREATE POLICY "authenticated read" ON public.table_home_featured
  FOR SELECT TO authenticated USING (true);

-- live_event_state
ALTER TABLE public.live_event_state NO FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role full access" ON public.live_event_state;
DROP POLICY IF EXISTS "anon read" ON public.live_event_state;
DROP POLICY IF EXISTS "authenticated read" ON public.live_event_state;
CREATE POLICY "service_role full access" ON public.live_event_state
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "anon read" ON public.live_event_state
  FOR SELECT TO anon USING (true);
CREATE POLICY "authenticated read" ON public.live_event_state
  FOR SELECT TO authenticated USING (true);

-- table_devices
ALTER TABLE public.table_devices NO FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role full access" ON public.table_devices;
DROP POLICY IF EXISTS "authenticated read" ON public.table_devices;
CREATE POLICY "service_role full access" ON public.table_devices
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "authenticated read" ON public.table_devices
  FOR SELECT TO authenticated USING (true);

-- coupons
ALTER TABLE public.coupons NO FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role full access" ON public.coupons;
DROP POLICY IF EXISTS "authenticated read" ON public.coupons;
CREATE POLICY "service_role full access" ON public.coupons
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "authenticated read" ON public.coupons
  FOR SELECT TO authenticated USING (true);

-- table_orders
ALTER TABLE public.table_orders NO FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role full access" ON public.table_orders;
DROP POLICY IF EXISTS "authenticated read" ON public.table_orders;
CREATE POLICY "service_role full access" ON public.table_orders
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "authenticated read" ON public.table_orders
  FOR SELECT TO authenticated USING (true);

-- table_order_items
ALTER TABLE public.table_order_items NO FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role full access" ON public.table_order_items;
DROP POLICY IF EXISTS "authenticated read" ON public.table_order_items;
CREATE POLICY "service_role full access" ON public.table_order_items
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "authenticated read" ON public.table_order_items
  FOR SELECT TO authenticated USING (true);

-- Fin migration 018
