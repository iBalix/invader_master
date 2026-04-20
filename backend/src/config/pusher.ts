/**
 * Pusher server client (used by /public/tables/pusher proxy and live-event triggers).
 * Reuses the existing credentials of the legacy invader_table PHP project.
 */

import Pusher from 'pusher';

let cached: Pusher | null = null;

export function getPusher(): Pusher | null {
  if (cached) return cached;

  const appId = process.env.PUSHER_APP_ID;
  const key = process.env.PUSHER_KEY;
  const secret = process.env.PUSHER_SECRET;
  const cluster = process.env.PUSHER_CLUSTER ?? 'eu';

  if (!appId || !key || !secret) {
    console.warn('[pusher] credentials missing (PUSHER_APP_ID/KEY/SECRET) - triggers disabled');
    return null;
  }

  cached = new Pusher({ appId, key, secret, cluster, useTLS: true });
  return cached;
}

export async function triggerSafe(channel: string, event: string, data: unknown): Promise<void> {
  const p = getPusher();
  if (!p) return;
  try {
    await p.trigger(channel, event, data);
  } catch (err) {
    console.error(`[pusher] trigger failed channel=${channel} event=${event}`, err);
  }
}
