/**
 * Badge d'etat des lumieres Hue pour les consoles GM.
 *
 * Trois usages concrets en soiree :
 *   - verifier d'un coup d'oeil que les lumieres repondent (checklist avant ouverture) ;
 *   - le bouton Tester declenche deux flashs visibles depuis la salle ;
 *   - l'interrupteur coupe les lumieres sans toucher au jeu si elles deraillent.
 */

import { useCallback, useEffect, useState } from 'react';
import { Lightbulb, LightbulbOff, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../../lib/api';

interface AgentLightStatus {
  bridgeHealthy: boolean;
  lastCue: string | null;
  lastCueAgeMs: number | null;
  sent60s: number;
  errors60s: number;
  dropped60s: number;
  workerAlive: boolean;
  dryRun: boolean;
}

interface LightsState {
  agentConnected: boolean;
  supported: boolean;
  enabled: boolean;
  agent: AgentLightStatus | null;
}

const POLL_MS = 10_000;

function formatAge(ms: number | null): string {
  if (ms == null) return '';
  if (ms < 1500) return "à l'instant";
  if (ms < 60_000) return `il y a ${Math.round(ms / 1000)} s`;
  return `il y a ${Math.round(ms / 60_000)} min`;
}

export default function LightsBadge() {
  const [state, setState] = useState<LightsState | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/api/bar/lights/status');
      setState(data?.data ?? null);
    } catch {
      setState(null);
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  if (!state) return null;

  const { agentConnected, supported, enabled, agent } = state;

  // severite : ce qui doit attirer l'oeil du GM
  let tone: 'ok' | 'warn' | 'ko' | 'off' = 'ok';
  let label = 'Lumières OK';
  if (!enabled) {
    tone = 'off';
    label = 'Lumières coupées';
  } else if (!agentConnected) {
    tone = 'ko';
    label = 'Pas d’agent';
  } else if (!supported) {
    tone = 'off';
    label = 'Lumières non supportées';
  } else if (!agent?.workerAlive) {
    tone = 'ko';
    label = 'Module lumière arrêté';
  } else if (!agent.bridgeHealthy) {
    tone = 'ko';
    label = 'Bridge injoignable';
  } else if (agent.errors60s > 0 || agent.dropped60s > 0) {
    tone = 'warn';
    label = 'Lumières dégradées';
  }

  const styles: Record<typeof tone, string> = {
    ok: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    warn: 'border-amber-200 bg-amber-50 text-amber-800',
    ko: 'border-rose-200 bg-rose-50 text-rose-700',
    off: 'border-gray-200 bg-gray-50 text-gray-500',
  };

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(ok);
      await load();
    } catch (err) {
      const msg = (err as { response?: { data?: { message?: string } } }).response?.data?.message;
      toast.error(msg ?? 'Action impossible');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`flex flex-wrap items-center gap-3 rounded-xl border px-4 py-2.5 ${styles[tone]}`}>
      <span className="flex items-center gap-2 text-sm font-bold">
        {enabled ? <Lightbulb size={16} /> : <LightbulbOff size={16} />}
        {label}
      </span>

      {agent?.dryRun && (
        <span className="rounded-full bg-white/70 px-2 py-0.5 text-xs font-semibold">simulation</span>
      )}

      {agent?.lastCue && (
        <span className="text-xs opacity-80">
          {agent.lastCue} · {formatAge(agent.lastCueAgeMs)}
        </span>
      )}

      <div className="ml-auto flex items-center gap-2">
        {busy && <Loader2 size={14} className="animate-spin" />}
        <button
          type="button"
          disabled={busy || !supported || !enabled}
          onClick={() => void act(() => api.post('/api/bar/lights/test'), 'Test envoyé (deux flashs)')}
          className="rounded-lg border border-current/30 bg-white/70 px-3 py-1 text-xs font-semibold disabled:opacity-40"
        >
          Tester
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            void act(
              () => api.post('/api/bar/lights/enabled', { enabled: !enabled }),
              enabled ? 'Lumières coupées' : 'Lumières réactivées',
            )
          }
          className="rounded-lg border border-current/30 bg-white/70 px-3 py-1 text-xs font-semibold disabled:opacity-40"
        >
          {enabled ? 'Couper' : 'Réactiver'}
        </button>
      </div>
    </div>
  );
}
