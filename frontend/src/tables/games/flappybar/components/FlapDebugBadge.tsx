/**
 * Pastille de diagnostic (?debug=1) : chemin et âge du dernier état, version,
 * fps de la scène, état du WebSocket, dérive de simulation, fantômes, phase.
 */

import { useEffect, useState } from 'react';
import { useStore } from 'zustand';
import type { SyncInfo } from '../hooks/useFlapSession';
import type { UseFlapNetResult } from '../hooks/useFlapNet';
import type { FlapBridge } from '../phaser/bridge';

interface Props {
  bridge: FlapBridge;
  syncInfo: SyncInfo | null;
  v: number;
  net: UseFlapNetResult;
  isDemo: boolean;
}

export default function FlapDebugBadge({ bridge, syncInfo, v, net, isDemo }: Props) {
  const phase = useStore(bridge.store, (s) => s.phase);
  const fps = useStore(bridge.store, (s) => s.fps);
  const ghosts = useStore(bridge.store, (s) => {
    let n = 0;
    for (const player of Object.values(s.players)) {
      if (player.inRound && player.playerId !== s.myPlayerId) n += 1;
    }
    return n;
  });
  const [drift, setDrift] = useState(0);
  useEffect(() => bridge.fromScene.on('drift', setDrift), [bridge]);

  const slow = syncInfo !== null && syncInfo.ageMs > 800;
  const sync = isDemo ? 'démo' : syncInfo ? `${syncInfo.via} · ${syncInfo.ageMs} ms` : 'sync ?';
  return (
    <div
      className="pointer-events-none fixed bottom-2 left-2 z-50 rounded-lg px-3 py-1.5 font-mono text-sm font-bold"
      style={{ background: 'rgba(0,0,0,0.8)', color: slow ? '#FBBF24' : '#4ADE80' }}
    >
      {sync} · v{v} · {fps} fps · ws {net.status}
      {net.reconnects > 0 ? ` (+${net.reconnects})` : ''} · drift {drift} · {ghosts} fantômes · {phase}
    </div>
  );
}
