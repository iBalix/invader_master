/**
 * Badge de test des manettes (accueil + catalogue de jeux, haut droite).
 *
 * Deux besoins du staff, sans avoir a lancer un jeu :
 *   - voir combien de manettes USB le PC detecte ;
 *   - verifier que chaque touche repond : un appui sur N'IMPORTE quel bouton
 *     allume le point de la manette concernee (on ne dit pas quel bouton,
 *     seulement que l'ordinateur l'a recu).
 *
 * MASTER UNIQUEMENT : les manettes sont physiquement branchees sur le PC
 * TABLExx-1. Sur la dalle slave, la Gamepad API ne verra donc jamais rien et un
 * badge fige a 0 y serait un faux negatif ("les manettes ne marchent pas")
 * alors que la table fonctionne. On ne l'affiche pas, et on coupe aussi le
 * sondage 50 ms cote slave (CPU des mini-PC).
 *
 * Volontairement discret : meme grammaire visuelle que les pills du header
 * (LocaleSwitcher, BackButton). Eteint et neutre a 0 manette, accent mint des
 * qu'une manette est detectee, un point par manette qui flashe a l'appui.
 * Sur le master il est toujours affiche : "0 detectee" est une information
 * (manette morte ou pas encore revelee), un badge absent n'en est pas une.
 *
 * L'allumage du point est instantane (pas de classe transition a l'etat
 * allume) et l'extinction se fait en fondu : un tap bref reste visible.
 * Pas d'animation infinie, contrainte CPU des mini-PC (cf. tailwind.config).
 */

import { Gamepad2 } from 'lucide-react';
import { useGamepadActivity } from '../../hooks/useGamepadActivity';
import { useHostname } from '../../hooks/useHostname';
import { useT } from '../../i18n/useT';

export default function GamepadBadge() {
  const identity = useHostname();
  // Hostname inconnu (ecran de setup) : on affiche, c'est le defaut le moins
  // trompeur. Seul un role slave explicitement identifie masque le badge.
  const isSlave = identity?.role === 'slave';
  const { count, pads } = useGamepadActivity(!isSlave);
  const t = useT();
  const detected = count > 0;

  if (isSlave) return null;

  return (
    <div
      aria-label={`${t('table.gamepads.label', 'Manettes détectées')} : ${count}`}
      className={[
        'flex h-11 items-center gap-2.5 rounded-full border px-4',
        'font-display uppercase tracking-wider tabular-nums transition-colors duration-300',
        detected
          ? 'border-table-mint/40 bg-table-mint/15 text-table-mint'
          : 'border-white/15 bg-table-bg-elev/85 text-table-ink-muted',
      ].join(' ')}
    >
      <Gamepad2 className="h-5 w-5" />
      <span className="text-lg leading-none">{count}</span>
      {detected && (
        <span className="flex items-center gap-1.5 pl-0.5">
          {pads.map((pad) => (
            <span
              key={pad.index}
              className={[
                'h-2 w-2 rounded-full',
                pad.lit
                  ? 'scale-125 bg-table-mint shadow-[0_0_8px_rgba(94,217,161,0.9)]'
                  : 'bg-current opacity-30 transition-all duration-300',
              ].join(' ')}
            />
          ))}
        </span>
      )}
    </div>
  );
}
