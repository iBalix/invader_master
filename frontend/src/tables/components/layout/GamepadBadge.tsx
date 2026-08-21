/**
 * Badge de test des manettes (accueil + catalogue de jeux, haut droite).
 *
 * Deux besoins du staff, sans avoir a lancer un jeu :
 *   - voir combien de manettes USB le PC detecte ;
 *   - verifier que chaque touche repond : un appui sur N'IMPORTE quel bouton
 *     de N'IMPORTE quelle manette fait passer la pastille entiere en jaune
 *     (on ne dit pas quel bouton, seulement que l'ordinateur l'a recu).
 *
 * MASTER UNIQUEMENT : les manettes sont physiquement branchees sur le PC
 * TABLExx-1. Sur la dalle slave, la Gamepad API ne verra donc jamais rien et un
 * badge fige a 0 y serait un faux negatif ("les manettes ne marchent pas")
 * alors que la table fonctionne. On ne l'affiche pas, et on coupe aussi le
 * sondage 50 ms cote slave (CPU des mini-PC).
 *
 * Volontairement discret : meme grammaire visuelle que les pills du header
 * (LocaleSwitcher, BackButton). Eteint et neutre a 0 manette, accent mint des
 * qu'une manette est detectee. Sur le master il est toujours affiche :
 * "0 detectee" est une information (manette morte ou pas encore revelee), un
 * badge absent n'en est pas une.
 *
 * Retour visuel : premiere version avec un point par manette qui flashait en
 * mint. Illisible en pratique, 8 px passant de 30 % a 100 % d'opacite pendant
 * 250 ms, personne ne le voyait. D'ou le renversement complet de la pastille
 * en jaune plein sur texte sombre : le delta couvre toute la surface et ne peut
 * pas etre rate a un metre de la table. Corollaire assume, on perd l'info "quelle
 * manette a repondu" ; c'est le bon arbitrage, on teste les manettes une par une.
 *
 * L'allumage est instantane (l'etat jaune ne porte aucune classe de
 * transition) et l'extinction se fait en fondu : un tap bref reste visible.
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
  const { count, active } = useGamepadActivity(!isSlave);
  const t = useT();

  if (isSlave) return null;

  const detected = count > 0;

  return (
    <div
      aria-label={`${t('table.gamepads.label', 'Manettes détectées')} : ${count}`}
      className={[
        'flex h-[3.25rem] items-center gap-2.5 rounded-full border px-5',
        'font-display uppercase tracking-wider tabular-nums',
        active
          ? 'border-table-yellow bg-table-yellow text-table-bg shadow-[0_0_18px_rgba(255,233,85,0.6)]'
          : detected
            ? 'border-table-mint/40 bg-table-mint/15 text-table-mint transition-colors duration-300'
            : 'border-white/15 bg-table-bg-elev/85 text-table-ink-muted transition-colors duration-300',
      ].join(' ')}
    >
      <Gamepad2 className="h-6 w-6" />
      <span className="text-xl leading-none">{count}</span>
    </div>
  );
}
