-- Migration 053 : la carte v2 et les jeux v2 deviennent LA carte et LES jeux
--
-- POURQUOI. La v2 avait ete construite a cote de la v1 pour basculer
-- progressivement. Tout est desormais branche dessus (tables tactiles, site
-- invader.bar, back-office) : la v1 n'est plus lue par personne et le suffixe
-- "_v2" n'a plus de sens.
--
-- CE QUE FAIT CE FICHIER (un seul bloc, donc une seule transaction) :
--   1. Detache table_order_items de l'ancienne carte (sa FK visait
--      menu_products v1, alors que les tables commandent des produits v2).
--   2. Supprime les 8 tables v1 : menu_categories, menu_products,
--      category_products, game_categories, game_consoles, games, game_images,
--      game_category_games. Sans CASCADE : une dependance inattendue fait
--      echouer la migration au lieu de disparaitre en silence.
--   3. Renomme les 12 tables v2 en retirant "_v2" du nom, ainsi que leurs
--      contraintes, index et triggers (meme regle) :
--        menu_categories_v2       -> menu_categories
--        menu_products_v2         -> menu_products
--        category_products_v2     -> category_products
--        product_v2_conditionings -> product_conditionings
--        product_v2_variants      -> product_variants
--        product_v2_tags          -> product_tags
--        product_v2_product_tags  -> product_product_tags
--        game_categories_v2       -> game_categories
--        game_consoles_v2         -> game_consoles
--        games_v2                 -> games
--        game_images_v2           -> game_images
--        game_category_games_v2   -> game_category_games
--      Les policies RLS ont des noms generiques ("anon read"...) et suivent
--      la table.
--   4. Rebranche table_order_items.product_id sur la nouvelle menu_products
--      (les lignes qui visaient un produit v1 passent a NULL, product_name
--      garde le libelle).
--   5. Cree une vue de compatibilite par ancien nom (games_v2, ...) pour le
--      backend encore en ligne pendant le build Railway. Vues simples donc
--      modifiables, security_invoker pour garder la RLS de la table.
--
-- ORDRE DE DEPLOIEMENT : appliquer 053, pousser main, attendre que Railway
-- serve le nouveau backend, puis appliquer 054 (suppression des vues).
--
-- Re-run safe : ne fait rien si games_v2 / menu_products_v2 ne sont plus des
-- tables (sinon un second passage supprimerait les tables renommees).

DO $$
DECLARE
  ancien text;
  nouveau text;
  r record;
BEGIN
  IF (SELECT relkind FROM pg_class WHERE oid = to_regclass('public.games_v2')) IS DISTINCT FROM 'r'
     OR (SELECT relkind FROM pg_class WHERE oid = to_regclass('public.menu_products_v2')) IS DISTINCT FROM 'r' THEN
    RAISE NOTICE 'Migration 053 deja appliquee : rien a faire';
    RETURN;
  END IF;

  -- 1. Detacher les commandes de la carte v1
  ALTER TABLE public.table_order_items DROP CONSTRAINT IF EXISTS table_order_items_product_id_fkey;

  -- 2. Suppression de la v1
  DROP TABLE public.category_products,
             public.menu_products,
             public.menu_categories,
             public.game_category_games,
             public.game_images,
             public.games,
             public.game_categories,
             public.game_consoles;

  -- 3 + 5. Renommage de la v2 et vues de compatibilite
  FOREACH ancien IN ARRAY ARRAY[
    'menu_categories_v2', 'menu_products_v2', 'category_products_v2',
    'product_v2_conditionings', 'product_v2_variants', 'product_v2_tags',
    'product_v2_product_tags',
    'game_categories_v2', 'game_consoles_v2', 'games_v2', 'game_images_v2',
    'game_category_games_v2'
  ] LOOP
    nouveau := replace(ancien, '_v2', '');
    EXECUTE format('ALTER TABLE public.%I RENAME TO %I', ancien, nouveau);

    -- Renommer une contrainte PK/UNIQUE renomme aussi son index.
    FOR r IN
      SELECT conname FROM pg_constraint
      WHERE conrelid = format('public.%I', nouveau)::regclass AND strpos(conname, '_v2') > 0
    LOOP
      EXECUTE format('ALTER TABLE public.%I RENAME CONSTRAINT %I TO %I',
                     nouveau, r.conname, replace(r.conname, '_v2', ''));
    END LOOP;

    FOR r IN
      SELECT c.relname FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
      WHERE i.indrelid = format('public.%I', nouveau)::regclass AND strpos(c.relname, '_v2') > 0
    LOOP
      EXECUTE format('ALTER INDEX public.%I RENAME TO %I', r.relname, replace(r.relname, '_v2', ''));
    END LOOP;

    FOR r IN
      SELECT tgname FROM pg_trigger
      WHERE tgrelid = format('public.%I', nouveau)::regclass AND NOT tgisinternal AND strpos(tgname, '_v2') > 0
    LOOP
      EXECUTE format('ALTER TRIGGER %I ON public.%I RENAME TO %I',
                     r.tgname, nouveau, replace(r.tgname, '_v2', ''));
    END LOOP;

    EXECUTE format('CREATE VIEW public.%I WITH (security_invoker = true) AS SELECT * FROM public.%I',
                   ancien, nouveau);
  END LOOP;

  -- 4. Rebrancher les commandes sur la carte
  EXECUTE 'UPDATE public.table_order_items oi SET product_id = NULL
           WHERE oi.product_id IS NOT NULL
             AND NOT EXISTS (SELECT 1 FROM public.menu_products p WHERE p.id = oi.product_id)';
  EXECUTE 'ALTER TABLE public.table_order_items
           ADD CONSTRAINT table_order_items_product_id_fkey
           FOREIGN KEY (product_id) REFERENCES public.menu_products(id) ON DELETE SET NULL';
END $$;
