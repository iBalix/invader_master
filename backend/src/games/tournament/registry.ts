/**
 * Jeux proposés pour un événement, et validation de la configuration.
 *
 * Un jeu « auto » fait remonter ses résultats tout seul (pont dédié, ex.
 * chessBridge) ; l'animateur peut toujours saisir ou corriger un résultat à
 * la main. Ajouter un « jeu libre » à saisie manuelle = une entrée ici.
 */

import {
  DEFAULT_TOURNAMENT_CONFIG,
  httpErr,
  type ByePolicy,
  type MatchDecide,
  type MatchScoring,
  type TournamentConfig,
  type TournamentGameId,
} from './types.js';

export interface TournamentGameDef {
  id: TournamentGameId;
  label: string;
  results: 'auto' | 'manual';
  supportsDraw: boolean;
  /** exempt conseillé : attendre un joueur libéré, ou créditer d'office */
  defaultByePolicy: ByePolicy;
  /** une partie en cours peut être montrée au projecteur */
  liveView: boolean;
}

export const TOURNAMENT_GAMES: Record<TournamentGameId, TournamentGameDef> = {
  chess: {
    id: 'chess',
    label: 'Échecs',
    results: 'auto',
    supportsDraw: true,
    defaultByePolicy: 'floater',
    liveView: true,
  },
};

export const TOURNAMENT_FORMATS = { swiss: { id: 'swiss', label: 'Rondes suisses' } } as const;

function bad(detail: string): Error {
  return httpErr(`error_tournament_bad_config: ${detail}`, 400);
}

function int(v: unknown, min: number, max: number, fallback: number, name: string): number {
  if (v === undefined || v === null || v === '') return fallback;
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw bad(`${name} doit être un entier entre ${min} et ${max}`);
  return n;
}

function num(v: unknown, min: number, max: number, fallback: number, name: string): number {
  if (v === undefined || v === null || v === '') return fallback;
  const n = Number(v);
  // demi-points acceptés (barèmes 1 / 0,5 / 0)
  if (!Number.isFinite(n) || n < min || n > max || Math.round(n * 2) !== n * 2) {
    throw bad(`${name} doit être un nombre entre ${min} et ${max} (pas de 0,5)`);
  }
  return n;
}

function text(v: unknown, max: number, fallback: string): string {
  if (typeof v !== 'string') return fallback;
  const t = v.trim();
  return t ? t.slice(0, max) : fallback;
}

/**
 * Configuration complète et bornée à partir d'une saisie partielle (modèle
 * enregistré, formulaire de la console). Tout champ absent prend sa valeur
 * par défaut ; un champ hors bornes est refusé (400), jamais corrigé en douce.
 */
export function normalizeTournamentConfig(input: unknown, base: TournamentConfig = DEFAULT_TOURNAMENT_CONFIG): TournamentConfig {
  const src = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const match = (src.match && typeof src.match === 'object' ? src.match : {}) as Record<string, unknown>;
  const points = (src.points && typeof src.points === 'object' ? src.points : {}) as Record<string, unknown>;
  const display = (src.display && typeof src.display === 'object' ? src.display : {}) as Record<string, unknown>;
  const texts = (src.texts && typeof src.texts === 'object' ? src.texts : {}) as Record<string, unknown>;

  const format = src.format ?? base.format;
  if (format !== 'swiss') throw bad('mode de compétition inconnu');
  const game = (src.game ?? base.game) as TournamentGameId;
  if (!TOURNAMENT_GAMES[game]) throw bad('jeu inconnu');

  const decide = (match.decide ?? base.match.decide) as MatchDecide;
  if (decide !== 'best_of' && decide !== 'all') throw bad('décision de match inconnue');
  const scoring = (match.scoring ?? base.match.scoring) as MatchScoring;
  if (scoring !== 'match' && scoring !== 'game') throw bad('barème inconnu');
  const byePolicy = (src.byePolicy ?? base.byePolicy) as ByePolicy;
  if (byePolicy !== 'floater' && byePolicy !== 'points') throw bad('politique d\'exempt inconnue');

  const plannedRaw = src.plannedRounds === undefined ? base.plannedRounds : src.plannedRounds;
  const plannedRounds =
    plannedRaw === null || plannedRaw === '' || plannedRaw === 0 ? null : int(plannedRaw, 1, 20, 1, 'plannedRounds');

  return {
    title: text(src.title, 60, base.title),
    templateId: typeof src.templateId === 'string' ? src.templateId : base.templateId,
    templateName: typeof src.templateName === 'string' ? src.templateName.slice(0, 60) : base.templateName,
    format: 'swiss',
    game,
    registrationMin: int(src.registrationMin, 1, 120, base.registrationMin, 'registrationMin'),
    lateJoin: typeof src.lateJoin === 'boolean' ? src.lateJoin : base.lateJoin,
    plannedRounds,
    match: {
      games: int(match.games, 1, 9, base.match.games, 'match.games'),
      decide,
      scoring,
    },
    points: {
      win: num(points.win, 0, 100, base.points.win, 'points.win'),
      draw: num(points.draw, 0, 100, base.points.draw, 'points.draw'),
      loss: num(points.loss, 0, 100, base.points.loss, 'points.loss'),
      forfeit: num(points.forfeit, 0, 100, base.points.forfeit, 'points.forfeit'),
      bye: num(points.bye, 0, 100, base.points.bye, 'points.bye'),
    },
    byePolicy,
    display: {
      standingsMs: int(display.standingsMs, 10_000, 300_000, base.display.standingsMs, 'display.standingsMs'),
      roundMs: int(display.roundMs, 10_000, 300_000, base.display.roundMs, 'display.roundMs'),
      liveMs: int(display.liveMs, 0, 900_000, base.display.liveMs, 'display.liveMs'),
    },
    wifiSsid: text(src.wifiSsid, 40, base.wifiSsid),
    wifiPassword: typeof src.wifiPassword === 'string' ? src.wifiPassword.trim().slice(0, 40) : base.wifiPassword,
    texts: { winner: text(texts.winner, 140, base.texts.winner) },
    testMode: typeof src.testMode === 'boolean' ? src.testMode : base.testMode,
  };
}

/**
 * Réglages modifiables en cours de tournoi (set-config) : tout sauf le jeu,
 * le format et le mode test, qui changeraient la nature de l'événement.
 */
export function patchTournamentConfig(current: TournamentConfig, patch: unknown): TournamentConfig {
  const src = (patch && typeof patch === 'object' ? patch : {}) as Record<string, unknown>;
  const { game: _g, format: _f, testMode: _t, templateId: _ti, templateName: _tn, ...rest } = src;
  const merged = {
    ...current,
    ...rest,
    match: { ...current.match, ...((rest.match as object) ?? {}) },
    points: { ...current.points, ...((rest.points as object) ?? {}) },
    display: { ...current.display, ...((rest.display as object) ?? {}) },
    texts: { ...current.texts, ...((rest.texts as object) ?? {}) },
  };
  const next = normalizeTournamentConfig(merged, current);
  return { ...next, game: current.game, format: current.format, testMode: current.testMode, templateId: current.templateId, templateName: current.templateName };
}

/**
 * Périmètre des tournois traités par CE process.
 *   live : les vrais tournois (défaut sur Railway) ;
 *   test : seulement les tournois de test (défaut en local, dont le .env
 *          pointe sur la base de PRODUCTION : un backend de dev ne doit
 *          jamais toucher un vrai tournoi, ni la prod un tournoi de test) ;
 *   all  : les deux.
 * Surcharge : TOURNAMENT_SCOPE.
 */
export type TournamentScope = 'live' | 'test' | 'all';

const onRailway = Boolean(
  process.env.RAILWAY_ENVIRONMENT ||
    process.env.RAILWAY_ENVIRONMENT_ID ||
    process.env.RAILWAY_PROJECT_ID ||
    process.env.RAILWAY_SERVICE_ID,
);

export const TOURNAMENT_SCOPE: TournamentScope = (() => {
  const v = process.env.TOURNAMENT_SCOPE;
  if (v === 'live' || v === 'test' || v === 'all') return v;
  return onRailway ? 'live' : 'test';
})();

export function inScope(cfg: { testMode?: boolean }): boolean {
  if (TOURNAMENT_SCOPE === 'all') return true;
  return TOURNAMENT_SCOPE === 'test' ? cfg.testMode === true : cfg.testMode !== true;
}
