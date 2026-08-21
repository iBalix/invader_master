/**
 * Manettes USB : compte stable + detection d'appui de bouton.
 *
 * Sert au badge de test des manettes (GamepadBadge) : le staff branche les
 * manettes et verifie que chaque touche repond, sans avoir a lancer un jeu.
 * On expose deux choses seulement : le nombre de manettes presentes, et un
 * drapeau `active` vrai pendant ~250 ms apres la derniere entree detectee,
 * quelle que soit la manette (bouton presse OU axe pousse, la croix des pads
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
 * PRESENCE_GRACE_MS, et pourquoi il existe : avec deux manettes branchees, le
 * compte tombait regulierement a 1 avant de remonter a 2. Une manette
 * disparait donc par intermittence de l'enumeration Chrome. Cause probable
 * cote materiel, la suspension selective USB de Windows coupant un port
 * juge inactif, ou un pad bas de gamme qui cesse de repondre au repos : dans
 * les deux cas la manette revient des l'activite suivante. On ne peut pas
 * l'empecher depuis le navigateur, mais on peut refuser de l'afficher : un
 * slot n'est oublie qu'apres PRESENCE_GRACE_MS sans avoir ete revu. Le compte
 * devient insensible a ces trous, au prix d'un debranchement reel constate
 * avec ce meme delai, ce qui reste largement assez reactif pour un test au
 * comptoir.
 *
 * Re-render maitrise : setState uniquement quand le compte ou le drapeau
 * change reellement, jamais a 20 Hz (CPU des mini-PC).
 */

import { useEffect, useState } from 'react';

export interface GamepadActivity {
  /** nombre de manettes presentes, tolerant aux trous d'enumeration */
  count: number;
  /** une entree (bouton ou croix) a ete detectee il y a moins de LIT_MS */
  active: boolean;
}

/** duree d'affichage d'un appui : un tap physique dure ~80 ms, on le prolonge */
const LIT_MS = 250;
/** seuil d'axe : la croix des pads generiques envoie exactement +-1 */
const AXIS_THRESHOLD = 0.6;
/** delai avant d'acter la disparition d'une manette (cf. en-tete) */
const PRESENCE_GRACE_MS = 3000;

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

    /** dernier instant ou chaque slot a ete vu branche */
    const lastSeenAt = new Map<number, number>();
    let lastInputAt = -Infinity;
    let signature = '';

    function tick() {
      const now = performance.now();

      let input = false;
      for (const pad of navigator.getGamepads()) {
        if (!pad || !pad.connected) continue;
        lastSeenAt.set(pad.index, now);
        if (hasInput(pad)) input = true;
      }
      if (input) lastInputAt = now;

      // Purge des slots vraiment partis. Supprimer pendant l'iteration d'une
      // Map est defini et sans danger : l'iterateur suit les suppressions.
      for (const [index, seenAt] of lastSeenAt) {
        if (now - seenAt > PRESENCE_GRACE_MS) lastSeenAt.delete(index);
      }

      // setState seulement sur transition reelle : la signature encode tout
      // ce que le rendu utilise.
      const count = lastSeenAt.size;
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
