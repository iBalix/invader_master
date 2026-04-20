/**
 * Helpers de lancement / synchronisation des jeux entre master et slave.
 *
 * - buildInvaderUrl : construit l'URL custom invader:\\... attendue par
 *   l'agent kiosque Windows (qui spawn retroarch).
 *
 * - triggerStartGame / triggerEndGame : envoient un Pusher event au slave
 *   (channel TABLExx-2 si on est master) via le proxy serveur
 *   POST /public/tables/pusher (ainsi le secret reste cote serveur).
 *
 * Convention de hostname (rappel) :
 *   - master = "TABLExx-1"
 *   - slave  = "TABLExx-2"
 *
 * Le slave ecoute sur son propre channel "TABLExx-2".
 * Le master ecoute aussi sur "TABLExx-1" (utile si jamais on automatise
 * la fin de jeu depuis le slave).
 */

import { tablesApi } from './tablesApi';
import { parseHostname } from './hostname';

export interface LaunchableGame {
  id: string;
  name: string;
  fileName?: string | null;
  consoleLibrary?: string | null;
  gameType?: string | null;
  gameUrl?: string | null;
}

export function buildInvaderUrl(game: LaunchableGame): string | null {
  // Les jeux web (Phaser etc.) ont une URL HTTP directe : on la lance telle quelle.
  if (game.gameType === 'web' && game.gameUrl) {
    return game.gameUrl;
  }
  if (!game.fileName || !game.consoleLibrary) return null;
  const params = new URLSearchParams({
    run: '1',
    istable: '1',
    cmd: 'retroarch',
    libcore: `${game.consoleLibrary}.dll`,
    game: game.fileName,
  });
  // L'agent kiosque attend "invader:\\run?..." (double backslash, pas slash).
  return `invader:\\\\run?${params.toString()}`;
}

export function getSlaveHostname(masterHostname: string): string | null {
  const parsed = parseHostname(masterHostname);
  if (!parsed || parsed.role !== 'master') return null;
  return `${parsed.tableNumber}-2`;
}

export function getMasterHostname(slaveHostname: string): string | null {
  const parsed = parseHostname(slaveHostname);
  if (!parsed || parsed.role !== 'slave') return null;
  return `${parsed.tableNumber}-1`;
}

interface GamePayload {
  game: LaunchableGame;
  invaderUrl?: string | null;
}

/**
 * Le master appelle cette fonction quand il lance un jeu.
 * Notifie le slave via Pusher channel TABLExx-2.
 */
export async function notifySlaveStartGame(masterHostname: string, payload: GamePayload): Promise<void> {
  const slave = getSlaveHostname(masterHostname);
  if (!slave) return;
  try {
    await tablesApi.post('/pusher', {
      channel: slave,
      event: 'start-game',
      data: {
        ...payload,
        from: masterHostname,
        startedAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.warn('[gameLaunch] notifySlaveStartGame failed', err);
  }
}

/**
 * Idem mais pour la fin de partie.
 */
export async function notifySlaveEndGame(masterHostname: string): Promise<void> {
  const slave = getSlaveHostname(masterHostname);
  if (!slave) return;
  try {
    await tablesApi.post('/pusher', {
      channel: slave,
      event: 'end-game',
      data: { from: masterHostname, endedAt: new Date().toISOString() },
    });
  } catch (err) {
    console.warn('[gameLaunch] notifySlaveEndGame failed', err);
  }
}

/**
 * Lance le jeu sur la machine locale via le custom protocol invader://
 * (ouvre une iframe cachee plutot que window.location pour eviter
 * les blocages de navigation).
 */
export function launchOnLocalMachine(invaderUrl: string): void {
  if (invaderUrl.startsWith('http')) {
    window.location.href = invaderUrl;
    return;
  }
  const iframe = document.createElement('iframe');
  iframe.style.display = 'none';
  iframe.src = invaderUrl;
  document.body.appendChild(iframe);
  window.setTimeout(() => {
    try {
      document.body.removeChild(iframe);
    } catch {
      /* deja retire */
    }
  }, 2000);
}
