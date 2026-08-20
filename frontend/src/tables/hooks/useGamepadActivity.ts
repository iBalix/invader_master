/**
 * Manettes USB : compte en direct + detection d'appui de bouton.
 *
 * Sert au badge de test des manettes (GamepadBadge) : le staff branche les
 * manettes et verifie chaque touche sans avoir a lancer un jeu. On expose,
 * pour chaque manette connectee, un drapeau `lit` vrai pendant ~250 ms apres
 * la derniere entree detectee (bouton presse OU axe pousse, la croix des pads
 * USB generiques type SNES etant mappee sur les axes, repos 0, appui +-1).
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
 * Re-render maitrise : setState uniquement quand le compte ou un drapeau lit
 * change reellement, jamais a 60 fps (CPU des mini-PC).
 */

import { useEffect, useState } from 'react';

export interface GamepadPadState {
  /** index du slot Gamepad API (stable tant que la manette reste branchee) */
  index: number;
  /** une entree (bouton ou croix) a ete detectee il y a moins de LIT_MS */
  lit: boolean;
}

export interface GamepadActivity {
  count: number;
  pads: GamepadPadState[];
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

const EMPTY: GamepadActivity = { count: 0, pads: [] };

export function useGamepadActivity(enabled = true): GamepadActivity {
  const [state, setState] = useState<GamepadActivity>(EMPTY);

  useEffect(() => {
    if (!enabled) {
      setState(EMPTY);
      return;
    }
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return;

    const lastInputAt = new Map<number, number>();
    let signature = '';

    function tick() {
      const now = performance.now();
      const pads: GamepadPadState[] = [];
      for (const pad of navigator.getGamepads()) {
        if (!pad || !pad.connected) continue;
        if (hasInput(pad)) lastInputAt.set(pad.index, now);
        const last = lastInputAt.get(pad.index);
        pads.push({ index: pad.index, lit: last !== undefined && now - last < LIT_MS });
      }

      // setState seulement sur transition reelle : la signature encode tout
      // ce que le rendu utilise.
      const next = pads.map((p) => `${p.index}${p.lit ? '+' : '-'}`).join(',');
      if (next !== signature) {
        signature = next;
        setState({ count: pads.length, pads });
      }
    }

    tick();
    const interval = window.setInterval(tick, 50);
    return () => window.clearInterval(interval);
  }, [enabled]);

  return state;
}
