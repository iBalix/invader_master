/**
 * Horloge serveur estimée (copie locale du mécanisme éprouvé de
 * frontend/src/game/lib/gameClient.ts : échantillon gardé au meilleur RTT).
 * Copie assumée : la surface tables ne doit pas importer la surface quiz.
 */

let clockOffset = 0;
let bestRtt = Infinity;

export function updateClock(serverNowMs: number, t0: number, t1: number): void {
  const rtt = t1 - t0;
  // on garde l'échantillon au meilleur rtt (le plus fiable), avec un
  // rafraîchissement progressif pour absorber la dérive
  if (rtt <= bestRtt * 1.5) {
    bestRtt = Math.min(bestRtt, rtt);
    clockOffset = serverNowMs - (t0 + t1) / 2;
  }
}

export function serverNow(): number {
  return Date.now() + clockOffset;
}
