/**
 * Analyse de partie, calculée SUR LA DALLE.
 *
 * POURQUOI ICI ET PAS SUR LE SERVEUR : le backend est mono-thread et sert en
 * même temps le blackjack, les commandes du bar et les autres tables. Analyser
 * une quarantaine de coups à profondeur 3 y bloquerait la boucle d'événements
 * une dizaine de secondes (cf. les mesures en tête de `backend/src/games/chess/ai.ts`).
 * La dalle, elle, ne fait plus rien une fois la partie finie : c'est le bon
 * endroit pour ce calcul.
 *
 * POURQUOI CE CODE EST DUPLIQUÉ : `PIECE_VALUE`, `PST`, `orderMoves`,
 * `quiesce` et `search` sont repris À L'IDENTIQUE du moteur serveur. Le
 * backend et le frontend sont deux paquets indépendants, sans dossier partagé,
 * et `chess.js` y est dans la même version (1.4.0) : les scores rendus ici sont
 * donc exactement ceux que la machine aurait calculés. Si le barème du moteur
 * change côté serveur, il faut le répercuter ici.
 *
 * On ne réutilise pas `chooseAiMove` : il fausse volontairement son choix aux
 * niveaux 1 et 2 (pour donner un adversaire abordable) et jette le score du
 * coup retenu, alors que l'analyse a besoin du meilleur coup réel et de son
 * score pour juger celui qui a été joué.
 */

import { Chess, type Move } from 'chess.js';

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

function evaluate(chess: Chess): number {
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

// ---------------------------------------------------------------------------
// Analyse
// ---------------------------------------------------------------------------

/**
 * Profondeur de l'analyse. AUCUN budget de temps ici, volontairement : couper
 * la recherche en cours de route donnerait à chaque coup candidat un effort
 * différent selon sa place dans l'ordre d'exploration, et la comparaison
 * « coup joué contre meilleur coup » n'aurait plus aucun sens. Un premier
 * essai avec un budget partagé classait e4 et Nf3 en gaffes, simplement parce
 * qu'ils étaient évalués après l'expiration du délai.
 *
 * L'analyse est donc déterministe : deux passages sur la même partie rendent
 * exactement le même verdict.
 *
 * Profondeur 1 : c'est la QUIESCENCE qui fait le travail ici, en poursuivant
 * les échanges jusqu'à ce que la position soit calme. C'est exactement ce
 * qu'il faut pour repérer « tu as laissé ta dame en prise », et ça tient en
 * une seconde sur une partie entière là où la profondeur 2 demandait cinq
 * fois plus pour des verdicts à peine différents.
 */
const ANALYSE_DEPTH = 1;
const ANALYSE_QUIESCENCE = 4;
/** sentinelle : `search` attend une échéance, on lui en donne une hors d'atteinte */
const NO_DEADLINE = Number.MAX_SAFE_INTEGER;

export type MoveVerdict = 'blunder' | 'mistake' | 'inaccuracy' | 'best' | 'good';

export interface AnalysedMove {
  /** demi-coup, 0 = premier coup des blancs */
  ply: number;
  san: string;
  uci: string;
  color: 'w' | 'b';
  /** évaluation après le coup joué, en centipions, du point de vue des blancs */
  scoreAfter: number;
  /** ce que le joueur a perdu par rapport au meilleur coup (centipions, >= 0) */
  loss: number;
  verdict: MoveVerdict;
  /** meilleur coup de la position, en SAN, quand il diffère de celui joué */
  bestSan: string | null;
}

export interface GameAnalysis {
  moves: AnalysedMove[];
  /** ply du coup qui a le plus coûté, toutes couleurs confondues */
  turningPointPly: number | null;
}

/** seuils de classement, en centipions perdus par rapport au meilleur coup */
function verdictOf(loss: number, joueLeMeilleur: boolean): MoveVerdict {
  if (loss >= 300) return 'blunder';
  if (loss >= 150) return 'mistake';
  if (loss >= 75) return 'inaccuracy';
  return joueLeMeilleur ? 'best' : 'good';
}

/**
 * Analyse un coup : on cherche le meilleur coup de la position, puis on compare
 * ce qu'il rapportait à ce que le coup réellement joué a rapporté. L'écart est
 * la perte. Les scores sont ramenés du point de vue du joueur qui vient de
 * jouer, sinon un bon coup des noirs passerait pour une catastrophe.
 */
function analyseOne(chess: Chess, uci: string): Omit<AnalysedMove, 'ply'> | null {
  const trait = chess.turn();
  const legaux = chess.moves({ verbose: true }) as Move[];
  const joue = legaux.find(
    (m) => m.from + m.to + (m.promotion ?? '') === uci || m.from + m.to === uci,
  );
  if (!joue) return null;

  // 1) Le meilleur coup, en PARTAGEANT la fenêtre alpha-beta entre les coups
  //    candidats. Les explorer chacun en fenêtre pleine (première version)
  //    empêchait toute coupure et coûtait une recherche complète par coup
  //    légal, soit une trentaine par position : quatre fois plus lent pour le
  //    même résultat. Ici les coups inférieurs sont coupés tôt ; leur score
  //    n'est plus exact, mais on ne garde que le meilleur.
  let alpha = -Infinity;
  let meilleurScore = -Infinity;
  let meilleurSan: string | null = null;
  for (const move of orderMoves(legaux)) {
    chess.move(move);
    // `search` rend le score du camp AU TRAIT après le coup, donc celui de
    // l'adversaire : on le renverse pour raisonner du point de vue du joueur
    const score = -search(chess, ANALYSE_DEPTH - 1, -Infinity, -alpha, NO_DEADLINE, ANALYSE_QUIESCENCE);
    chess.undo();
    if (score > meilleurScore) {
      meilleurScore = score;
      meilleurSan = move.san;
    }
    if (score > alpha) alpha = score;
  }

  // 2) Le coup réellement joué, lui, mérite une valeur EXACTE : c'est de son
  //    écart au meilleur que dépend le verdict. Fenêtre pleine, une seule fois.
  chess.move(joue);
  const scoreJoue = -search(chess, ANALYSE_DEPTH - 1, -Infinity, Infinity, NO_DEADLINE, ANALYSE_QUIESCENCE);
  const brut = evaluate(chess);

  const loss = Math.max(0, meilleurScore - scoreJoue);
  const joueLeMeilleur = meilleurSan === joue.san;
  return {
    san: joue.san,
    uci,
    color: trait,
    scoreAfter: brut,
    loss,
    verdict: verdictOf(loss, joueLeMeilleur),
    bestSan: joueLeMeilleur ? null : meilleurSan,
  };
}

/**
 * Analyse la partie entière, PAR TRANCHES : on rend la main au navigateur
 * régulièrement pour que la barre de progression s'anime et que l'écran reste
 * réactif. Sans ça, la dalle se figerait le temps du calcul.
 */
export async function analyseGame(
  uciMoves: string[],
  onProgress?: (done: number, total: number) => void,
): Promise<GameAnalysis> {
  const chess = new Chess();
  const moves: AnalysedMove[] = [];

  for (let ply = 0; ply < uciMoves.length; ply++) {
    const analysed = analyseOne(chess, uciMoves[ply]);
    if (!analysed) break; // historique incohérent : on rend ce qu'on a
    moves.push({ ply, ...analysed });
    if (ply % 4 === 3) {
      onProgress?.(ply + 1, uciMoves.length);
      await new Promise((r) => setTimeout(r, 0));
    }
  }
  onProgress?.(uciMoves.length, uciMoves.length);

  // le tournant : la plus grosse perte de la partie, si elle est significative
  let turningPointPly: number | null = null;
  let pire = 150;
  for (const m of moves) {
    if (m.loss > pire) {
      pire = m.loss;
      turningPointPly = m.ply;
    }
  }
  return { moves, turningPointPly };
}
