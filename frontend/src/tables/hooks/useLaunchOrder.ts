/**
 * Etat de lancement de jeu de la table, partage par tous les ecrans.
 *
 * L'ordre persiste cote serveur est la SEULE verite. Cette page ne fait que
 * le relire :
 *   - un evenement Supabase Realtime declenche une relecture immediate ;
 *   - un sondage regulier garantit le deblocage meme si tous les evenements
 *     se perdent (c'est ce qui remplace l'ancien "fire and forget").
 *
 * Un store au niveau module, pas un state par composant : la modale de
 * lancement, le layout et la page in-game regardent le meme ordre, avec un
 * seul sondage pour toute l'application.
 *
 * Le master porte en plus l'EXECUTION : quand un ordre est en attente, il le
 * reclame au serveur puis tire le deeplink. Le serveur n'accorde la
 * reclamation qu'une seule fois, donc deux onglets ouverts sur le master ne
 * peuvent pas lancer le jeu deux fois.
 */

import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  ackOrder,
  fetchCurrentOrder,
  launchOnLocalMachine,
  type LaunchOrderView,
} from '../lib/gameLaunch';
import { subscribeTopic } from '../lib/realtime';
import { getHostname, parseHostname } from '../lib/hostname';

/** sondage serre tant qu'un ordre est vivant : le client doit suivre en direct */
const POLL_ACTIVE_MS = 1_500;
/**
 * Au repos, le master doit quand meme apprendre vite qu'un ordre l'attend :
 * c'est ce delai, pas l'evenement temps reel, qui decide si le navigateur ou
 * le master reagit. Mesure en local temps reel coupe : a 12 s, un ordre
 * pouvait trainer douze secondes avant d'etre execute. A 5 s, c'est
 * imperceptible, et le temps reel ramene ca a ~200 ms quand il fonctionne.
 * Cout : 20 ecrans / 5 s = 4 requetes par seconde sur une requete indexee.
 */
const POLL_IDLE_MS = 5_000;

let order: LaunchOrderView | null = null;
let ready = false;
const listeners = new Set<() => void>();

let pollTimer: ReturnType<typeof setTimeout> | null = null;
let inFlight = false;
let started = false;
let boundTopic: string | null = null;
let unsubscribe: (() => void) | null = null;

/** ordres deja reclames par CET onglet : evite de re-tirer le meme deeplink */
const handled = new Set<string>();

function emit() {
  for (const l of listeners) l();
}

function setOrder(next: LaunchOrderView | null) {
  const changed =
    (order?.id ?? null) !== (next?.id ?? null) || (order?.status ?? null) !== (next?.status ?? null);
  order = next;
  if (changed || !ready) {
    ready = true;
    emit();
  }
}

function isLive(o: LaunchOrderView | null): boolean {
  return !!o && !o.endedAt && o.status !== 'failed' && o.status !== 'cancelled';
}

/**
 * Execution cote master. Volontairement sequentielle : on reclame d'abord,
 * on lance ensuite. Si le navigateur meurt entre les deux, le serveur ne voit
 * jamais de confirmation et l'agent reprend la main.
 */
async function maybeExecute(current: LaunchOrderView): Promise<void> {
  const identity = parseHostname(getHostname());
  if (!identity || identity.role !== 'master') return;
  if (current.status !== 'pending') return;
  if (handled.has(current.id)) return;

  handled.add(current.id);
  try {
    const { ok, deeplink } = await ackOrder(current.id);
    // ok=false : l'agent (ou un autre onglet) execute deja. Ne rien faire est
    // la bonne reponse, pas une erreur.
    if (ok && deeplink) launchOnLocalMachine(deeplink);
  } catch (err) {
    // On relache la garde : le prochain sondage retentera, et si personne
    // n'y arrive l'agent prendra le relais a l'echeance.
    handled.delete(current.id);
    console.warn('[launch] reclamation impossible', err);
  }
}

export async function refreshLaunchOrder(): Promise<void> {
  if (inFlight) return;
  inFlight = true;
  try {
    const next = await fetchCurrentOrder();
    setOrder(next);
    if (next) await maybeExecute(next);
  } catch {
    // Reseau coupe : on garde le dernier etat connu plutot que d'effacer
    // l'ecran "partie en cours" au premier hoquet.
  } finally {
    inFlight = false;
    schedule();
  }
}

function schedule() {
  if (pollTimer) clearTimeout(pollTimer);
  pollTimer = setTimeout(() => void refreshLaunchOrder(), isLive(order) ? POLL_ACTIVE_MS : POLL_IDLE_MS);
}

function bindTopic() {
  const identity = parseHostname(getHostname());
  const wanted = identity ? `table:${identity.tableId}` : null;
  if (wanted === boundTopic) return;

  unsubscribe?.();
  unsubscribe = null;
  boundTopic = wanted;
  if (!wanted) return;

  // Un seul topic par TABLE : les deux dalles ecoutent le meme. L'evenement ne
  // transporte aucune donnee metier, il dit juste "relis ton ordre".
  unsubscribe = subscribeTopic(wanted, (e) => {
    if (e.event === 'reload') {
      // Demande de rechargement depuis le back-office. L'ancien evenement
      // Pusher visait un channel que plus personne n'ecoutait : le bouton
      // etait sans effet depuis la refonte des tables.
      window.location.reload();
      return;
    }
    void refreshLaunchOrder();
  });
}

function start() {
  if (started) return;
  started = true;
  bindTopic();
  void refreshLaunchOrder();

  // Retour de focus : le jeu vient peut-etre de se fermer. On relit tout de
  // suite plutot que d'attendre le prochain sondage.
  window.addEventListener('focus', () => void refreshLaunchOrder());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void refreshLaunchOrder();
  });
  window.addEventListener('invader:hostname-changed', () => {
    bindTopic();
    void refreshLaunchOrder();
  });
}

export function useLaunchOrder(): { order: LaunchOrderView | null; ready: boolean; refresh: () => void } {
  const [, force] = useState(0);

  useEffect(() => {
    const listener = () => force((n) => n + 1);
    listeners.add(listener);
    start();
    return () => {
      listeners.delete(listener);
    };
  }, []);

  const refresh = useCallback(() => void refreshLaunchOrder(), []);
  return { order, ready, refresh };
}

/** Utilisable hors composant (apres un POST /launch, pour afficher sans delai) */
export function primeLaunchOrder(next: LaunchOrderView | null): void {
  setOrder(next);
  schedule();
  if (next) void maybeExecute(next);
}

/**
 * Bascule automatique vers / depuis l'ecran de jeu, montee une seule fois dans
 * le layout.
 *
 * Regle : l'ecran qui vient de cliquer garde sa modale d'attente (la pop-up
 * "Lancement en cours"), l'AUTRE dalle bascule tout de suite en plein cadre.
 * Une fois le jeu confirme, les deux sont sur l'ecran de jeu.
 *
 * Le retour a l'accueil n'est jamais decide par un evenement : il decoule de
 * la disparition de l'ordre. C'est ce qui rend impossible le blocage du slave.
 */
export function useLaunchNavigation(): void {
  const { order, ready } = useLaunchOrder();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!ready) return;
    const onGameScreen = location.pathname.startsWith('/table/in-game');
    const identity = parseHostname(getHostname());

    if (order && (isLive(order) || order.status === 'failed')) {
      const initiatedHere = !!identity && order.requestedBy === identity.hostname;
      const settled = order.status === 'dispatched' || order.status === 'failed';
      if (!onGameScreen && (settled || !initiatedHere)) {
        navigate('/table/in-game', { replace: true });
      }
      return;
    }

    if (onGameScreen) navigate('/table/home', { replace: true });
  }, [order, ready, location.pathname, navigate]);
}
