#!/usr/bin/env node
/**
 * Test de fumée de l'IA d'échecs : crée N parties solo contre la machine,
 * joue une suite de coups blancs, mesure le délai de réponse de la machine et
 * la latence de /health pendant qu'elle calcule.
 *
 * Sert à recalibrer les niveaux (CHESS_AI_ELO_2 / CHESS_AI_ELO_3) et à
 * vérifier qu'un coup Stockfish ne bloque jamais la boucle d'événements du
 * backend. Les parties sont abandonnées à la fin (action `resign`) pour ne
 * pas laisser de session ouverte ; le pseudo `SFTEST` et le device `smoke`
 * permettent de les retrouver en base.
 *
 * ATTENTION : le backend local tape la base de PRODUCTION. Ne lancer que
 * hors soirée, et jamais sur autre chose que des parties d'échecs.
 *
 *   node scripts/chess-ai-smoke.mjs --level 3 --games 1 --moves 6
 *   BASE=http://localhost:3001 node scripts/chess-ai-smoke.mjs --level 2 --games 4
 *
 * Repères (Mac M-series, backend local) : niveau 3 seul ≈ 1,2 s par coup vu
 * du client, 4 parties simultanées ≈ 2,6 s, /health toujours sous 30 ms.
 * Une réponse `engine=local` dans les logs backend signale un secours (moteur
 * absent, mort ou trop lent).
 */
const BASE = process.env.BASE ?? 'http://localhost:3001';
const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i >= 0 ? process.argv[i + 1] : d;
};
const LEVEL = Number(arg('level', 3));
const GAMES = Number(arg('games', 1));
const MOVES = Number(arg('moves', 6));
const MINUTES = Number(arg('minutes', 5));
// coups blancs joués mécaniquement : on mesure un délai, pas une partie
const WHITE = [
  ['e2', 'e4'], ['g1', 'f3'], ['f1', 'c4'], ['d2', 'd3'], ['b1', 'c3'], ['c1', 'e3'],
  ['e1', 'g1'], ['a2', 'a3'], ['h2', 'h3'], ['d1', 'e2'], ['a1', 'd1'], ['b2', 'b3'],
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function api(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${json.message ?? ''}`);
  return json.data;
}

// sonde /health toutes les 100 ms : la boucle d'événements doit rester libre
let healthMax = 0;
let healthCount = 0;
let healthOver50 = 0;
let probing = true;
(async () => {
  while (probing) {
    const t = performance.now();
    await fetch(BASE + '/health').catch(() => {});
    const d = performance.now() - t;
    healthMax = Math.max(healthMax, d);
    healthCount += 1;
    if (d > 50) healthOver50 += 1;
    await sleep(100);
  }
})();

async function game(n) {
  const tag = `G${n}`;
  const created = await api('POST', '/public/chess/sessions', {
    pseudo: `SFTEST${n}`,
    device: 'smoke',
    clock: { initialMinutes: MINUTES, incrementSeconds: 0 },
    color: 'w',
    theme: 'classic',
    ai: { level: LEVEL },
  });
  const id = created.sessionId;
  const token = created.playerToken;
  await api('POST', `/public/chess/${id}/action`, { playerToken: token, action: 'ready' });
  // décompte serveur : on attend que l'attente de confirmation disparaisse
  for (let i = 0; i < 80; i++) {
    const { state } = await api('GET', `/public/chess/${id}/state?playerToken=${token}`);
    if (state.ready == null && state.status === 'playing') break;
    await sleep(100);
  }
  const lat = [];
  const replies = [];
  let ended = null;
  for (let m = 0; m < MOVES && m < WHITE.length; m++) {
    const [from, to] = WHITE[m];
    let st;
    try {
      st = (await api('POST', `/public/chess/${id}/move`, { playerToken: token, ply: 2 * m, from, to })).state;
    } catch (e) {
      console.log(`${tag} coup ${from}${to} refusé : ${e.message}`);
      break;
    }
    const t0 = performance.now();
    // la machine répond : moves.length passe à 2m+2
    for (;;) {
      await sleep(80);
      st = (await api('GET', `/public/chess/${id}/state?playerToken=${token}`)).state;
      if (st.moves.length >= 2 * m + 2 || st.result) break;
      if (performance.now() - t0 > 15_000) break;
    }
    lat.push(Math.round(performance.now() - t0));
    replies.push(st.moves[2 * m + 1] ?? '??');
    if (st.result) {
      ended = st.result;
      break;
    }
    if (st.moves.length < 2 * m + 2) {
      console.log(`${tag} PAS de réponse de la machine en 15 s au coup ${m}`);
      break;
    }
  }
  if (!ended) {
    await api('POST', `/public/chess/${id}/action`, { playerToken: token, action: 'resign' }).catch((e) =>
      console.log(`${tag} resign : ${e.message}`),
    );
  }
  console.log(
    `${tag} session=${id.slice(0, 8)} niveau=${LEVEL} réponses(ms)=[${lat.join(', ')}] coups machine=[${replies.join(' ')}]${
      ended ? ` fin=${JSON.stringify(ended)}` : ''
    }`,
  );
  return lat;
}

const all = await Promise.all(Array.from({ length: GAMES }, (_, i) => game(i + 1)));
probing = false;
const flat = all.flat();
if (flat.length > 0) {
  const avg = Math.round(flat.reduce((a, b) => a + b, 0) / flat.length);
  console.log(`machine : ${flat.length} coups, min ${Math.min(...flat)} ms, max ${Math.max(...flat)} ms, moyenne ${avg} ms`);
}
console.log(`/health : ${healthCount} sondes, max ${healthMax.toFixed(1)} ms, ${healthOver50} au-dessus de 50 ms`);
