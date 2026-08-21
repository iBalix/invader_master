/**
 * Manettes USB : compte brut + detection d'appui de bouton.
 *
 * Sert au badge de test des manettes (GamepadBadge) : le staff branche les
 * manettes et verifie que chaque touche repond, sans avoir a lancer un jeu.
 * On expose deux choses seulement : le nombre de manettes vues a l'instant
 * present, et un drapeau `active` vrai pendant ~250 ms apres la derniere
 * entree detectee, quelle que soit la manette (bouton presse OU axe pousse,
 * la croix des pads USB generiques type SNES etant mappee sur les axes,
 * repos 0, appui +-1).
 *
 * AUCUN LISSAGE DU COMPTE, ET C'EST VOULU. Une version precedente gardait une
 * manette affichee 3 s apres sa disparition, pour absorber les allers-retours
 * observes au bar (deux manettes branchees, le compte tombait a 1 puis
 * remontait a 2). C'etait une erreur : ce clignotement n'est pas un artefact
 * d'affichage, c'est une vraie deconnexion intempestive, cote materiel ou cote
 * suspension USB de Windows. Le badge est un outil de diagnostic ; s'il lisse
 * le symptome, il empeche de reperer la manette, le cable ou le port
 * defaillant, ce qui est exactement l'information que le staff cherche. Donc
 * on affiche la verite, meme instable. Ne pas "reparer" ce clignotement.
 *
 * Difference avec useGamepadCount (garde pour la modale de lancement) : ici on
 * lit l'etat des boutons en continu (snapshot getGamepads, la Gamepad API n'a
 * pas d'event par bouton). Sondage setInterval a 50 ms plutot que
 * requestAnimationFrame : un appui physique dure 60 a 120 ms donc 20 Hz ne
 * rate rien, la lecture coute quelques microsecondes, et surtout rAF est
 * suspendu des que le navigateur juge la page non visible, ce qui gelerait le
 * badge. Ca regle au passage le quirk Chrome ou une manette n'apparait dans
 * getGamepads() qu'apres un premier appui : l'appui de test EST le geste qui
 * la revele.
 *
 * Re-render maitrise : setState uniquement quand le compte ou le drapeau
 * change reellement, jamais a 20 Hz (CPU des mini-PC).
 */

import { useEffect, useState } from 'react';

export interface GamepadActivity {
  /** nombre de manettes vues a l'instant present, sans amortissement */
  count: number;
  /** une entree (bouton ou croix) a ete detectee il y a moins de LIT_MS */
  active: boolean;
}

/** duree d'affichage d'un appui : un tap physique dure ~80 ms, on le prolonge */
const LIT_MS = 250;
/** seuil d'axe : la croix des pads generiques envoie exactement +-1 */
const AXIS_THRESHOLD = 0.6;

function hasInput(pad: Gamepad): boolean {
  for (const b of pad.buttons) {
    if (b.pressed) return true;
  }
  for (const a of pad.axes) {
    if (Math.abs(a) > AXIS_THRESHOLD) return true;
  }
  return false;
}

const EMPTY: GamepadActivity = { count: 0, active: false };

export function useGamepadActivity(enabled = true): GamepadActivity {
  const [state, setState] = useState<GamepadActivity>(EMPTY);

  useEffect(() => {
    if (!enabled) {
      setState(EMPTY);
      return;
    }
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return;

    let lastInputAt = -Infinity;
    let signature = '';

    function tick() {
      const now = performance.now();

      let count = 0;
      let input = false;
      for (const pad of navigator.getGamepads()) {
        if (!pad || !pad.connected) continue;
        count += 1;
        if (hasInput(pad)) input = true;
      }
      if (input) lastInputAt = now;

      // setState seulement sur transition reelle : la signature encode tout
      // ce que le rendu utilise.
      const active = now - lastInputAt < LIT_MS;
      const next = `${count}${active ? '+' : '-'}`;
      if (next !== signature) {
        signature = next;
        setState({ count, active });
      }
    }

    tick();
    const interval = window.setInterval(tick, 50);
    return () => window.clearInterval(interval);
  }, [enabled]);

  return state;
}
