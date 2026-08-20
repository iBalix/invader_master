/**
 * Lancement d'un jeu depuis une table tactile.
 *
 * Tout passe desormais par un ORDRE DE LANCEMENT persiste cote serveur
 * (backend/src/services/tableLaunch.ts). Ce fichier ne fait plus que deux
 * choses : parler a cette API, et tirer le deeplink sur la machine locale.
 *
 * Ce qui a disparu, et pourquoi :
 *   - buildInvaderUrl : le deeplink est construit par le backend. Le client
 *     n'a plus a concatener ".dll" et ne peut plus faire executer une commande
 *     arbitraire sur un PC du bar via un endpoint public.
 *   - notifySlaveStartGame / notifySlaveEndGame : elles poussaient un evenement
 *     Pusher vers un channel calcule a partir d'un hostname mal forme
 *     ("01-2" au lieu de "TABLE01-2"), rejete par le serveur, avec l'erreur
 *     avalee dans un catch. Le slave n'etait donc jamais notifie.
 *   - getSlaveHostname / getMasterHostname : l'adressage master/slave est une
 *     decision serveur, plus une deduction client.
 */

import { tablesApi } from './tablesApi';

export type LaunchStatus = 'pending' | 'dispatched' | 'failed' | 'cancelled';

export interface LaunchOrderView {
  id: string;
  status: LaunchStatus;
  gameId: string | null;
  gameName: string;
  /** hostname de l'ecran qui a clique (master ou slave) */
  requestedBy: string;
  /** hostname du PC qui execute : toujours le master */
  targetHostname: string;
  createdAt: string;
  endedAt: string | null;
}

interface OrderResponse {
  order: LaunchOrderView | null;
  alreadyActive?: boolean;
}

/** Demande de lancement. Appelable depuis les DEUX dalles. */
export async function requestLaunch(
  gameId: string,
  opts: { replace?: boolean } = {},
): Promise<OrderResponse> {
  const { data } = await tablesApi.post('/launch', { gameId, replace: opts.replace === true });
  return { order: data?.order ?? null, alreadyActive: data?.alreadyActive === true };
}

export async function fetchCurrentOrder(): Promise<LaunchOrderView | null> {
  const { data } = await tablesApi.get('/launch/current');
  return data?.order ?? null;
}

/**
 * Le master reclame l'execution avant de tirer le deeplink.
 * ok=false => quelqu'un d'autre execute deja (l'agent, ou l'autre onglet) :
 * il ne faut SURTOUT pas lancer, sinon le jeu demarre deux fois.
 */
export async function ackOrder(
  orderId: string,
): Promise<{ ok: boolean; deeplink: string | null; order: LaunchOrderView | null }> {
  const { data } = await tablesApi.post(`/launch/${orderId}/ack`, {});
  return { ok: data?.ok === true, deeplink: data?.deeplink ?? null, order: data?.order ?? null };
}

/** Indice de fin de partie (Chrome reprend le focus sur le master). */
export async function reportFocus(orderId: string): Promise<void> {
  await tablesApi.post(`/launch/${orderId}/report`, { signal: 'focus' });
}

/** Bouton "Terminer", disponible sur les deux dalles. */
export async function endOrder(orderId: string): Promise<void> {
  await tablesApi.post(`/launch/${orderId}/end`, {});
}

/**
 * Tire le deeplink sur la machine locale.
 *
 * Iframe cachee plutot que window.location : une navigation vers un protocole
 * custom peut etre bloquee ou laisser la page dans un etat instable, alors
 * qu'une iframe echoue silencieusement sans casser le kiosque.
 *
 * Aucun accuse de reception n'est possible ici : c'est precisement pour ca que
 * la confirmation est deleguee a l'agent du bar.
 */
export function launchOnLocalMachine(deeplink: string): void {
  if (deeplink.startsWith('http')) {
    window.location.href = deeplink;
    return;
  }
  const iframe = document.createElement('iframe');
  iframe.style.display = 'none';
  iframe.src = deeplink;
  document.body.appendChild(iframe);
  window.setTimeout(() => {
    try {
      document.body.removeChild(iframe);
    } catch {
      /* deja retire */
    }
  }, 2000);
}
