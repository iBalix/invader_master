/**
 * Pastille « changer de fond », sur l'accueil des bornes.
 *
 * Le serveur attribue un fond par table au demarrage ; a partir de la, le
 * client fait ce qu'il veut. Un appui passe au design suivant, et ca ne
 * concerne QUE cet ecran : la dalle d'en face garde le sien.
 *
 * Masquee s'il y a moins de deux designs eligibles, un bouton sans effet etant
 * pire que pas de bouton.
 */

import { Shuffle } from 'lucide-react';
import { useDesignConfig } from '../../hooks/useDesignConfig';
import { useT } from '../../i18n/useT';

export default function DesignSwitcher() {
  const { designs, cycle } = useDesignConfig();
  const t = useT();

  if (designs.length < 2) return null;

  const label = t('table.home.design.switch', 'Changer de fond');

  return (
    <button
      type="button"
      onClick={cycle}
      aria-label={label}
      title={label}
      className="flex h-[3.25rem] w-[3.25rem] items-center justify-center rounded-full border border-white/15 bg-table-bg-elev/85 text-table-ink-soft transition hover:border-table-cyan/60 hover:bg-table-cyan/15 hover:text-table-cyan active:scale-95"
    >
      <Shuffle className="h-6 w-6" />
    </button>
  );
}
