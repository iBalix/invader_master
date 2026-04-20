-- Migration 019 : ajout d'une video optionnelle sur les produits de la carte
--
-- Permet d'associer une video (uploadee via /api/upload, hebergee dans le bucket
-- Supabase Storage `invader-assets`, dossier `videos/`) a un produit. Cette video
-- est affichee dans la modal detail produit cote tables tactiles, puis remplacee
-- par image_url via un fondu ~0.5s avant la fin.
--
-- Idempotent.

ALTER TABLE menu_products
  ADD COLUMN IF NOT EXISTS video_url TEXT;

COMMENT ON COLUMN menu_products.video_url IS
  'URL publique d''une video (mp4/webm) jouee dans la modal detail produit sur les tables tactiles. Null = pas de video.';
