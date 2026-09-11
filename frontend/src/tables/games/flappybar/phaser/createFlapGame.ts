/**
 * Fabrique du jeu Phaser. Import dynamique : Phaser (≈1,2 Mo) part dans son
 * propre chunk et n'est chargé que sur la page de partie, jamais au lobby.
 * Le pont React/Phaser est déposé dans le registry avant le boot.
 */

import type Phaser from 'phaser';
import type { FlapBridge } from './bridge';
import { getFlapTheme } from '../themes';
import { WORLD_H, WORLD_W } from '../themes/types';

export async function createFlapGame(parent: HTMLElement, bridge: FlapBridge): Promise<Phaser.Game> {
  const [{ default: PhaserLib }, { BootScene }, { PlayScene }] = await Promise.all([
    import('phaser'),
    import('./BootScene'),
    import('./PlayScene'),
  ]);
  const theme = getFlapTheme(bridge.store.getState().themeId);
  const config: Phaser.Types.Core.GameConfig = {
    type: PhaserLib.AUTO,
    width: WORLD_W,
    height: WORLD_H,
    parent,
    backgroundColor: theme.palette.skyBottom,
    scale: { mode: PhaserLib.Scale.FIT, autoCenter: PhaserLib.Scale.CENTER_BOTH },
    render: { antialias: true, roundPixels: true, powerPreference: 'high-performance' },
    fps: { target: 60 },
    audio: { noAudio: true },
    banner: false,
    disableContextMenu: true,
    input: { gamepad: false },
    scene: [BootScene, PlayScene],
    callbacks: {
      preBoot: (game) => {
        game.registry.set('bridge', bridge);
      },
    },
  };
  const game = new PhaserLib.Game(config);
  // en dev seulement : accès console à l'instance (diagnostic du scale manager, fps...)
  if (import.meta.env.DEV) {
    const w = window as unknown as { __flapGame?: Phaser.Game; __flapGames?: Phaser.Game[] };
    w.__flapGame = game;
    (w.__flapGames ??= []).push(game);
  }
  return game;
}

/** type du jeu, pour les hooks React (aucun import runtime de Phaser hors de ce dossier) */
export type FlapGame = Phaser.Game;
