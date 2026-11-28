/**
 * Travaux de fond du backend : ordonnanceur des lancements de jeux sur les
 * tables, balayage des sessions de jeu arrivees a echeance, rattrapage des
 * parties d'echecs de tournoi.
 *
 * Ces travaux relisent leurs echeances en base. Deux backends branches sur la
 * meme base les feraient donc tourner en double, et celui qui n'a ni les
 * tables ni les joueurs connectes pourrait faire avancer une soiree a la place
 * de l'autre.
 *
 * L'environnement staging partage la base de la production : il coupe ces
 * travaux avec BACKGROUND_JOBS=off. Sans la variable (production, poste de
 * dev), ils tournent comme avant.
 */
export const BACKGROUND_JOBS_ENABLED =
  (process.env.BACKGROUND_JOBS ?? '').trim().toLowerCase() !== 'off';

/**
 * Vrai sur l'environnement staging. Railway renseigne tout seul
 * RAILWAY_ENVIRONMENT_NAME ("production" ou "staging") ; APP_ENV permet de
 * forcer la valeur ailleurs, par exemple APP_ENV=staging sur un poste de dev.
 */
export const IS_STAGING =
  (process.env.APP_ENV ?? process.env.RAILWAY_ENVIRONMENT_NAME ?? '').trim().toLowerCase() === 'staging';
