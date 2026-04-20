/**
 * Hook de traduction pour les tables tactiles.
 *
 * Recupere les traductions depuis l'API publique `/public/translations?locale=...`
 * (memoise par locale dans un cache module). Si la cle est absente du dictionnaire
 * fetche, on retombe sur `DEFAULT_TRANSLATIONS` du fichier `defaultTranslations.ts`.
 *
 * Usage :
 *   const t = useT();
 *   <h1>{t('table.home.title.line1')}</h1>
 *
 * On peut forcer un fallback inline (utile en dev) :
 *   t('table.foo.bar', 'Mon fallback')
 */

import { useEffect, useState } from 'react';
import { publicApi } from '../lib/tablesApi';
import { useLocaleStore } from './localeStore';
import { DEFAULT_TRANSLATIONS, type Locale } from './defaultTranslations';

const cache: Partial<Record<Locale, Record<string, string>>> = {};
const inflight: Partial<Record<Locale, Promise<Record<string, string>>>> = {};

async function fetchTranslations(locale: Locale): Promise<Record<string, string>> {
  if (cache[locale]) return cache[locale]!;
  if (inflight[locale]) return inflight[locale]!;
  const promise = publicApi
    .get<Record<string, string>>('/translations', { params: { locale } })
    .then((res) => {
      cache[locale] = res.data ?? {};
      delete inflight[locale];
      return cache[locale]!;
    })
    .catch(() => {
      cache[locale] = {};
      delete inflight[locale];
      return cache[locale]!;
    });
  inflight[locale] = promise;
  return promise;
}

export type TFunction = (key: string, fallback?: string) => string;

export function useT(): TFunction {
  const locale = useLocaleStore((s) => s.locale);
  const [, setVersion] = useState(0);

  useEffect(() => {
    let alive = true;
    fetchTranslations(locale).then(() => {
      if (alive) setVersion((v) => v + 1);
    });
    return () => {
      alive = false;
    };
  }, [locale]);

  return (key: string, fallback?: string) => {
    const fromApi = cache[locale]?.[key];
    if (fromApi) return fromApi;
    const fromDefault = DEFAULT_TRANSLATIONS[locale]?.[key];
    if (fromDefault) return fromDefault;
    return fallback ?? key;
  };
}
