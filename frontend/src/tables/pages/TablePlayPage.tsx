/**
 * Partie quiz / battle royale jouee DEPUIS une borne tactile.
 *
 * Enveloppe la surface joueur (frontend/src/game/player/PlayerApp) sans la
 * dupliquer. L'interet d'etre ici plutot que sur /play, c'est de rester dans
 * l'arbre /table/* et donc sous TableLayout : la borne garde son heartbeat et
 * continue de suivre les ordres de lancement de jeu. Auparavant, un client
 * envoye sur /play sortait du kiosque et la borne y restait bloquee, sans
 * retour possible et sans veille.
 *
 * Le client peut donc faire l'aller-retour partie -> carte -> jeux -> partie
 * autant qu'il veut : son identite vit en localStorage et tout l'etat de jeu
 * (score, reponses, serie) est rejoue par le serveur au retour.
 */

import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import PlayerApp from '../../game/player/PlayerApp';
import { useHostname } from '../hooks/useHostname';
import { useLiveGame } from '../hooks/useLiveGame';

/**
 * Delai avant de renoncer quand aucune partie n'est trouvee a l'arrivee.
 * useLiveGame demarre a null le temps de son premier appel : partir tout de
 * suite renverrait a l'accueil avant meme d'avoir regarde.
 */
const NO_GAME_GRACE_MS = 4000;

export default function TablePlayPage() {
  const identity = useHostname();
  const liveGame = useLiveGame();
  const navigate = useNavigate();
  const seenGame = useRef(false);

  useEffect(() => {
    if (liveGame) {
      seenGame.current = true;
      return;
    }
    // Partie terminee par le GM (ou aucune partie) : on rentre. Necessaire
    // parce que l'inactivite est desactivee sur cet ecran, la borne resterait
    // sinon allumee sur une partie finie.
    const delay = seenGame.current ? 0 : NO_GAME_GRACE_MS;
    const timer = window.setTimeout(() => navigate('/table/home', { replace: true }), delay);
    return () => window.clearTimeout(timer);
  }, [liveGame, navigate]);

  return (
    // Colonne centree : la surface joueur est pensee pour un telephone, elle
    // serait illisible etiree sur une dalle 1920 en paysage.
    <div className="mx-auto h-full w-full max-w-[34rem]">
      <PlayerApp
        embedded
        deviceLabel={identity?.hostname}
        onExit={() => navigate('/table/home', { replace: true })}
      />
    </div>
  );
}
