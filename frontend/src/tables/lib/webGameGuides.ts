/**
 * Contenu de la pop-up de présentation des jeux maison (jeux web : échecs,
 * blackjack, Flappy Bar...).
 *
 * Les émulateurs ont leur modale (vidéo, manettes, rappel des touches). Les
 * jeux maison n'ont besoin d'aucune manette : la colonne de droite sert donc à
 * expliquer le jeu, comment on crée ou rejoint une partie entre tables, et les
 * règles en bref.
 *
 * Le contenu vit ici et non en base parce qu'il décrit le code du jeu
 * (cadences, jokers, règles de collision) : il doit bouger avec lui. Les textes
 * passent par des clés i18n, donc restent surchargeables depuis le
 * back-office des traductions sans redéploiement.
 *
 * Clé du registre = game_url du catalogue (games), identité stable des jeux
 * web. Un jeu web absent du registre reçoit le guide générique : la pop-up
 * s'affiche quand même, avec la description du catalogue.
 */

import {
  Bot,
  Coins,
  Crosshair,
  Eye,
  Hand,
  Layers,
  Pointer,
  Repeat,
  Rocket,
  Spade,
  Swords,
  Timer,
  Trophy,
  Users,
  Zap,
  type LucideIcon,
} from 'lucide-react';

/** lobby interrogé pour la ligne « en ce moment dans le bar » */
export type WebGameLive = 'chess' | 'blackjack' | 'flappybar' | 'barinvaders';

export interface WebGameGuideItem {
  icon: LucideIcon;
  /** clé i18n ; les étapes lisent `<key>.title` et `<key>.body` */
  key: string;
}

export interface WebGameGuide {
  /** couleur d'accent, reprise du lobby du jeu */
  accent: string;
  /** fiche du jeu sous la description : joueurs, durée, spectateurs... */
  facts: WebGameGuideItem[];
  /** « comment ça marche » : créer, rejoindre, jouer */
  steps: WebGameGuideItem[];
  /** les règles en bref, une clé par puce */
  rules: string[];
  live: WebGameLive | null;
}

const CHESS: WebGameGuide = {
  accent: '#33E2FF',
  facts: [
    { icon: Users, key: 'table.webgame.chess.fact.players' },
    { icon: Timer, key: 'table.webgame.chess.fact.clock' },
    { icon: Eye, key: 'table.webgame.chess.fact.spectators' },
  ],
  steps: [
    { icon: Swords, key: 'table.webgame.chess.step.create' },
    { icon: Users, key: 'table.webgame.chess.step.join' },
    { icon: Bot, key: 'table.webgame.chess.step.ai' },
    { icon: Repeat, key: 'table.webgame.chess.step.after' },
  ],
  rules: [
    'table.webgame.chess.rule.official',
    'table.webgame.chess.rule.ready',
    'table.webgame.chess.rule.draw',
    'table.webgame.chess.rule.flag',
  ],
  live: 'chess',
};

const BLACKJACK: WebGameGuide = {
  accent: '#5ED9A1',
  facts: [
    { icon: Users, key: 'table.webgame.bj.fact.players' },
    { icon: Layers, key: 'table.webgame.bj.fact.rounds' },
    { icon: Eye, key: 'table.webgame.bj.fact.spectators' },
  ],
  steps: [
    { icon: Coins, key: 'table.webgame.bj.step.create' },
    { icon: Users, key: 'table.webgame.bj.step.join' },
    { icon: Spade, key: 'table.webgame.bj.step.play' },
    { icon: Zap, key: 'table.webgame.bj.step.jokers' },
  ],
  rules: [
    'table.webgame.bj.rule.goal',
    'table.webgame.bj.rule.values',
    'table.webgame.bj.rule.dealer',
    'table.webgame.bj.rule.winner',
  ],
  live: 'blackjack',
};

const FLAPPY: WebGameGuide = {
  accent: '#FF3EA5',
  facts: [
    { icon: Users, key: 'table.webgame.flap.fact.players' },
    { icon: Timer, key: 'table.webgame.flap.fact.rounds' },
    { icon: Trophy, key: 'table.webgame.flap.fact.records' },
  ],
  steps: [
    { icon: Rocket, key: 'table.webgame.flap.step.create' },
    { icon: Users, key: 'table.webgame.flap.step.join' },
    { icon: Pointer, key: 'table.webgame.flap.step.play' },
    { icon: Trophy, key: 'table.webgame.flap.step.records' },
  ],
  rules: [
    'table.webgame.flap.rule.tap',
    'table.webgame.flap.rule.pipes',
    'table.webgame.flap.rule.speed',
    'table.webgame.flap.rule.end',
  ],
  live: 'flappybar',
};

const INVADERS: WebGameGuide = {
  accent: '#3DFF8A',
  facts: [
    { icon: Users, key: 'table.webgame.inv.fact.players' },
    { icon: Timer, key: 'table.webgame.inv.fact.rounds' },
    { icon: Trophy, key: 'table.webgame.inv.fact.records' },
  ],
  steps: [
    { icon: Rocket, key: 'table.webgame.inv.step.create' },
    { icon: Users, key: 'table.webgame.inv.step.join' },
    { icon: Crosshair, key: 'table.webgame.inv.step.play' },
    { icon: Eye, key: 'table.webgame.inv.step.watch' },
  ],
  rules: [
    'table.webgame.inv.rule.fleet',
    'table.webgame.inv.rule.shields',
    'table.webgame.inv.rule.ufo',
    'table.webgame.inv.rule.end',
  ],
  live: 'barinvaders',
};

/** jeu web pas encore décrit ici : l'essentiel, valable pour tous */
const GENERIC: WebGameGuide = {
  accent: '#A664FF',
  facts: [{ icon: Hand, key: 'table.webgame.generic.fact.touch' }],
  steps: [
    { icon: Swords, key: 'table.webgame.generic.step.create' },
    { icon: Users, key: 'table.webgame.generic.step.join' },
    { icon: Hand, key: 'table.webgame.generic.step.touch' },
  ],
  rules: [],
  live: null,
};

const GUIDES: Record<string, WebGameGuide> = {
  '/table/games/chess': CHESS,
  '/table/games/blackjack': BLACKJACK,
  '/table/games/flappybar': FLAPPY,
  '/table/games/barinvaders': INVADERS,
};

export function webGameGuide(gameUrl: string | null | undefined): WebGameGuide {
  if (!gameUrl) return GENERIC;
  // une URL saisie avec une barre finale ou des paramètres reste reconnue
  const path = gameUrl.split(/[?#]/)[0].replace(/\/+$/, '');
  return GUIDES[path] ?? GENERIC;
}
