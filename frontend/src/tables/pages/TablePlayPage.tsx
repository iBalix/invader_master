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

/**
 * Agrandissement de la surface joueur sur la dalle.
 *
 * POURQUOI : cette surface est dessinee pour un telephone tenu a 30 cm. Mesuree
 * telle quelle sur une borne 1920x1080, elle donnait des boutons de reponse de
 * 54 px de haut en police 16, des libelles d'etat en 12 px, et une colonne de
 * 544 px, soit 28 % de la largeur. Or on joue avec les doigts, sur une dalle
 * regardee de biais et a un bras de distance.
 *
 * COMMENT : un zoom CSS sur le conteneur plutot que des dizaines de classes
 * conditionnelles dans PlayerApp. Le zoom agrandit tout de facon homogene,
 * texte ET zones tactiles, sans risquer d'oublier un endroit et sans toucher a
 * l'experience telephone. A 1.4 : boutons de reponse a 76 px, police de
 * question a 22 px, colonne a 762 px.
 *
 * Subtilite verifiee a la mesure, et contre-intuitive : sous `zoom`, les
 * longueurs absolues sont bien multipliees, mais les tailles en POURCENTAGE ne
 * le sont pas, elles se resolvent contre le parent et restent telles quelles.
 * Donc `h-full w-full` suffit et il ne faut SURTOUT pas compenser en
 * `100 / ECHELLE` : essaye, et la colonne s'arrete a 771 px de haut sur 1080 en
 * laissant une bande noire en bas.
 *
 * AUCUN PLAFOND DE LARGEUR ICI, et c'est deliberé : un `max-w` en rem se fait
 * multiplier par le zoom. Un plafond de 80rem donnait 1792 px, ce qui debordait
 * sur les dalles 4:3 en 1280 (le parc est mixte, 4:3 et 16:9). En pourcentage,
 * le conteneur epouse exactement la dalle quelle que soit sa resolution ; ce
 * sont les ecrans internes qui plafonnent leur propre contenu.
 */
const ECHELLE_DALLE = 1.4;

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
    // Pleine dalle, agrandie (cf. ECHELLE_DALLE). Ce sont les ecrans internes
    // qui plafonnent leur propre largeur de lecture.
    <div className="h-full w-full" style={{ zoom: ECHELLE_DALLE }}>
      <PlayerApp
        embedded
        deviceLabel={identity?.hostname}
        onExit={() => navigate('/table/home', { replace: true })}
      />
    </div>
  );
}
