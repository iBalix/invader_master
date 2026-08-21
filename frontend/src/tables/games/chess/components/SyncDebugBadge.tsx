/**
 * Badge de diagnostic réseau, affiché seulement avec ?debug=1 dans l'URL.
 *
 * Sert à mesurer la latence réelle sur place, dans le bar : "rapide" signifie
 * que le coup a été peint directement depuis le signal temps réel (le chemin
 * optimisé), "http" qu'il a fallu un aller-retour de rattrapage. L'âge est le
 * temps écoulé entre l'émission du signal par le serveur et son application
 * ici : c'est exactement la latence que voit le joueur qui attend.
 */

import type { SyncInfo } from '../hooks/useChessSession';

interface Props {
  info: SyncInfo | null;
}

export default function SyncDebugBadge({ info }: Props) {
  if (!info) return null;
  const slow = info.ageMs > 800;
  return (
    <div
      className="pointer-events-none rounded-full border px-3 py-1 font-mono text-xs"
      style={{
        borderColor: slow ? 'rgba(255,59,92,0.6)' : 'rgba(94,217,161,0.6)',
        background: 'rgba(0,0,0,0.55)',
        color: slow ? '#FF8FA3' : '#8FE9BF',
      }}
    >
      {info.via === 'fast' ? 'rapide' : 'http'} · {info.ageMs} ms
    </div>
  );
}
