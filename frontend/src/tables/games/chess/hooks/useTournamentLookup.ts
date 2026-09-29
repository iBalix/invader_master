/**
 * Lookup tournoi pendant la saisie du pseudo (modales créer / rejoindre).
 *
 * Debounce de 400 ms, requêtes périmées ignorées, lancé dès l'ouverture (le
 * pseudo est pré-rempli avec le dernier saisi sur la dalle). Une panne réseau
 * ne gêne jamais la partie : pas de pastille, voilà tout.
 */

import { useEffect, useRef, useState } from 'react';
import { isValidPseudo } from '../lib/pseudo';
import { tournamentLookupApi, type ChessTournamentContext, type LobbyTournamentInfo, type TournamentLookup } from '../lib/tournamentLookup';

const DEBOUNCE_MS = 400;

export function useTournamentLookup(
  pseudo: string,
  enabled: boolean,
  opponent?: string | null,
): TournamentLookup | null {
  const [result, setResult] = useState<TournamentLookup | null>(null);
  const seq = useRef(0);
  const trimmed = pseudo.trim();
  useEffect(() => {
    if (!enabled || !isValidPseudo(trimmed)) {
      seq.current += 1;
      setResult(null);
      return;
    }
    const mine = ++seq.current;
    const t = window.setTimeout(() => {
      tournamentLookupApi
        .lookup(trimmed, opponent ?? null)
        .then((r) => {
          if (seq.current === mine) setResult(r);
        })
        .catch(() => {
          if (seq.current === mine) setResult(null);
        });
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [trimmed, enabled, opponent]);
  return result;
}

/** créateurs de parties en attente qui ont un match de tournoi à jouer (lobby) */
export function useLobbyTournamentInfo(pseudos: string[]): Record<string, LobbyTournamentInfo> {
  const [info, setInfo] = useState<Record<string, LobbyTournamentInfo>>({});
  const key = [...pseudos].sort().join(',');
  useEffect(() => {
    if (!key) {
      setInfo({});
      return;
    }
    let cancelled = false;
    const t = window.setTimeout(() => {
      tournamentLookupApi
        .lookupMany(key.split(','))
        .then((r) => {
          if (!cancelled) setInfo(r);
        })
        .catch(() => {
          if (!cancelled) setInfo({});
        });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [key]);
  return info;
}

/**
 * Contexte tournoi d'une partie en cours : lu au montage, puis à la fin de la
 * partie avec deux relances (la remontée du résultat est asynchrone, elle
 * arrive une fraction de seconde après la fin).
 */
export function useChessTournamentContext(
  chessId: string | null,
  seated: boolean,
  ended: boolean,
): ChessTournamentContext | null {
  const [ctx, setCtx] = useState<ChessTournamentContext | null>(null);
  useEffect(() => {
    setCtx(null);
  }, [chessId]);
  useEffect(() => {
    if (!chessId || !seated) return;
    let cancelled = false;
    const load = () =>
      tournamentLookupApi
        .gameContext(chessId)
        .then((c) => {
          if (!cancelled) setCtx(c);
        })
        .catch(() => undefined);
    void load();
    const timers = ended ? [window.setTimeout(load, 1_500), window.setTimeout(load, 4_500)] : [];
    return () => {
      cancelled = true;
      timers.forEach((x) => window.clearTimeout(x));
    };
  }, [chessId, seated, ended]);
  return ctx;
}
