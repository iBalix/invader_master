/**
 * Bouton "retour" tactile (DA V3 launcher glass).
 */

import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useT } from '../../i18n/useT';

interface Props {
  to?: string;
  label?: string;
}

export default function BackButton({ to = '/table/home', label }: Props) {
  const navigate = useNavigate();
  const t = useT();
  const text = (label ?? t('table.common.home')).toUpperCase();
  return (
    <button
      type="button"
      onClick={() => navigate(to)}
      className="flex items-center gap-2.5 rounded-full border border-white/15 bg-table-bg-elev/85 px-6 py-3 font-display text-lg uppercase tracking-wider text-table-ink transition-transform duration-150 hover:bg-white/14 active:scale-95"
    >
      <ArrowLeft className="h-6 w-6" />
      {text}
    </button>
  );
}
