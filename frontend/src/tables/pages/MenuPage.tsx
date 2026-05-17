/**
 * Ecran carte v2 (DA V3 launcher glass).
 *
 * Layout :
 *   - Header transparent : back + badge happy hour (titre supprime).
 *   - Sidebar gauche moderne (LauncherSidebar) avec icones Lucide + tinted color
 *     + bloc Happy Hour fixe en bas.
 *   - Centre : liste verticale de ProductRow (plus de grid de cards).
 *   - Click produit = ouvre ProductDetailModal.
 *   - Bouton + sur la row (ou par conditionnement) = ajoute au panier.
 *   - Bouton flottant panier (gradient violet, glow) - sera conditionne par
 *     settings.orderingEnabled en M5.
 *   - Indicateur de scroll en bas du panneau.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Beer } from 'lucide-react';
import { useHostname } from '../hooks/useHostname';
import { useCarteV2, type MenuCategoryV2, type MenuProductV2, type MenuConditioningV2, type MenuVariantV2 } from '../hooks/useCarteV2';
import { useCarteSettings } from '../hooks/useCarteSettings';
import { useCart, buildCartKey } from '../store/cartStore';
import { useT } from '../i18n/useT';
import HeaderBar from '../components/layout/HeaderBar';
import BackButton from '../components/layout/BackButton';
import LauncherSidebar, { type SidebarEntry } from '../components/layout/LauncherSidebar';
import ProductRow from '../components/menu/ProductRow';
import ProductDetailModal from '../components/menu/ProductDetailModal';
import CartDrawer from '../components/menu/CartDrawer';
import CheckoutModal from '../components/menu/CheckoutModal';
import HappyHourSidebarBlock from '../components/menu/HappyHourSidebarBlock';
import ScrollIndicator from '../components/menu/ScrollIndicator';
import VariantPicker from '../components/menu/VariantPicker';
import GoogleReviewCTA from '../components/menu/GoogleReviewCTA';
import RetroLoader from '../components/ui/RetroLoader';
import { EASE_OUT_QUART } from '../lib/motion';
import type { MenuProduct } from '../hooks/useCarte';
import type { PricedCart } from '../types';

function findCategory(cats: MenuCategoryV2[], id: string): MenuCategoryV2 | null {
  for (const c of cats) {
    if (c.id === id) return c;
    for (const sc of c.subCategories ?? []) {
      if (sc.id === id) return sc;
    }
  }
  return null;
}

function getCategoryProducts(cat: MenuCategoryV2 | null): MenuProductV2[] {
  if (!cat) return [];
  const seen = new Set<string>();
  const out: MenuProductV2[] = [];
  const push = (p: MenuProductV2) => {
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
 * Construit la liste sidebar (mode accordeon) :
 *   - Toutes les categories de profondeur 0 visibles, chevron si elles ont
 *     des sous-categories.
 *   - Les sous-categories sont injectees uniquement pour la categorie
 *     parente actuellement depliee (`openParentId`).
 *   - Plus de filtre par nom (Happy Hour) : la fenetre HH vient de settings.
 */
function flattenCategories(
  cats: MenuCategoryV2[],
  openParentId: string | null,
): SidebarEntry[] {
  const out: SidebarEntry[] = [];
  for (const c of cats) {
    const subs = c.subCategories ?? [];
    const hasChildren = subs.length > 0;
    const expanded = hasChildren && c.id === openParentId;
    out.push({
      id: c.id,
      name: c.name,
      count: c.products?.length ?? 0,
      iconName: c.iconName,
      color: c.color,
      depth: 0,
      hasChildren,
      expanded,
    });
    if (expanded) {
      for (const sc of subs) {
        out.push({
          id: sc.id,
          name: sc.name,
          count: sc.products?.length ?? 0,
          iconName: sc.iconName,
          color: sc.color,
          depth: 1,
        });
      }
    }
  }
  return out;
}

export default function MenuPage() {
  const identity = useHostname();
  const { loading, categories, error } = useCarteV2();
  const { settings, isHappyHourNow } = useCarteSettings();
  const { items, add, totalQty } = useCart();
  const t = useT();

  const [currentId, setCurrentId] = useState<string | null>(null);
  const [openParentId, setOpenParentId] = useState<string | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [checkout, setCheckout] = useState<PricedCart | null>(null);
  const [detailProduct, setDetailProduct] = useState<MenuProductV2 | null>(null);
  const [variantPicker, setVariantPicker] = useState<{
    product: MenuProductV2;
    conditioning: MenuConditioningV2 | null;
  } | null>(null);

  const orderingEnabled = settings?.orderingEnabled ?? true;
  const googleReviewUrl = settings?.googleReviewUrl ?? null;
  const showGoogleCta = !orderingEnabled && !!googleReviewUrl;

  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Tick toutes les minutes pour reevaluer la fenetre Happy Hour sans recharger.
  const [, setNow] = useState<Date>(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const happyHour = isHappyHourNow();

  useEffect(() => {
    if (!currentId && categories.length > 0) {
      setCurrentId(categories[0].id);
    }
  }, [categories, currentId]);

  const currentCategory = currentId ? findCategory(categories, currentId) : null;
  const products: MenuProductV2[] = useMemo(
    () => getCategoryProducts(currentCategory),
    [currentCategory],
  );
  const sidebarEntries = useMemo(
    () => flattenCategories(categories, openParentId),
    [categories, openParentId],
  );

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

  // Quantite affichee par produit reel : on regroupe toutes les variantes /
  // conditionnements d'un meme produit pour le badge "x3" sur la ligne.
  const qtyByProduct = useMemo(() => {
    const map = new Map<string, number>();
    items.forEach((i) => {
      const realId = String(i.realProductId ?? i.productId);
      map.set(realId, (map.get(realId) ?? 0) + i.qty);
    });
    return map;
  }, [items]);

  function num(v: number | string | null | undefined): number {
    if (v == null) return 0;
    const n = typeof v === 'number' ? v : parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  }

  function priceWithHh(base: number, hh: number | string | null | undefined): number {
    const hhN = num(hh);
    if (happyHour && hhN > 0 && hhN < base) return hhN;
    return base;
  }

  /**
   * Ajoute un produit au panier avec eventuellement un conditionnement et / ou
   * une variante. La cle composite est encodee dans `productId` (cf. cartStore).
   */
  function addToCart(p: MenuProductV2, opts: {
    conditioning?: MenuConditioningV2 | null;
    variant?: MenuVariantV2 | null;
    qty?: number;
  } = {}) {
    const { conditioning, variant, qty = 1 } = opts;
    const basePrice = conditioning ? num(conditioning.price) : num(p.price);
    const hhPrice = conditioning ? conditioning.priceHh : p.priceHh;
    const unitPrice = priceWithHh(basePrice, hhPrice);
    const cartKey = buildCartKey(p.id, conditioning?.id, variant?.id);
    const variantLabel = variant ? variant.label : undefined;
    const conditioningLabel = conditioning ? conditioning.label : undefined;
    const labelSuffix = [conditioningLabel, variantLabel].filter(Boolean).join(' · ');
    const displayName = labelSuffix ? `${p.name} (${labelSuffix})` : p.name;

    add(
      {
        productId: cartKey,
        realProductId: p.id,
        conditioningId: conditioning?.id,
        conditioningLabel,
        variantId: variant?.id,
        variantLabel,
        name: displayName,
        unitPrice,
        imageUrl: p.imageUrl ?? undefined,
      },
      qty,
    );
  }

  /**
   * Handler unifie pour le bouton + sur la row :
   *   - Produit sans variantes : ajout direct.
   *   - Produit avec variantes : ouvre VariantPicker (avec ou sans conditioning).
   */
  function handleAdd(p: MenuProductV2, conditioning?: MenuConditioningV2 | null) {
    const variants = p.variants ?? [];
    if (variants.length > 0) {
      setVariantPicker({ product: p, conditioning: conditioning ?? null });
      return;
    }
    addToCart(p, { conditioning });
  }

  // Adapter pour passer au ProductDetailModal qui type MenuProduct (v1).
  // Les champs communs (id, name, price, priceHh, imageUrl, videoUrl, ...)
  // sont identiques entre v1 et v2.
  const detailProductV1 = detailProduct as unknown as MenuProduct | null;

  return (
    <div className="relative flex h-full w-full flex-col px-8 py-6">
      <HeaderBar
        title=""
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
          bottomSlot={
            settings ? (
              <HappyHourSidebarBlock
                start={settings.happyHourStart}
                end={settings.happyHourEnd}
                days={settings.happyHourDays}
                active={happyHour}
              />
            ) : null
          }
        />

        <section className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl border border-white/10 bg-table-bg-soft/85">
          <div ref={scrollRef} className="tables-scroll relative flex-1 overflow-y-auto p-5">
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
                <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                  {products.map((p) => (
                    <ProductRow
                      key={p.id}
                      product={p}
                      happyHour={happyHour}
                      qtyInCart={qtyByProduct.get(String(p.id)) ?? 0}
                      onSelect={() => setDetailProduct(p)}
                      onAdd={() => handleAdd(p)}
                      onAddConditioning={(c) => handleAdd(p, c)}
                      showAddButton={orderingEnabled}
                    />
                  ))}
                </div>
              )
            )}
          </div>
          <ScrollIndicator scrollRef={scrollRef} />
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
      {orderingEnabled && (
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
      )}

      {showGoogleCta && <GoogleReviewCTA url={googleReviewUrl!} />}

      <ProductDetailModal
        open={!!detailProduct}
        product={detailProductV1}
        happyHour={happyHour}
        qtyInCart={detailProduct ? qtyByProduct.get(String(detailProduct.id)) ?? 0 : 0}
        onClose={() => setDetailProduct(null)}
        onAdd={(qty) => detailProduct && addToCart(detailProduct, { qty })}
        showAddControls={orderingEnabled}
      />

      {variantPicker && (
        <VariantPicker
          productName={variantPicker.product.name}
          variants={variantPicker.product.variants ?? []}
          conditioning={variantPicker.conditioning}
          onSelect={(v) => {
            addToCart(variantPicker.product, {
              conditioning: variantPicker.conditioning,
              variant: v,
            });
            setVariantPicker(null);
          }}
          onClose={() => setVariantPicker(null)}
        />
      )}

      {orderingEnabled && identity && (
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

      {orderingEnabled && identity && checkout && (
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
