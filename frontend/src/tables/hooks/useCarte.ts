/**
 * Recupere la carte (categories + produits + conditionnements + variants)
 * via /public/carte.
 */

import { useEffect, useState } from 'react';
import { publicApi } from '../lib/tablesApi';
import { useLocaleStore } from '../i18n/localeStore';

export interface MenuConditioning {
  id: string;
  label: string;
  labelEn?: string | null;
  price: number | string;
  priceHh?: number | string | null;
  position: number;
}

export interface MenuVariant {
  id: string;
  label: string;
  labelEn?: string | null;
  color?: string | null;
  position: number;
}

export interface MenuTag {
  id: string;
  name: string;
  nameEn?: string | null;
  color?: string | null;
  iconName?: string | null;
  position?: number;
}

export interface MenuProduct {
  id: string;
  name: string;
  subtitle?: string | null;
  description?: string | null;
  price: number | string | null;
  priceHh?: number | string | null;
  imageUrl?: string | null;
  videoUrl?: string | null;
  conditionings?: MenuConditioning[];
  variants?: MenuVariant[];
  tags?: MenuTag[];
}

export interface MenuCategory {
  id: string;
  name: string;
  weight: number;
  parentId?: string | null;
  iconName?: string | null;
  color?: string | null;
  textureUrl?: string | null;
  products: MenuProduct[];
  subCategories?: MenuCategory[];
}

interface State {
  loading: boolean;
  categories: MenuCategory[];
  error: string | null;
}

export function useCarte(): State {
  const locale = useLocaleStore((s) => s.locale);
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
    // relance au changement de langue : la locale voyage avec la requete
  }, [locale]);

  return state;
}
