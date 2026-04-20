/**
 * Ecran carte (DA V3 launcher glass).
 *
 * Layout :
 *   - Header transparent : back + titre + happy hour badge
 *   - Sidebar gauche moderne (LauncherSidebar) sans scroll
 *   - Centre : panel, grid de produits
 *   - Click produit = ouvre ProductDetailModal
 *   - Bouton + sur la card = ajoute direct au panier
 *   - Bouton flottant panier (gradient violet, glow)
 *   - Drawer panier + modale paiement
 */

import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Beer } from 'lucide-react';
import { useHostname } from '../hooks/useHostname';
import { useCarte, type MenuCategory, type MenuProduct } from '../hooks/useCarte';
import { useCart } from '../store/cartStore';
import { useT } from '../i18n/useT';
import HeaderBar from '../components/layout/HeaderBar';
import BackButton from '../components/layout/BackButton';
import LauncherSidebar, { type SidebarEntry } from '../components/layout/LauncherSidebar';
import ProductCard from '../components/menu/ProductCard';
import ProductDetailModal from '../components/menu/ProductDetailModal';
import CartDrawer from '../components/menu/CartDrawer';
import CheckoutModal from '../components/menu/CheckoutModal';
import RetroLoader from '../components/ui/RetroLoader';
import AnimatedGrid, { AnimatedGridItem } from '../components/ui/AnimatedGrid';
import { EASE_OUT_QUART } from '../lib/motion';
import type { PricedCart } from '../types';

function findCategory(cats: MenuCategory[], id: string): MenuCategory | null {
  for (const c of cats) {
    if (c.id === id) return c;
    for (const sc of c.subCategories ?? []) {
      if (sc.id === id) return sc;
    }
  }
  return null;
}

/**
 * Retourne les produits d'une categorie + ceux de toutes ses sous-categories
 * (dedupliques par id). Permet a l'utilisateur de cliquer sur une categorie
 * "parente" et de voir l'ensemble des produits qu'elle regroupe.
 */
function getCategoryProducts(cat: MenuCategory | null): MenuProduct[] {
  if (!cat) return [];
  const seen = new Set<string>();
  const out: MenuProduct[] = [];
  const push = (p: MenuProduct) => {
    const id = String(p.id);
    if (seen.has(id)) return;
    seen.add(id);
    out.push(p);
  };
  (cat.products ?? []).forEach(push);
  (cat.subCategories ?? []).forEach((sc) => (sc.products ?? []).forEach(push));
  return out;
}

/**
 * Detecte une categorie "Happy Hour" par son nom (case + accent insensitive).
 * Couvre "Happy Hour", "HappyHour", "Happy", "HH", etc.
 */
function isHappyHourCategory(name: string): boolean {
  const n = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
  return n.includes('happy') || n === 'hh';
}

/**
 * Fenetre d'affichage de la categorie Happy Hour : lundi a vendredi,
 * 17h30 -> 19h00. En dehors, la categorie est cachee de la sidebar.
 */
function isHappyHourCategoryWindow(now: Date): boolean {
  const day = now.getDay(); // 0 = dim, 1..5 = lun-ven, 6 = sam
  if (day < 1 || day > 5) return false;
  const minutes = now.getHours() * 60 + now.getMinutes();
  return minutes >= 17 * 60 + 30 && minutes < 19 * 60;
}

/**
 * Construit la liste affichee dans la sidebar (mode accordeon) :
 *   - Toujours toutes les categories de profondeur 0 visibles (avec un
 *     chevron si elles ont des sous-categories).
 *   - Les sous-categories sont injectees uniquement pour la categorie
 *     parente actuellement depliee (`openParentId`).
 * Les categories Happy Hour sont masquees hors fenetre (lun-ven 17h30-19h).
 */
function flattenCategories(
  cats: MenuCategory[],
  now: Date,
  openParentId: string | null,
): SidebarEntry[] {
  const inWindow = isHappyHourCategoryWindow(now);
  const out: SidebarEntry[] = [];
  for (const c of cats) {
    const isHH = isHappyHourCategory(c.name);
    if (isHH && !inWindow) continue; // cachee hors fenetre
    const subs = c.subCategories ?? [];
    const visibleSubs = subs.filter(
      (sc) => !(isHappyHourCategory(sc.name) && !inWindow),
    );
    const hasChildren = visibleSubs.length > 0;
    const expanded = hasChildren && c.id === openParentId;
    out.push({
      id: c.id,
      name: c.name,
      count: c.products?.length ?? 0,
      imageUrl: c.imageUrl,
      emoji: c.iconEmoji,
      depth: 0,
      pulse: isHH,
      hasChildren,
      expanded,
    });
    if (expanded) {
      for (const sc of visibleSubs) {
        out.push({
          id: sc.id,
          name: sc.name,
          count: sc.products?.length ?? 0,
          imageUrl: sc.imageUrl,
          emoji: sc.iconEmoji,
          depth: 1,
          pulse: isHappyHourCategory(sc.name),
        });
      }
    }
  }
  return out;
}

/**
 * Fenetre Happy Hour cote client (badge + prix barre dans listing/modale).
 * Doit rester alignee avec :
 *   - isHappyHourCategoryWindow (visibilite categorie)
 *   - backend isHappyHourNow (calcul du prix applique)
 */
function isHappyHourClient(now: Date): boolean {
  const day = now.getDay();
  if (day < 1 || day > 5) return false;
  const minutes = now.getHours() * 60 + now.getMinutes();
  return minutes >= 17 * 60 + 30 && minutes < 19 * 60;
}

export default function MenuPage() {
  const identity = useHostname();
  const { loading, categories, error } = useCarte();
  const { items, add, totalQty } = useCart();
  const t = useT();

  const [currentId, setCurrentId] = useState<string | null>(null);
  const [openParentId, setOpenParentId] = useState<string | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [checkout, setCheckout] = useState<PricedCart | null>(null);
  const [detailProduct, setDetailProduct] = useState<MenuProduct | null>(null);

  // Tick toutes les minutes pour reevaluer la fenetre Happy Hour (17h30-19h)
  // sans avoir a recharger la page.
  const [now, setNow] = useState<Date>(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const happyHour = useMemo(() => isHappyHourClient(now), [now]);

  useEffect(() => {
    if (!currentId && categories.length > 0) {
      setCurrentId(categories[0].id);
    }
  }, [categories, currentId]);

  const currentCategory = currentId ? findCategory(categories, currentId) : null;
  const products: MenuProduct[] = useMemo(
    () => getCategoryProducts(currentCategory),
    [currentCategory]
  );
  const sidebarEntries = useMemo(
    () => flattenCategories(categories, now, openParentId),
    [categories, now, openParentId]
  );

  // Set des ids actuellement exposables (filtre Happy Hour applique a tous les
  // niveaux), independamment de l'etat deplie/replie de la sidebar. Sert a
  // detecter quand une categorie selectionnee disparait reellement (ex: la
  // fenetre Happy Hour vient de se fermer).
  const exposedIds = useMemo(() => {
    const ids = new Set<string>();
    const inWindow = isHappyHourCategoryWindow(now);
    for (const c of categories) {
      if (isHappyHourCategory(c.name) && !inWindow) continue;
      ids.add(c.id);
      for (const sc of c.subCategories ?? []) {
        if (isHappyHourCategory(sc.name) && !inWindow) continue;
        ids.add(sc.id);
      }
    }
    return ids;
  }, [categories, now]);

  /**
   * Clic sur une entree de la sidebar (mode accordeon) :
   *   - Categorie de profondeur 0 avec sous-categories : toggle l'accordeon
   *     (replie les autres) et selectionne la categorie parente.
   *   - Categorie de profondeur 0 sans sous-categories : selectionne et
   *     replie tout.
   *   - Sous-categorie : selectionne, garde le parent ouvert.
   */
  function handleSelectCategory(id: string) {
    const isTopLevel = categories.some((c) => c.id === id);
    if (isTopLevel) {
      const cat = categories.find((c) => c.id === id);
      const hasChildren = (cat?.subCategories?.length ?? 0) > 0;
      if (hasChildren) {
        setOpenParentId((prev) => (prev === id ? null : id));
      } else {
        setOpenParentId(null);
      }
    }
    setCurrentId(id);
  }

  // Si la categorie selectionnee est masquee (ex: Happy Hour passee 19h),
  // bascule automatiquement sur la premiere categorie visible. NE PAS se baser
  // sur sidebarEntries (qui filtre selon openParentId) pour ne pas perdre la
  // selection d'une sous-categorie quand on replie son parent.
  useEffect(() => {
    if (!currentId || sidebarEntries.length === 0) return;
    if (!exposedIds.has(currentId)) {
      setCurrentId(sidebarEntries[0].id);
      setOpenParentId(null);
    }
  }, [currentId, sidebarEntries, exposedIds]);

  const qtyByProduct = useMemo(() => {
    const map = new Map<string, number>();
    items.forEach((i) => map.set(String(i.productId), i.qty));
    return map;
  }, [items]);

  function addProduct(p: MenuProduct, qty: number) {
    add(
      {
        productId: p.id,
        name: p.name,
        unitPrice: Number(p.price ?? 0),
        imageUrl: p.imageUrl ?? undefined,
      },
      qty
    );
  }

  return (
    <div className="relative flex h-full w-full flex-col px-8 py-6">
      <HeaderBar
        title={t('table.menu.title').toUpperCase()}
        left={<BackButton />}
        right={
          happyHour ? (
            <span className="flex items-center gap-2 rounded-full border border-table-yellow/40 bg-table-yellow/15 px-4 py-2 font-display text-sm uppercase tracking-widest text-table-yellow">
              <span className="h-1.5 w-1.5 rounded-full bg-table-yellow" />
              {t('table.menu.cart.happyhour')}
            </span>
          ) : null
        }
      />

      <div className="mt-5 flex min-h-0 flex-1 gap-5">
        <LauncherSidebar
          title={t('table.menu.categories', 'Categories')}
          accent="violet"
          entries={sidebarEntries}
          currentId={currentId}
          onSelect={handleSelectCategory}
          showCount={false}
          showCategoryDividers
        />

        <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl border border-white/10 bg-table-bg-soft/85">
          <div className="flex shrink-0 items-baseline justify-between border-b border-white/10 px-6 py-4">
            <h2 className="font-display text-3xl uppercase tracking-wider text-table-ink">
              {currentCategory?.name ?? ''}
            </h2>
            <span className="rounded-full border border-white/15 bg-white/8 px-3 py-1 font-display text-xs uppercase tracking-wider text-table-ink-soft">
              {products.length} {t('table.menu.products', 'produits')}
            </span>
          </div>

          <div className="tables-scroll relative flex-1 overflow-y-auto p-5">
            {loading && (
              <div className="flex h-full items-center justify-center">
                <RetroLoader label={t('table.common.loading', 'LOADING')} accent="violet" />
              </div>
            )}

            {!loading && error && (
              <div className="flex h-full items-center justify-center text-center text-table-red">
                {error}
              </div>
            )}

            {!loading && !error && currentCategory && (
              products.length === 0 ? (
                <div className="flex h-48 items-center justify-center text-table-ink-muted">
                  {t('table.menu.empty', 'Aucun produit dans cette categorie.')}
                </div>
              ) : (
                <AnimatedGrid
                  resetKey={currentId}
                  className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4"
                >
                  {products.map((p) => (
                    <AnimatedGridItem key={p.id}>
                      <ProductCard
                        product={p}
                        happyHour={happyHour}
                        qtyInCart={qtyByProduct.get(String(p.id)) ?? 0}
                        onSelect={() => setDetailProduct(p)}
                        onAdd={() => addProduct(p, 1)}
                      />
                    </AnimatedGridItem>
                  ))}
                </AnimatedGrid>
              )
            )}
          </div>
        </section>
      </div>

      <style>{`
        @keyframes order-cta-glow {
          0%, 100% {
            box-shadow:
              0 0 22px 0 rgba(123, 43, 255, 0.55),
              0 0 44px 0 rgba(123, 43, 255, 0.22);
          }
          50% {
            box-shadow:
              0 0 32px 6px rgba(255, 43, 214, 0.55),
              0 0 64px 14px rgba(123, 43, 255, 0.38);
          }
        }
      `}</style>
      <motion.button
        type="button"
        onClick={() => setCartOpen(true)}
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.45, ease: EASE_OUT_QUART, delay: 0.2 }}
        whileTap={{ scale: 0.95 }}
        style={{ animation: 'order-cta-glow 2.8s ease-in-out infinite' }}
        className="fixed bottom-8 right-8 z-40 flex items-center gap-3 rounded-full border border-white/30 bg-gradient-to-br from-table-violet via-[#9C36FF] to-table-magenta px-9 py-5 font-display text-xl uppercase tracking-wider text-white"
      >
        <Beer className="h-7 w-7" />
        {t('table.menu.order', 'Commander')}
        {totalQty() > 0 && (
          <span className="ml-1 flex h-8 min-w-[2rem] items-center justify-center rounded-full border border-white/30 bg-white/25 px-2.5 font-display text-base text-white">
            {totalQty()}
          </span>
        )}
      </motion.button>

      <ProductDetailModal
        open={!!detailProduct}
        product={detailProduct}
        happyHour={happyHour}
        qtyInCart={detailProduct ? qtyByProduct.get(String(detailProduct.id)) ?? 0 : 0}
        onClose={() => setDetailProduct(null)}
        onAdd={(qty) => detailProduct && addProduct(detailProduct, qty)}
      />

      {identity && (
        <CartDrawer
          open={cartOpen}
          onClose={() => setCartOpen(false)}
          hostname={identity.hostname}
          onCheckout={(p) => {
            setCartOpen(false);
            setCheckout(p);
          }}
        />
      )}

      {identity && checkout && (
        <CheckoutModal
          open={!!checkout}
          onClose={() => setCheckout(null)}
          hostname={identity.hostname}
          priced={checkout}
        />
      )}
    </div>
  );
}
