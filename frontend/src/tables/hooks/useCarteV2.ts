/**
 * Recupere la carte v2 (categories + produits + conditionnements + variants)
 * via /public/carte-v2. Equivalent enrichi de useCarte mais cible la nouvelle
 * structure du back-office.
 */

import { useEffect, useState } from 'react';
import { publicApi } from '../lib/tablesApi';
import { useLocaleStore } from '../i18n/localeStore';

export interface MenuConditioningV2 {
  id: string;
  label: string;
  labelEn?: string | null;
  price: number | string;
  priceHh?: number | string | null;
  position: number;
}

export interface MenuVariantV2 {
  id: string;
  label: string;
  labelEn?: string | null;
  color?: string | null;
  position: number;
}

export interface MenuTagV2 {
  id: string;
  name: string;
  nameEn?: string | null;
  color?: string | null;
  iconName?: string | null;
  position?: number;
}

export interface MenuProductV2 {
  id: string;
  name: string;
  subtitle?: string | null;
  description?: string | null;
  price: number | string | null;
  priceHh?: number | string | null;
  imageUrl?: string | null;
  videoUrl?: string | null;
  conditionings?: MenuConditioningV2[];
  variants?: MenuVariantV2[];
  tags?: MenuTagV2[];
}

export interface MenuCategoryV2 {
  id: string;
  name: string;
  weight: number;
  parentId?: string | null;
  iconName?: string | null;
  color?: string | null;
  textureUrl?: string | null;
  products: MenuProductV2[];
  subCategories?: MenuCategoryV2[];
}

interface State {
  loading: boolean;
  categories: MenuCategoryV2[];
  error: string | null;
}

export function useCarteV2(): State {
  const locale = useLocaleStore((s) => s.locale);
  const [state, setState] = useState<State>({ loading: true, categories: [], error: null });

  useEffect(() => {
    let cancelled = false;
    publicApi
      .get<{ categories: MenuCategoryV2[] }>('/carte-v2')
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
