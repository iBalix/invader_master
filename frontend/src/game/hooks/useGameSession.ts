/**
 * Hook central des surfaces de jeu (joueur, écrans, GM light).
 *
 * Protocole auto-réparant :
 * - les events realtime portent state_version : trou détecté => refetch
 * - refetch au retour de veille (visibilitychange) et à la reconnexion
 * - poll de secours toutes les 10 s
 * Les timers utilisent l'horloge serveur (offset estimé sur chaque fetch).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  gameApi,
  serverNow,
  subscribeToGame,
  updateClock,
  type GameEvent,
  type PublicState,
  type You,
} from '../lib/gameClient';

const POLL_MS = 10000;
/**
 * Sondage quand le temps reel est MORT (canal en erreur, expire, ferme, ou
 * jamais ouvert). Dix secondes suffisent en secours d'un temps reel qui marche ;
 * sans lui, c'est la duree d'une question entiere.
 */
const POLL_SANS_TEMPS_REEL_MS = 2000;

export interface UseGameSessionOptions {
  playerToken?: string | null;
  onEvent?: (e: GameEvent) => void;
}

export function useGameSession(idOrCode: string | null, options: UseGameSessionOptions = {}) {
  const [state, setState] = useState<PublicState | null>(null);
  const [you, setYou] = useState<You | null>(null);
  /**
   * Vrai quand une reponse /state REQUETEE AVEC LE TOKEN COURANT est revenue
   * avec you=null : le serveur ne connait plus ce joueur (kick GM). Distinct
   * de l'etat initial you=null, qui ne prouve rien (premiere requete possible
   * sans token). C'est le signal qui permet a PlayerApp de purger l'identite
   * locale au lieu de tourner sur un spinner infini.
   */
  const [youAbsent, setYouAbsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const versionRef = useRef(0);
  const tokenRef = useRef(options.playerToken ?? null);
  tokenRef.current = options.playerToken ?? null;
  const onEventRef = useRef(options.onEvent);
  onEventRef.current = options.onEvent;
  const refreshing = useRef(false);
  const pendingRefresh = useRef(false);
  /** le canal temps reel est-il abonne ? (optimiste tant qu'il n'a rien dit) */
  const [tempsReel, setTempsReel] = useState(true);
  /**
   * Derniere version ANNONCEE par le temps reel. Un canal peut rester
   * « abonne » et ne plus rien livrer (constate sur des dalles) : le signe,
   * c'est un sondage qui ramene une version que le canal n'a jamais annoncee.
   */
  const dernierSyncV = useRef(0);

  const refresh = useCallback(async () => {
    if (!idOrCode) return;
    // un refresh demandé pendant un refresh en vol n'est JAMAIS jeté : il est
    // mis en file et rejoué (sinon un sync realtime arrivant au mauvais moment
    // laisse le client bloqué sur la phase précédente jusqu'au poll suivant)
    if (refreshing.current) {
      pendingRefresh.current = true;
      return;
    }
    refreshing.current = true;
    try {
      do {
        pendingRefresh.current = false;
        const usedToken = tokenRef.current;
        try {
          const t0 = Date.now();
          const data = await gameApi.state(idOrCode, usedToken ?? undefined);
          const t1 = Date.now();
          updateClock(data.state.serverNow, t0, t1);
          // Une version est passee sans que le temps reel ne l'annonce : le
          // canal est muet, on se met a sonder vite jusqu'au prochain signal.
          if (
            versionRef.current > 0 &&
            data.state.v > versionRef.current &&
            data.state.v > dernierSyncV.current
          ) {
            setTempsReel(false);
          }
          if (data.state.v >= versionRef.current) {
            versionRef.current = data.state.v;
            setState(data.state);
            // "you" n'est mis à jour que par une réponse requêtée avec le token
            // COURANT : une requête partie sans token (ou avec un ancien) qui se
            // termine après un join ne doit pas écraser l'identité fraîche
            if (usedToken !== null && usedToken === tokenRef.current) {
              setYou(data.you);
              setYouAbsent(data.you === null);
            }
          }
          setError(null);
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Erreur réseau');
        }
      } while (pendingRefresh.current);
    } finally {
      refreshing.current = false;
    }
  }, [idOrCode]);

  // un token qui apparaît (join, reprise d'identité) => refetch immédiat avec ce token
  const token = options.playerToken ?? null;
  useEffect(() => {
    setYouAbsent(false);
    if (token) void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // fetch initial + poll de secours
  useEffect(() => {
    if (!idOrCode) return;
    versionRef.current = 0;
    void refresh();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onVisible);
    };
  }, [idOrCode, refresh]);

  // sondage de secours, resserre quand le temps reel ne repond plus
  useEffect(() => {
    if (!idOrCode) return;
    const interval = setInterval(() => void refresh(), tempsReel ? POLL_MS : POLL_SANS_TEMPS_REEL_MS);
    return () => clearInterval(interval);
  }, [idOrCode, refresh, tempsReel]);

  // FRONTIERE DE PHASE. Le client sait a quelle heure la phase en cours se
  // termine : il va chercher la suivante lui-meme, un quart de seconde apres,
  // sans attendre le signal temps reel ni le sondage. Si une version plus
  // recente est arrivee entre-temps (le cas normal, temps reel vivant), il
  // ne fait rien. Garantit qu'une dalle au canal mort affiche la question a
  // l'heure, et plus neuf secondes en retard.
  const phaseEndsAt = state?.phaseEndsAt ?? null;
  const versionCourante = state?.v ?? 0;
  useEffect(() => {
    if (!phaseEndsAt) return;
    const dans = phaseEndsAt - serverNow() + 250 + Math.random() * 350;
    if (dans < 0 || dans > 30 * 60_000) return;
    const version = versionRef.current;
    const t = window.setTimeout(() => {
      if (versionRef.current > version) return;
      void refresh();
    }, dans);
    return () => window.clearTimeout(t);
  }, [phaseEndsAt, versionCourante, refresh]);

  // realtime : sync => refetch si version en avance ; autres events => callback
  useEffect(() => {
    const sessionId = state?.id;
    if (!sessionId) return;
    const unsubscribe = subscribeToGame(sessionId, (e) => {
      if (e.event === 'sync') {
        const v = (e.payload.v as number) ?? 0;
        // le canal parle : sondage de secours au rythme normal
        dernierSyncV.current = Math.max(dernierSyncV.current, v);
        setTempsReel(true);
        if (v <= versionRef.current) return;
        const patch = e.payload.patch as Partial<PublicState> | undefined;
        // Le bloc battle voyage a part : il se fusionne CHAMP PAR CHAMP, la ou
        // le patch principal remplace les cles qu'il porte. C'est ce qui fait
        // arriver la bascule de phase et le NUMERO DE MANCHE ensemble (sinon
        // l'ecran peignait « Manche 0 » au lancement), sans perdre au passage
        // `survivorCount`, seul champ du bloc qui vient de la DB.
        const battlePatch = e.payload.battlePatch as Partial<
          NonNullable<PublicState['battle']>
        > | undefined;
        if (patch) {
          // BASCULE IMMEDIATE. Le serveur embarque de quoi changer de phase sans
          // aller-retour : c'est ce qui fait qu'une borne ouvre sa fenetre de
          // bonus a l'heure au lieu d'attendre son tour dans la ruee de GET
          // /state que declenchait chaque transition.
          versionRef.current = v;
          setState((prev) => {
            if (!prev) return prev;
            const suivant = { ...prev, ...patch, v };
            if (battlePatch && prev.battle) {
              suivant.battle = { ...prev.battle, ...battlePatch };
            }
            return suivant;
          });
        }
        // Reconciliation quand meme, pour ce que le correctif ne porte pas
        // (scores, `you`, bloc reveal). Etalee au hasard : sans ce delai, les
        // quarante clients repartaient ensemble et on retombait dans la ruee.
        const attente = patch ? 150 + Math.random() * 900 : 0;
        window.setTimeout(() => void refresh(), attente);
      } else {
        if (e.event === 'answered') {
          // patch opportuniste du compteur (écrans)
          setState((prev) =>
            prev && prev.currentQuestionIndex === (e.payload.qi as number)
              ? { ...prev }
              : prev,
          );
        }
        onEventRef.current?.(e);
      }
    }, (vivant) => {
      setTempsReel(vivant);
      // le canal revient : on rattrape tout de suite ce qu'on a pu manquer
      if (vivant) void refresh();
    });
    return unsubscribe;
  }, [state?.id, refresh]);

  return { state, you, youAbsent, error, refresh, setYou };
}

/** Compte à rebours basé horloge serveur ; re-render ~4x/s */
export function usePhaseCountdown(phaseEndsAt: number | null): number | null {
  const [remaining, setRemaining] = useState<number | null>(null);
  useEffect(() => {
    if (phaseEndsAt === null) {
      setRemaining(null);
      return;
    }
    const update = () => setRemaining(Math.max(0, phaseEndsAt - serverNow()));
    update();
    const interval = setInterval(update, 250);
    return () => clearInterval(interval);
  }, [phaseEndsAt]);
  return remaining;
}
