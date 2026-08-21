/**
 * Toggle FR/EN simple pour les tables tactiles (DA V3 launcher glass).
 * Persiste dans localStorage via `useLocaleStore`.
 */

import { Globe } from 'lucide-react';
import { useLocaleStore } from '../../i18n/localeStore';

export default function LocaleSwitcher() {
  const { locale, setLocale } = useLocaleStore();

  function toggle() {
    setLocale(locale === 'fr' ? 'en' : 'fr');
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className="flex h-[3.25rem] items-center gap-2.5 rounded-full border border-white/15 bg-table-bg-elev/85 px-5 font-display text-lg uppercase tracking-wider text-table-ink transition-transform duration-150 hover:bg-white/14 active:scale-95"
      aria-label={locale === 'fr' ? 'Switch to English' : 'Passer en francais'}
    >
      <Globe className="h-5 w-5" />
      {locale.toUpperCase()}
    </button>
  );
}
