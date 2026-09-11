/**
 * Manettes USB : n'importe quel bouton = flap. Détection de front par
 * manette (relevé de l'état précédent) ; les boutons déjà enfoncés au moment
 * où la manette apparaît sont ignorés jusqu'à leur premier relâchement (même
 * logique que useGamepadActivity : le repos n'est pas zéro).
 */

export interface GamepadFlap {
  poll(): void;
}

interface PadState {
  pressed: boolean[];
  suspect: Set<number>;
}

export function createGamepadFlap(onFlap: () => void): GamepadFlap {
  const pads = new Map<string, PadState>();
  return {
    poll() {
      if (typeof navigator === 'undefined' || !navigator.getGamepads) return;
      let flap = false;
      for (const pad of navigator.getGamepads()) {
        if (!pad || !pad.connected) continue;
        const key = `${pad.index}|${pad.id}`;
        let state = pads.get(key);
        if (!state) {
          state = {
            pressed: pad.buttons.map((b) => b.pressed),
            suspect: new Set(pad.buttons.map((b, i) => (b.pressed ? i : -1)).filter((i) => i >= 0)),
          };
          pads.set(key, state);
          continue;
        }
        for (let i = 0; i < pad.buttons.length; i += 1) {
          const down = pad.buttons[i].pressed;
          const was = state.pressed[i] ?? false;
          if (down && !was && !state.suspect.has(i)) flap = true;
          if (!down) state.suspect.delete(i);
          state.pressed[i] = down;
        }
      }
      if (flap) onFlap();
    },
  };
}
