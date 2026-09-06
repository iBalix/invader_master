/**
 * Sons de la BATTLE ROYALE, repris tels quels du legacy (invader_table).
 *
 * Ce sont des pistes travaillées pour le bar, pas des cues synthétisés : elles
 * font l'ambiance de la soirée, et la synthèse WebAudio du portage ne les
 * valait pas. Les fichiers vivent dans `public/sounds/battle/`, servis en
 * statique (pas de traitement Vite, cache navigateur long, chargement
 * paresseux : les quatre lits de fond pèsent 15 Mo à eux seuls et ne sont
 * jamais tous nécessaires).
 *
 * Le legacy `question_wrong.mp3` n'était référencé nulle part dans son propre
 * code : il sert ici à l'élimination, qui n'avait pas de son propre.
 */

const B = '/sounds/battle';

export const SON_BATTLE = {
  /** lits de fond, en boucle, canal musique */
  fondNormal: `${B}/background.mp3`,
  fond20: `${B}/background_last20.mp3`,
  fond10: `${B}/background_last10.mp3`,
  fond4: `${B}/background_last4.mp3`,
  /** nappe des règles, en boucle */
  regles: `${B}/rules.mp3`,
  /** effets, canal effets */
  introManche: `${B}/open.mp3`,
  decompte: `${B}/first_3_sec.mp3`,
  troisSecondes: `${B}/last_3_sec.mp3`,
  choix: `${B}/question_choice.mp3`,
  bonneReponse: `${B}/question_correct.mp3`,
  elimination: `${B}/question_wrong.mp3`,
  survivants: `${B}/waiting.mp3`,
  palier: `${B}/start.mp3`,
  vainqueurManche: `${B}/end_round_win.mp3`,
  finManche: `${B}/battle_end.mp3`,
  finPartie: `${B}/end.mp3`,
  transition: `${B}/start_fade.mp3`,
} as const;

/**
 * Le lit de fond suit le nombre de survivants, aux seuils du legacy : la
 * tension monte toute seule à mesure que la salle se vide, sans que
 * l'animateur touche à quoi que ce soit.
 *
 * Pris sur la valeur PUBLIÉE par le serveur, jamais sur un minuteur : un
 * écran qui recharge en pleine manche retombe sur la bonne piste.
 */
export function fondPourSurvivants(survivants: number): string {
  if (survivants <= 4) return SON_BATTLE.fond4;
  if (survivants <= 10) return SON_BATTLE.fond10;
  if (survivants <= 20) return SON_BATTLE.fond20;
  return SON_BATTLE.fondNormal;
}
