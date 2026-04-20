/**
 * Recupere la carte (categories + produits) via /public/carte.
 *
 * La structure renvoyee est aplatie : on flatten les sous-categories
 * en categories de premier niveau pour simplifier la sidebar.
 */

import { useEffect, useState } from 'react';
import { publicApi } from '../lib/tablesApi';

export interface MenuProduct {
  id: string;
  name: string;
  subtitle?: string | null;
  description?: string | null;
  price: number | string | null;
  priceHh?: number | string | null;
  imageUrl?: string | null;
  videoUrl?: string | null;
  weight?: number;
}

export interface MenuCategory {
  id: string;
  name: string;
  weight: number;
  parentId?: string | null;
  products: MenuProduct[];
  subCategories?: MenuCategory[];
  iconEmoji?: string | null;
  imageUrl?: string | null;
}

interface State {
  loading: boolean;
  categories: MenuCategory[];
  error: string | null;
}

export function useCarte(): State {
  const [state, setState] = useState<State>({ loading: true, categories: [], error: null });

  useEffect(() => {
    let cancelled = false;
    publicApi
      .get<{ categories: MenuCategory[] }>('/carte')
      .then((res) => {
        if (cancelled) return;
        setState({ loading: false, categories: res.data?.categories ?? [], error: null });
      })
      .catch((err) => {
        if (cancelled) return;
        setState({
          loading: false,
          categories: [],
          error: err?.response?.data?.error ?? 'Impossible de charger la carte',
        });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
