/**
 * Manettes USB : compte brut + detection d'appui, avec relevé de repos.
 *
 * Sert au badge de test des manettes (GamepadBadge) : le staff branche les
 * manettes et verifie que chaque touche repond, sans avoir a lancer un jeu.
 *
 * LE REPOS N'EST PAS ZERO, et c'est tout l'enjeu de ce fichier. La premiere
 * version comparait `Math.abs(axe) > 0.6`, donc contre un repos suppose a zero.
 * Faux sur une bonne partie du parc :
 *   - les gachettes analogiques de beaucoup de pads reposent a -1 et montent
 *     vers +1 quand on appuie : |-1| depasse le seuil en permanence ;
 *   - une croix directionnelle mappee sur un axe "hat" repose souvent sur une
 *     valeur batarde, elle aussi au-dela du seuil ;
 *   - un stick fatigue derive et se stabilise a 0,65.
 * Resultat constate au bar : brancher certaines manettes allumait le badge en
 * jaune immediatement, comme si une touche etait tenue, alors que rien n'etait
 * touche. Le diagnostic tient en une ligne : on mesurait un ecart a zero, pas
 * un ecart au repos.
 *
 * On releve donc les axes a la PREMIERE lecture de chaque manette, et on ne
 * declare un appui que sur un ecart a cette reference. Meme logique pour les
 * boutons : un bouton deja presse au branchement est repute colle, on l'ignore
 * jusqu'a son premier relachement, apres quoi il redevient un bouton normal.
 *
 * L'identite d'une manette est `index|id` : rebrancher un modele different sur
 * le meme emplacement refait donc le relevé, au lieu d'heriter du precedent.
 *
 * AUCUN LISSAGE DU COMPTE, ET C'EST VOULU. Une version precedente gardait une
 * manette affichee 3 s apres sa disparition pour absorber les allers-retours
 * observes au bar. C'etait une erreur : ce clignotement n'est pas un artefact
 * d'affichage, c'est une vraie deconnexion intempestive. Le badge est un outil
 * de diagnostic ; s'il lisse le symptome, il empeche de reperer la manette, le
 * cable ou le port defaillant. Ne pas "reparer" ce clignotement.
 *
 * Sondage setInterval a 50 ms plutot que requestAnimationFrame : un appui
 * physique dure 60 a 120 ms donc 20 Hz ne rate rien, et surtout rAF est suspendu
 * des que le navigateur juge la page non visible, ce qui gelerait le badge.
 */

import { useEffect, useState } from 'react';

export interface GamepadActivity {
  /** nombre de manettes vues a l'instant present, sans amortissement */
  count: number;
  /** une entree (bouton ou axe) a ete detectee il y a moins de LIT_MS */
  active: boolean;
}

/** duree d'affichage d'un appui : un tap physique dure ~80 ms, on le prolonge */
const LIT_MS = 250;
/**
 * Ecart minimal AU REPOS pour declarer un appui.
 *
 * 0,5 : un stick pousse a fond s'ecarte de 1, une gachette de 2, une croix d'au
 * moins 1. On garde donc une marge confortable au-dessus de la derive d'un
 * stick fatigue, qui depasse rarement 0,2 apres calibrage.
 */
const ECART_MINIMAL = 0.5;

interface Reference {
  axes: number[];
  /** index des boutons presses au branchement, donc suspects */
  boutonsSuspects: Set<number>;
}

/**
 * Relevés de repos, au niveau module et non dans un hook : ils doivent survivre
 * au demontage du badge, sinon changer de page refait le relevé et un pad tenu a
 * ce moment-la se retrouve calibre "en appui".
 */
const referenceParManette = new Map<string, Reference>();

function cleManette(pad: Gamepad): string {
  return `${pad.index}|${pad.id}`;
}

function referencePour(pad: Gamepad): Reference {
  const cle = cleManette(pad);
  const existante = referenceParManette.get(cle);
  if (existante) return existante;
  const creee: Reference = {
    axes: Array.from(pad.axes),
    boutonsSuspects: new Set(
      pad.buttons.map((b, i) => (b.pressed ? i : -1)).filter((i) => i >= 0),
    ),
  };
  referenceParManette.set(cle, creee);
  return creee;
}

/** la manette est-elle reellement sollicitee, par rapport a son propre repos ? */
function estSollicitee(pad: Gamepad): boolean {
  const ref = referencePour(pad);
  let actif = false;

  pad.buttons.forEach((b, i) => {
    if (b.pressed) {
      if (!ref.boutonsSuspects.has(i)) actif = true;
    } else if (ref.boutonsSuspects.has(i)) {
      // relache une fois : ce bouton n'est plus suspect, il compte desormais
      ref.boutonsSuspects.delete(i);
    }
  });

  pad.axes.forEach((valeur, i) => {
    if (Math.abs(valeur - (ref.axes[i] ?? 0)) > ECART_MINIMAL) actif = true;
  });

  return actif;
}

function manettesBranchees(): Gamepad[] {
  if (typeof navigator === 'undefined' || !navigator.getGamepads) return [];
  const out: Gamepad[] = [];
  for (const pad of navigator.getGamepads()) {
    if (pad && pad.connected) out.push(pad);
  }
  return out;
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
      const pads = manettesBranchees();
      if (pads.some(estSollicitee)) lastInputAt = now;

      // setState seulement sur transition reelle : la signature encode tout
      // ce que le rendu utilise. Sans ca on re-rendrait 20 fois par seconde.
      const count = pads.length;
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
