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
      className="flex items-center gap-2 rounded-full border border-white/15 bg-table-bg-elev/85 px-4 py-2 font-display uppercase tracking-wider text-table-ink transition-transform duration-150 hover:bg-white/14 active:scale-95"
      aria-label={locale === 'fr' ? 'Switch to English' : 'Passer en francais'}
    >
      <Globe className="h-4 w-4" />
      {locale.toUpperCase()}
    </button>
  );
}
