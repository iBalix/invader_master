/**
 * Store du panier (cote client) pour les tables tactiles.
 *
 * Le panier est purement local : on n'envoie au backend que lors du
 * passage de commande (POST /public/tables/:hostname/orders).
 *
 * Persiste en localStorage par hostname pour qu'un refresh n'efface
 * pas la commande en cours, et qu'un master/slave aient leur panier
 * independant (leurs hostnames different).
 *
 * Carte v2 : un produit peut etre ajoute avec un conditionnement et / ou
 * une variante. L'identite d'un item devient (productId, conditioningId,
 * variantId). Pour minimiser l'impact sur le code consommateur :
 *   - `productId` continue de jouer le role de "cle d'item" cote store
 *     (la cle composite y est encodee : "<uuid>::<condId>::<varId>") ;
 *   - `realProductId` contient l'UUID reel du produit, a envoyer au
 *     backend lors du POST (les conditionnements/variants sont stockes
 *     a part dans table_order_items en option de l'item).
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface CartItem {
  productId: number | string;
  /**
   * UUID reel du produit, utilise par le backend (pricing + insert order_items).
   * Si absent, on fallback sur `productId` (cas legacy v1, pas de conditioning/variant).
   */
  realProductId?: string;
  conditioningId?: string;
  conditioningLabel?: string;
  variantId?: string;
  variantLabel?: string;
  name: string;
  unitPrice: number;
  qty: number;
  imageUrl?: string;
  notes?: string;
}

interface CartState {
  items: CartItem[];
  couponCode: string | null;
  add: (item: Omit<CartItem, 'qty'>, qty?: number) => void;
  remove: (productId: CartItem['productId']) => void;
  setQty: (productId: CartItem['productId'], qty: number) => void;
  setCoupon: (code: string | null) => void;
  clear: () => void;
  totalQty: () => number;
  subtotal: () => number;
}

/**
 * Construit la cle composite stockee dans `productId` pour identifier un item
 * unique dans le panier. Sans conditionnement ni variante, on garde l'UUID
 * brut (retro-compat avec la carte v1).
 */
export function buildCartKey(
  realProductId: string,
  conditioningId?: string | null,
  variantId?: string | null,
): string {
  if (!conditioningId && !variantId) return realProductId;
  return `${realProductId}::${conditioningId ?? ''}::${variantId ?? ''}`;
}

function getKey(): string {
  let host: string | null = null;
  try {
    host = localStorage.getItem('invaderTableHostname');
  } catch {
    /* ignore */
  }
  return `invaderCart:${host || 'unknown'}`;
}

export const useCart = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      couponCode: null,
      add: (item, qty = 1) =>
        set((s) => {
          const existing = s.items.find((i) => i.productId === item.productId);
          if (existing) {
            return {
              items: s.items.map((i) =>
                i.productId === item.productId ? { ...i, qty: i.qty + qty } : i,
              ),
            };
          }
          return { items: [...s.items, { ...item, qty }] };
        }),
      remove: (productId) =>
        set((s) => ({ items: s.items.filter((i) => i.productId !== productId) })),
      setQty: (productId, qty) =>
        set((s) => ({
          items:
            qty <= 0
              ? s.items.filter((i) => i.productId !== productId)
              : s.items.map((i) => (i.productId === productId ? { ...i, qty } : i)),
        })),
      setCoupon: (code) => set({ couponCode: code ? code.trim().toUpperCase() : null }),
      clear: () => set({ items: [], couponCode: null }),
      totalQty: () => get().items.reduce((s, i) => s + i.qty, 0),
      subtotal: () => get().items.reduce((s, i) => s + i.qty * i.unitPrice, 0),
    }),
    {
      name: 'invaderCart',
      storage: createJSONStorage(() => ({
        getItem: (_n) => {
          try {
            return localStorage.getItem(getKey());
          } catch {
            return null;
          }
        },
        setItem: (_n, v) => {
          try {
            localStorage.setItem(getKey(), v);
          } catch {
            /* quota / private */
          }
        },
        removeItem: (_n) => {
          try {
            localStorage.removeItem(getKey());
          } catch {
            /* ignore */
          }
        },
      })),
    },
  ),
);
