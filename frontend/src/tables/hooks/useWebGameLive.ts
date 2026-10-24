/**
 * « En ce moment dans le bar » pour la pop-up d'un jeu maison : combien de
 * parties attendent un joueur, combien tournent, et le record du bar pour les
 * jeux qui en tiennent un.
 *
 * Relecture toutes les 5 s, seulement tant que la pop-up est ouverte : la
 * page des jeux reste ouverte des heures sur une dalle, inutile d'interroger
 * les lobbies quand personne ne regarde. Si le lobby ne répond pas dès la
 * première lecture, la ligne n'apparaît pas plutôt que d'afficher un faux
 * « aucune partie ».
 */

import { useEffect, useState } from 'react';
import { chessApi } from '../games/chess/lib/chessApi';
import { bjApi } from '../games/blackjack/lib/bjApi';
import { flapApi } from '../games/flappybar/lib/flapApi';
import type { WebGameLive } from '../lib/webGameGuides';

const POLL_MS = 5_000;

export interface WebGameLiveInfo {
  /** parties qu'on peut rejoindre tout de suite */
  waiting: number;
  /** parties lancées (on peut les regarder) */
  playing: number;
  record: { pseudo: string; score: number } | null;
}

async function lire(kind: WebGameLive): Promise<WebGameLiveInfo> {
  if (kind === 'chess') {
    const items = await chessApi.lobby();
    return {
      // une partie solo contre l'ordinateur n'attend personne
      waiting: items.filter((i) => i.status === 'lobby' && i.ai === null).length,
      playing: items.filter((i) => i.status === 'playing').length,
      record: null,
    };
  }
  if (kind === 'blackjack') {
    const items = await bjApi.lobby();
    return {
      waiting: items.filter((i) => i.status === 'lobby' && i.joinable).length,
      playing: items.filter((i) => i.status === 'playing').length,
      record: null,
    };
  }
  const [items, records] = await Promise.all([
    flapApi.lobby(),
    // le record est un bonus : son absence ne doit pas masquer les parties
    flapApi.records(1).catch(() => []),
  ]);
  const best = records[0];
  return {
    waiting: items.filter((i) => i.status === 'lobby' && i.joinable).length,
    playing: items.filter((i) => i.status === 'playing').length,
    record: best ? { pseudo: best.pseudo, score: best.score } : null,
  };
}

/**
 * undefined = premier chargement en cours, null = lobby injoignable (ou pop-up
 * fermée), sinon l'état du bar. Après un premier succès, une relecture ratée
 * garde le dernier état connu plutôt que de faire clignoter la ligne.
 */
export function useWebGameLive(
  kind: WebGameLive | null,
  open: boolean,
): WebGameLiveInfo | null | undefined {
  const [info, setInfo] = useState<WebGameLiveInfo | null | undefined>(undefined);

  useEffect(() => {
    setInfo(open && kind ? undefined : null);
    if (!open || !kind) return;
    let alive = true;
    const relire = () => {
      lire(kind)
        .then((next) => {
          if (alive) setInfo(next);
        })
        .catch(() => {
          if (alive) setInfo((prev) => (prev === undefined ? null : prev));
        });
    };
    relire();
    const interval = setInterval(relire, POLL_MS);
    return () => {
      alive = false;
      clearInterval(interval);
    };
  }, [kind, open]);

  return info;
}
