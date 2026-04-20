/**
 * Store global de la locale courante des tables tactiles.
 * Persiste dans localStorage pour rester stable entre les navigations.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Locale } from './defaultTranslations';

interface LocaleState {
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

export const useLocaleStore = create<LocaleState>()(
  persist(
    (set) => ({
      locale: 'fr',
      setLocale: (locale) => set({ locale }),
    }),
    {
      name: 'invaderTableLocale',
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
