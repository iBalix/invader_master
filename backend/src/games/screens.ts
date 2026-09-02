/**
 * Bascule automatique des ecrans physiques du bar (PROJO, BAR01, BAR02).
 *
 * Au lancement d'une session quiz/battle, les postes sont envoyes sur les
 * ecrans V2 (/screen/PROJO pour le projecteur, /screen/BAR pour les deux TV
 * du bar) ; a l'arret, ils reviennent a leur ecran par defaut « Invader ».
 *
 * Meme chemin que la popup de la gestion du bar : l'agent Windows du comptoir
 * (SRV1) execute url_edge_server.ps1, qui ecrit l'URL forcee sur chaque poste
 * dont le nom contient la cible ('BAR' touche BAR01 et BAR02), puis
 * restart_edge.ps1. Le lanceur kiosque des postes relit ce fichier toutes les
 * 5 s.
 *
 * Le retour au defaut passe par le SENTINEL 'DEFAULT' : le back-office ne
 * connait pas l'URL de demarrage des postes (C:\INVADER\kioskURL.txt), c'est le
 * script SRV1 qui la lit sur le poste lui-meme. Une chaine vide, elle, n'est
 * jamais transmise par l'agent (`if ($GameName)`), c'est le defaut de
 * l'ancienne entree « Invader » de la popup : le retour n'arrivait qu'au
 * reboot.
 *
 * FIRE-AND-FORGET STRICT, comme les lumieres : un agent absent ne doit jamais
 * faire echouer la creation ou l'arret d'une session.
 */

import { isAgentConnected, sendCommand } from '../websocket/agent-bridge.js';

const FRONTEND_PUBLIC_URL = (
  process.env.FRONTEND_PUBLIC_URL ?? 'https://invadermaster-frontend-production.up.railway.app'
).replace(/\/+$/, '');

/** SCREENS_AUTOSWITCH=0 coupe la bascule automatique sans redeploiement */
const enabled = process.env.SCREENS_AUTOSWITCH !== '0';

/** compris par url_edge_server.ps1 : recharger kioskURL.txt du poste */
export const DEFAULT_SCREEN_SENTINEL = 'DEFAULT';

/**
 * La popup enchaine url_edge_server puis restart_edge. Un lanceur qui relit
 * forceURL.txt toutes les 5 s redemarre deja Edge tout seul : le restart est
 * alors une seconde coupure pour rien. On garde le comportement de la popup
 * tant que le lanceur des trois postes n'a pas ete verifie, puis on passera
 * a false.
 */
const RESTART_EDGE_AFTER_URL = true;

const CIBLES: Array<{ targetName: string; gameUrl: string }> = [
  { targetName: 'PROJO', gameUrl: `${FRONTEND_PUBLIC_URL}/screen/PROJO` },
  // 'BAR' filtre BAR01 et BAR02 (aucun autre poste ne contient « BAR »)
  { targetName: 'BAR', gameUrl: `${FRONTEND_PUBLIC_URL}/screen/BAR` },
];

if (!enabled) console.log('[screens] bascule automatique desactivee (SCREENS_AUTOSWITCH=0)');

async function run(kind: 'game' | 'default', reason: string): Promise<void> {
  try {
    if (!enabled) return;
    if (!isAgentConnected()) {
      console.log(`[screens] agent absent, ecrans non bascules (${reason})`);
      return;
    }
    for (const cible of CIBLES) {
      const gameName = kind === 'game' ? cible.gameUrl : DEFAULT_SCREEN_SENTINEL;
      const res = await sendCommand('url_edge_server', { targetName: cible.targetName, gameName });
      // le script repond toujours success:true : un poste eteint n'apparait
      // que dans sa sortie (« Une erreur est survenue ... »), on la logue
      console.log(
        `[screens] ${cible.targetName} -> ${gameName} (${reason}) success=${res.success} ${String(res.output ?? '').replace(/\s+/g, ' ').slice(0, 200)}`,
      );
      if (RESTART_EDGE_AFTER_URL) {
        const r2 = await sendCommand('restart_edge', { targetName: cible.targetName });
        console.log(`[screens] ${cible.targetName} restart_edge success=${r2.success}`);
      }
    }
  } catch (err) {
    // jamais remonte : un ecran qui ne bascule pas ne casse pas une partie
    console.error('[screens] erreur de bascule', err);
  }
}

/** les postes passent sur les ecrans V2 de la partie */
export function switchScreensToGame(reason: string): void {
  void run('game', reason).catch(() => undefined);
}

/** les postes reviennent a leur ecran par defaut « Invader » */
export function switchScreensToDefault(reason: string): void {
  void run('default', reason).catch(() => undefined);
}
