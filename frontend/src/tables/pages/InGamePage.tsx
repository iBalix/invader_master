/**
 * Overlay "partie en cours" (DA V3 launcher glass).
 *
 * Sortie auto cote slave (useSlaveGameSync), bouton "Terminer" cote master.
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Gamepad2 } from 'lucide-react';
import { useHostname } from '../hooks/useHostname';
import { useT } from '../i18n/useT';
import ArcadeButton from '../components/ui/ArcadeButton';
import { notifySlaveEndGame } from '../lib/gameLaunch';

interface InGameInfo {
  game?: { id: string; name: string };
  startedAt?: string;
}

function readInfo(): InGameInfo {
  try {
    const raw = sessionStorage.getItem('invaderInGame');
    if (!raw) return {};
    return JSON.parse(raw) as InGameInfo;
  } catch {
    return {};
  }
}

export default function InGamePage() {
  const identity = useHostname();
  const navigate = useNavigate();
  const t = useT();
  const [info] = useState<InGameInfo>(() => readInfo());
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    function onFocus() {
      if (identity?.role === 'master') {
        try {
          sessionStorage.removeItem('invaderInGame');
        } catch {
          /* ignore */
        }
      }
    }
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [identity?.role]);

  async function endGame() {
    setClosing(true);
    if (identity?.role === 'master') {
      await notifySlaveEndGame(identity.hostname);
    }
    try {
      sessionStorage.removeItem('invaderInGame');
    } catch {
      /* ignore */
    }
    navigate('/table/home', { replace: true });
  }

  return (
    <div className="relative flex h-full w-full flex-col items-center justify-center px-10 text-center">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            'radial-gradient(circle at 50% 50%, rgba(255,43,214,0.25), transparent 60%), linear-gradient(180deg, rgba(7,5,18,0.55) 0%, rgba(7,5,18,0.85) 100%)',
        }}
      />

      <div className="flex h-36 w-36 items-center justify-center rounded-3xl border border-white/20 bg-gradient-to-br from-table-magenta via-[#D724B5] to-[#7A0F73] text-white shadow-neon-magenta">
        <Gamepad2 className="h-20 w-20" />
      </div>

      <h1
        className="mt-10 font-display text-6xl uppercase tracking-wider text-table-ink"
        style={{ textShadow: '0 0 24px rgba(255,43,214,0.55)' }}
      >
        {t('table.ingame.playing')}
      </h1>

      {info.game && (
        <div className="mt-3 rounded-full border border-white/15 bg-white/8 px-5 py-2 font-display text-xl uppercase tracking-wider text-table-ink">
          {info.game.name}
        </div>
      )}

      <p className="mt-8 max-w-xl text-base text-table-ink-soft">
        {t('table.ingame.howto.quit')}
      </p>

      {identity?.role === 'master' && (
        <div className="mt-10">
          <ArcadeButton variant="ghost" size="md" onClick={endGame} disabled={closing}>
            {t('table.ingame.end')}
          </ArcadeButton>
        </div>
      )}
    </div>
  );
}
