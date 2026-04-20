/**
 * Detection automatique du mode "perf" (PC tactile faible / accessibilite).
 *
 * Considere "low-end" si :
 *   - prefers-reduced-motion est actif
 *   - navigator.deviceMemory < 4 (Mo)
 *   - navigator.hardwareConcurrency <= 2 (cores)
 *   - URL contient ?perf=lite (force manuelle)
 *
 * Cote table tactile, on tourne sur des minis-PC (Beelink, NUC bas de gamme),
 * souvent 4-8 Go RAM mais GPU integres faibles -> on prefere couper les
 * particules et le backdrop-blur que de laguer.
 */

import { useEffect, useState } from 'react';

interface PerfMode {
  /** true si on doit reduire fortement les anims (zero particles, pas de blur lourd) */
  reduced: boolean;
  /** true si prefers-reduced-motion explicit (a11y) */
  prefersReducedMotion: boolean;
  /** true si force via ?perf=lite */
  forced: boolean;
}

function detectForcedLite(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return new URLSearchParams(window.location.search).get('perf') === 'lite';
  } catch {
    return false;
  }
}

function detectLowEnd(): boolean {
  if (typeof navigator === 'undefined') return false;
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  if (typeof mem === 'number' && mem < 4) return true;
  const cores = navigator.hardwareConcurrency ?? 4;
  if (cores <= 2) return true;
  return false;
}

function detectPrefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function usePerfMode(): PerfMode {
  const [state, setState] = useState<PerfMode>(() => {
    const forced = detectForcedLite();
    const prm = detectPrefersReducedMotion();
    const lowEnd = detectLowEnd();
    return {
      forced,
      prefersReducedMotion: prm,
      reduced: forced || prm || lowEnd,
    };
  });

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => {
      setState((prev) => ({
        ...prev,
        prefersReducedMotion: mq.matches,
        reduced: prev.forced || mq.matches || detectLowEnd(),
      }));
    };
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);

  return state;
}
