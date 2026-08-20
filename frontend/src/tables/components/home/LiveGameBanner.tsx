/**
 * Bandeau "partie en cours" sur l'accueil des bornes.
 *
 * Independant du bandeau evenements (desactive sur retour associe) : il ne
 * s'affiche QUE quand une session quiz/battle tourne reellement, et emmene le
 * client sur la surface joueur avec le code de la partie deja rempli.
 */

import { Link } from 'react-router-dom';
import type { LiveGame } from '../../hooks/useLiveGame';
import { useT } from '../../i18n/useT';

const EMOJI: Record<string, string> = { quiz: '🎯', battle: '⚔️' };

export default function LiveGameBanner({ game }: { game: LiveGame }) {
  const t = useT();
  const emoji = EMOJI[game.mode] ?? EMOJI.quiz;
  const title =
    game.mode === 'battle'
      ? t('table.home.liveGame.battle', 'Battle Royale en cours')
      : t('table.home.liveGame.quiz', 'Quiz en cours');
  return (
    <Link
      to={`/play/${game.joinCode}`}
      className="flex max-w-[44rem] items-center gap-4 rounded-2xl border border-cyan-400/50 bg-cyan-500/15 px-6 py-3 transition-transform duration-150 active:scale-[0.98]"
    >
      <span className="text-3xl">{emoji}</span>
      <span className="min-w-0">
        <span className="block text-lg font-black uppercase tracking-wide text-cyan-200">{title}</span>
        <span className="block text-sm text-white/70">
          {t('table.home.liveGame.sub', 'Touche ici pour rejoindre la partie depuis cette table')}
        </span>
      </span>
      <span className="ml-auto rounded-full bg-cyan-400/25 px-4 py-1.5 text-base font-black text-cyan-100">
        {t('table.home.liveGame.cta', 'Rejoindre').toUpperCase()}
      </span>
    </Link>
  );
}
