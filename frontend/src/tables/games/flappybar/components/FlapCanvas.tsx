/**
 * Hôte du canvas Phaser (plein cadre) + loader tant que la scène n'a pas
 * signalé `ready` (génération des textures au boot).
 */

import { useRef } from 'react';
import RetroLoader from '../../../components/ui/RetroLoader';
import { usePhaserGame } from '../hooks/usePhaserGame';
import type { FlapBridge } from '../phaser/bridge';

interface Props {
  bridge: FlapBridge;
  themeId: string;
  loadingLabel: string;
}

export default function FlapCanvas({ bridge, themeId, loadingLabel }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const { ready } = usePhaserGame(hostRef, bridge, themeId);
  return (
    <div className="absolute inset-0">
      <div ref={hostRef} className="absolute inset-0" />
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center">
          <RetroLoader label={loadingLabel} accent="cyan" />
        </div>
      )}
    </div>
  );
}
