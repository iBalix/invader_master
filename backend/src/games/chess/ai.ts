/**
 * Adversaire machine : minimax alpha-beta par-dessus chess.js, pur et sans I/O
 * (même esprit que rules.ts).
 *
 * Pourquoi pas un LLM : il propose régulièrement des coups illégaux, répond en
 * 1 à 3 secondes et coûte à chaque coup, pour un niveau faible et instable.
 * Ici tout est local, gratuit, toujours légal, et calibré au coup près.
 *
 * CONTRAINTE MAJEURE : Node est mono-thread et ce serveur sert aussi le
 * blackjack et les commandes du bar. Un calcul long gèlerait TOUT. chess.js ne
 * fait qu'environ 15 000 coups/seconde (mesuré), ce qui donne, sans tri des
 * coups : profondeur 2 ≈ 50 ms, profondeur 3 ≈ 190 ms, profondeur 4 ≈ 2,2 s.
 * La profondeur 4 est donc exclue, et la recherche est bornée par un
 * approfondissement itératif + un cap temporel dur : on garde toujours le
 * meilleur coup de la dernière profondeur complètement explorée.
 */

import { Chess, type Move } from 'chess.js';
import crypto from 'crypto';
import type { ChessColor, PromotionPiece } from './types.js';

export type AiLevel = 1 | 2 | 3;

interface LevelConfig {
  /** profondeur visée (l'approfondissement itératif peut s'arrêter avant) */
  depth: number;
  /**
   * Profondeur de recherche des captures au-delà de la profondeur nominale.
   * SANS ELLE, un moteur s'arrête au milieu d'un échange et croit avoir gagné
   * une pièce qui va être reprise : mesuré, il prenait un pion défendu et
   * pendait son cavalier 12 fois sur 12. 0 = laissé volontairement pour le
   * niveau débutant, c'est ce qui lui donne ses gaffes crédibles.
   */
  quiescence: number;
  /**
   * Budget de calcul en ms, PAR NIVEAU : c'est lui qui borne le blocage de
   * l'event loop, et c'est aussi ce qui hiérarchise vraiment les niveaux (un
   * budget commun les ramenait tous au même coût, donc à la même force).
   */
  budgetMs: number;
  /**
   * probabilité de jouer volontairement un coup moyen plutôt que le meilleur.
   * C'est ce qui rend le niveau 1 battable par un débutant : la machine ne
   * cherche pas à perdre, elle "ne voit pas" le meilleur coup.
   */
  blunderRate: number;
}

export const AI_LEVELS: Record<AiLevel, LevelConfig> = {
  1: { depth: 1, quiescence: 0, budgetMs: 30, blunderRate: 0.55 },
  2: { depth: 2, quiescence: 2, budgetMs: 90, blunderRate: 0.18 },
  3: { depth: 3, quiescence: 4, budgetMs: 260, blunderRate: 0 },
};

/** délai de réflexion affiché : un coup instantané est déroutant */
export const AI_THINK_MS = 850;
/** plafond dur, le plus large des budgets : sert à borner la pendule */
export const AI_TIME_CAP_MS = 260;

/**
 * Temps de pendule imputable à la machine pour un coup. Sans ce plafond, un
 * redémarrage du serveur pendant son tour lui ferait payer toute la coupure
 * (le temps se mesure en horloge murale) et elle perdrait au temps une partie
 * qu'elle gagnait. Elle ne paie donc que sa réflexion prévue, avec une marge.
 */
export const AI_MAX_ELAPSED_MS = AI_THINK_MS + AI_TIME_CAP_MS + 1_500;

export function isAiLevel(value: unknown): value is AiLevel {
  return value === 1 || value === 2 || value === 3;
}

// ---------------------------------------------------------------------------
// Évaluation
// ---------------------------------------------------------------------------

const PIECE_VALUE: Record<string, number> = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };

/**
 * Tables de position (point de vue des blancs, case a8 en premier). Sans
 * elles, la machine sort sa dame trop tôt et laisse ses pions immobiles : le
 * matériel seul ne suffit pas à donner l'impression d'un adversaire qui joue.
 */
const PST: Record<string, number[]> = {
  p: [
      0,  0,  0,  0,  0,  0,  0,  0,
     50, 50, 50, 50, 50, 50, 50, 50,
     10, 10, 20, 30, 30, 20, 10, 10,
      5,  5, 10, 25, 25, 10,  5,  5,
      0,  0,  0, 20, 20,  0,  0,  0,
      5, -5,-10,  0,  0,-10, -5,  5,
      5, 10, 10,-20,-20, 10, 10,  5,
      0,  0,  0,  0,  0,  0,  0,  0,
  ],
  n: [
    -50,-40,-30,-30,-30,-30,-40,-50,
    -40,-20,  0,  0,  0,  0,-20,-40,
    -30,  0, 10, 15, 15, 10,  0,-30,
    -30,  5, 15, 20, 20, 15,  5,-30,
    -30,  0, 15, 20, 20, 15,  0,-30,
    -30,  5, 10, 15, 15, 10,  5,-30,
    -40,-20,  0,  5,  5,  0,-20,-40,
    -50,-40,-30,-30,-30,-30,-40,-50,
  ],
  b: [
    -20,-10,-10,-10,-10,-10,-10,-20,
    -10,  0,  0,  0,  0,  0,  0,-10,
    -10,  0,  5, 10, 10,  5,  0,-10,
    -10,  5,  5, 10, 10,  5,  5,-10,
    -10,  0, 10, 10, 10, 10,  0,-10,
    -10, 10, 10, 10, 10, 10, 10,-10,
    -10,  5,  0,  0,  0,  0,  5,-10,
    -20,-10,-10,-10,-10,-10,-10,-20,
  ],
  r: [
      0,  0,  0,  0,  0,  0,  0,  0,
      5, 10, 10, 10, 10, 10, 10,  5,
     -5,  0,  0,  0,  0,  0,  0, -5,
     -5,  0,  0,  0,  0,  0,  0, -5,
     -5,  0,  0,  0,  0,  0,  0, -5,
     -5,  0,  0,  0,  0,  0,  0, -5,
     -5,  0,  0,  0,  0,  0,  0, -5,
      0,  0,  0,  5,  5,  0,  0,  0,
  ],
  q: [
    -20,-10,-10, -5, -5,-10,-10,-20,
    -10,  0,  0,  0,  0,  0,  0,-10,
    -10,  0,  5,  5,  5,  5,  0,-10,
     -5,  0,  5,  5,  5,  5,  0, -5,
      0,  0,  5,  5,  5,  5,  0, -5,
    -10,  5,  5,  5,  5,  5,  0,-10,
    -10,  0,  5,  0,  0,  0,  0,-10,
    -20,-10,-10, -5, -5,-10,-10,-20,
  ],
  k: [
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -20,-30,-30,-40,-40,-30,-30,-20,
    -10,-20,-20,-20,-20,-20,-20,-10,
     20, 20,  0,  0,  0,  0, 20, 20,
     20, 30, 10,  0,  0, 10, 30, 20,
  ],
};

const MATE_SCORE = 100_000;

/**
 * Score de la position, TOUJOURS du point de vue des blancs (positif = les
 * blancs sont mieux). chess.board() renvoie les rangées de la 8 à la 1, donc
 * l'index de la table correspond directement pour les blancs, et se reflète
 * verticalement pour les noirs.
 */
export function evaluate(chess: Chess): number {
  let score = 0;
  const board = chess.board();
  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const square = board[rank][file];
      if (!square) continue;
      const index = rank * 8 + file;
      const table = PST[square.type];
      if (square.color === 'w') {
        score += PIECE_VALUE[square.type] + (table ? table[index] : 0);
      } else {
        // miroir vertical pour les noirs
        const mirrored = (7 - rank) * 8 + file;
        score -= PIECE_VALUE[square.type] + (table ? table[mirrored] : 0);
      }
    }
  }
  return score;
}

/**
 * Tri des coups : les captures juteuses d'abord (MVV-LVA), puis les promotions
 * et les échecs. C'est ce qui fait couper l'alpha-beta tôt, donc ce qui rend la
 * profondeur 3 tenable dans le budget de temps.
 */
function orderMoves(moves: Move[]): Move[] {
  return moves
    .map((move) => {
      let score = 0;
      if (move.captured) {
        score += 10 * PIECE_VALUE[move.captured] - PIECE_VALUE[move.piece];
      }
      if (move.promotion) score += PIECE_VALUE[move.promotion];
      if (move.san.includes('+')) score += 50;
      return { move, score };
    })
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.move);
}

/**
 * Recherche de quiescence : au bout de la profondeur nominale, on ne s'arrête
 * PAS au milieu d'un échange. On continue à explorer les seules captures
 * jusqu'à ce que la position soit calme, sinon la machine confond « je prends
 * une pièce » et « je gagne une pièce ».
 */
function quiesce(chess: Chess, alpha: number, beta: number, depth: number, deadline: number): number {
  const raw = evaluate(chess);
  const standPat = chess.turn() === 'w' ? raw : -raw;
  if (depth === 0) return standPat;
  // ne rien faire est toujours une option (sauf à être forcé de capturer)
  if (standPat >= beta) return beta;
  if (standPat > alpha) alpha = standPat;

  const captures = (chess.moves({ verbose: true }) as Move[]).filter(
    (move) => move.captured || move.promotion,
  );
  for (const move of orderMoves(captures)) {
    chess.move(move);
    const score = -quiesce(chess, -beta, -alpha, depth - 1, deadline);
    chess.undo();
    if (score >= beta) return beta;
    if (score > alpha) alpha = score;
    if (Date.now() > deadline) break;
  }
  return alpha;
}

/** négamax alpha-beta : renvoie le score du camp au trait */
function search(
  chess: Chess,
  depth: number,
  alpha: number,
  beta: number,
  deadline: number,
  quiescence: number,
): number {
  if (depth === 0) {
    if (quiescence > 0) return quiesce(chess, alpha, beta, quiescence, deadline);
    const raw = evaluate(chess);
    return chess.turn() === 'w' ? raw : -raw;
  }
  const moves = chess.moves({ verbose: true }) as Move[];
  if (moves.length === 0) {
    // mat : d'autant plus grave qu'il arrive tôt ; pat : nulle
    return chess.isCheckmate() ? -MATE_SCORE - depth : 0;
  }
  let best = -Infinity;
  for (const move of orderMoves(moves)) {
    chess.move(move);
    const score = -search(chess, depth - 1, -beta, -alpha, deadline, quiescence);
    chess.undo();
    if (score > best) best = score;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
    // le cap temporel prime : on rend la main avec ce qu'on a
    if (Date.now() > deadline) break;
  }
  return best;
}

export interface AiMove {
  from: string;
  to: string;
  promotion?: PromotionPiece;
}

/**
 * Choisit le coup de la machine. `chess` est laissé INTACT (chaque coup essayé
 * est annulé) : l'appelant reste maître de l'application du coup.
 */
export function chooseAiMove(chess: Chess, level: AiLevel): AiMove | null {
  const legal = chess.moves({ verbose: true }) as Move[];
  if (legal.length === 0) return null;

  const config = AI_LEVELS[level];
  const deadline = Date.now() + config.budgetMs;
  const ordered = orderMoves(legal);

  // scores de la dernière profondeur entièrement explorée
  let scored: Array<{ move: Move; score: number }> = ordered.map((move) => ({ move, score: 0 }));

  for (let depth = 1; depth <= config.depth; depth++) {
    const round: Array<{ move: Move; score: number }> = [];
    let aborted = false;
    for (const move of ordered) {
      chess.move(move);
      const score = -search(chess, depth - 1, -Infinity, Infinity, deadline, config.quiescence);
      chess.undo();
      round.push({ move, score });
      if (Date.now() > deadline) {
        aborted = true;
        break;
      }
    }
    // une profondeur partielle fausserait le classement : on la jette
    if (!aborted) scored = round;
    if (aborted) break;
  }

  scored.sort((a, b) => b.score - a.score);

  // erreur volontaire : on prend un coup correct mais pas le meilleur, jamais
  // une catastrophe (on reste dans la moitié haute du classement)
  const wantsBlunder = config.blunderRate > 0 && crypto.randomInt(100) < config.blunderRate * 100;
  if (wantsBlunder && scored.length > 1) {
    const pool = Math.max(2, Math.ceil(scored.length / 2));
    const pick = scored[crypto.randomInt(Math.min(pool, scored.length))];
    return toAiMove(pick.move);
  }

  // départage aléatoire entre coups de même valeur : deux parties de suite ne
  // se ressemblent pas
  const best = scored[0].score;
  const equals = scored.filter((entry) => entry.score === best);
  return toAiMove(equals[crypto.randomInt(equals.length)].move);
}

function toAiMove(move: Move): AiMove {
  return {
    from: move.from,
    to: move.to,
    promotion: (move.promotion as PromotionPiece | undefined) ?? undefined,
  };
}

/**
 * La machine accepte-t-elle la nulle ? Elle refuse si elle est devant, accepte
 * si elle est nettement derrière (comme un joueur qui sauve un demi-point).
 */
export function aiAcceptsDraw(chess: Chess, aiColor: ChessColor): boolean {
  const raw = evaluate(chess);
  const fromAi = aiColor === 'w' ? raw : -raw;
  return fromAi <= -300;
}
