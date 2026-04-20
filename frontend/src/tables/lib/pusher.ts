/**
 * Singleton Pusher client pour les tables tactiles.
 *
 * Les tables s'abonnent a 2 channels :
 *   - "TABLES"   : evenements globaux (live event start/end, reload, etc.)
 *   - "TABLExx"  : evenements specifiques a une table (sync master <-> slave : start-game, end-game)
 *
 * Cle publique injectee via VITE_PUSHER_KEY / VITE_PUSHER_CLUSTER.
 * On garde des fallbacks "no-op" si la conf est absente pour ne pas casser le rendu.
 */

import Pusher, { type Channel } from 'pusher-js';

const PUSHER_KEY = import.meta.env.VITE_PUSHER_KEY || '';
const PUSHER_CLUSTER = import.meta.env.VITE_PUSHER_CLUSTER || 'eu';

let pusherInstance: Pusher | null = null;

export function getPusher(): Pusher | null {
  if (!PUSHER_KEY) {
    if (typeof window !== 'undefined' && !(window as any).__pusherWarned) {
      console.warn('[tables] VITE_PUSHER_KEY non defini : Pusher desactive (mode degrade).');
      (window as any).__pusherWarned = true;
    }
    return null;
  }
  if (!pusherInstance) {
    pusherInstance = new Pusher(PUSHER_KEY, {
      cluster: PUSHER_CLUSTER,
      forceTLS: true,
    });
  }
  return pusherInstance;
}

export function subscribeChannel(channelName: string): Channel | null {
  const pusher = getPusher();
  if (!pusher) return null;
  return pusher.subscribe(channelName);
}

export function unsubscribeChannel(channelName: string): void {
  const pusher = getPusher();
  if (!pusher) return;
  pusher.unsubscribe(channelName);
}
