/**
 * Faux bridge Philips Hue — outil de test local (Node, zero dependance).
 *
 * Sert a valider MECANIQUEMENT le debit et la coalescence du worker sans
 * materiel : il journalise chaque appel horodate et verifie les invariants.
 *
 *   node agent/hue/tools/fake-bridge.mjs [--port 8080] [--latency 15] [--fail 0]
 *
 * Ctrl+C affiche le rapport : nb de requetes, debit max sur 1 s, intervalle
 * minimum observe par cible, et le verdict des assertions.
 */

import { createServer } from 'http';

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] !== undefined ? Number(args[i + 1]) : def;
};

const PORT = opt('port', 8080);
const LATENCY_MS = opt('latency', 15);
const FAIL_RATE = opt('fail', 0); // 0..1 : proportion de reponses en erreur

// Seuils attendus (doivent rester alignes avec hue-worker.ps1)
const MAX_PER_SECOND = 8;
const MIN_INTERVAL_PER_TARGET_MS = 250;
const GROUP_BURST_WINDOW_MS = 600;   // rafale courte toleree (flash + retour)
const MAX_GROUP_BURST = 3;
const MAX_GROUP_SUSTAINED_PER_S = 1.2;  // moyenne soutenue (recommandation Philips ~1/s)

const calls = []; // { t, target, kind, body }
const t0 = Date.now();

const server = createServer((req, res) => {
  let raw = '';
  req.on('data', (c) => (raw += c));
  req.on('end', () => {
    // sonde de vie utilisee par le worker pour detecter le retablissement
    if (req.method === 'GET' && /^\/api\/[^/]+\/config$/.test(req.url)) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ name: 'Fake Hue Bridge', apiversion: '1.60.0', swversion: '1960000000' }));
      return;
    }

    const m = req.url.match(/^\/api\/([^/]+)\/(groups|lights)\/(\d+)\/(action|state)$/);
    if (req.method !== 'PUT' || !m) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify([{ error: { type: 3, description: 'resource not available' } }]));
      return;
    }
    const [, , kind, id] = m;
    const target = `${kind}:${id}`;
    let body = {};
    try { body = JSON.parse(raw || '{}'); } catch { /* corps invalide */ }

    calls.push({ t: Date.now() - t0, target, kind, body });
    const stamp = String(Date.now() - t0).padStart(6, ' ');
    console.log(`${stamp}ms  ${target.padEnd(12)} ${JSON.stringify(body)}`);

    const fail = FAIL_RATE > 0 && Math.random() < FAIL_RATE;
    setTimeout(() => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(
        fail
          ? [{ error: { type: 901, address: `/${kind}/${id}`, description: 'Internal error, 950' } }]
          : Object.keys(body).map((k) => ({ success: { [`/${kind}/${id}/state/${k}`]: body[k] } })),
      ));
    }, LATENCY_MS);
  });
});

server.listen(PORT, () => {
  console.log(`[fake-hue] en ecoute sur http://127.0.0.1:${PORT}`);
  console.log(`[fake-hue] latence ${LATENCY_MS}ms, taux d'erreur ${FAIL_RATE}`);
  console.log(`[fake-hue] Ctrl+C pour le rapport\n`);
});

process.on('SIGINT', () => {
  console.log('\n' + '='.repeat(64));
  console.log(`RAPPORT — ${calls.length} requetes en ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log('='.repeat(64));

  if (calls.length === 0) { console.log('aucune requete'); process.exit(0); }

  // debit max sur une fenetre glissante de 1 s
  let maxPerSec = 0;
  for (let i = 0; i < calls.length; i++) {
    const n = calls.filter((c) => c.t > calls[i].t - 1000 && c.t <= calls[i].t).length;
    maxPerSec = Math.max(maxPerSec, n);
  }

  // intervalle minimum par cible
  const byTarget = {};
  for (const c of calls) (byTarget[c.target] ??= []).push(c.t);
  let minInterval = Infinity, minTarget = null;
  for (const [target, times] of Object.entries(byTarget)) {
    for (let i = 1; i < times.length; i++) {
      const d = times[i] - times[i - 1];
      if (d < minInterval) { minInterval = d; minTarget = target; }
    }
  }

  // Un reservoir de jetons se juge sur DEUX criteres : la rafale courte
  // (bornee par la capacite) et le debit soutenu (borne par la recharge).
  const groupCalls = calls.filter((c) => c.kind === 'groups');
  let maxGroupBurst = 0;
  for (let i = 0; i < groupCalls.length; i++) {
    const same = groupCalls.filter(
      (c) => c.target === groupCalls[i].target &&
             c.t > groupCalls[i].t - GROUP_BURST_WINDOW_MS && c.t <= groupCalls[i].t,
    ).length;
    maxGroupBurst = Math.max(maxGroupBurst, same);
  }
  let maxGroupSustained = 0, worstGroup = null;
  const groupNames = [...new Set(groupCalls.map((c) => c.target))];
  for (const g of groupNames) {
    const times = groupCalls.filter((c) => c.target === g).map((c) => c.t);
    for (let i = 0; i < times.length; i++) {
      const n = times.filter((t) => t > times[i] - 10000 && t <= times[i]).length;
      const rate = n / Math.min(10, (times[i] + 1) / 1000);
      if (rate > maxGroupSustained) { maxGroupSustained = rate; worstGroup = g; }
    }
  }

  console.log(`\nRepartition par cible :`);
  for (const [target, times] of Object.entries(byTarget)) {
    console.log(`  ${target.padEnd(12)} ${String(times.length).padStart(4)} requetes`);
  }

  const check = (ok, label) => `${ok ? '  OK  ' : ' ECHEC'}  ${label}`;
  console.log(`\nAssertions :`);
  console.log(check(maxPerSec <= MAX_PER_SECOND, `debit max ${maxPerSec}/s (plafond ${MAX_PER_SECOND})`));
  console.log(check(
    minInterval === Infinity || minInterval >= MIN_INTERVAL_PER_TARGET_MS,
    `intervalle min par cible ${minInterval === Infinity ? 'n/a' : minInterval + 'ms'}` +
    `${minTarget ? ` (${minTarget})` : ''} (plancher ${MIN_INTERVAL_PER_TARGET_MS}ms)`,
  ));
  console.log(check(maxGroupBurst <= MAX_GROUP_BURST,
    `rafale courte par groupe ${maxGroupBurst}/${GROUP_BURST_WINDOW_MS}ms (plafond ${MAX_GROUP_BURST})`));
  console.log(check(maxGroupSustained <= MAX_GROUP_SUSTAINED_PER_S,
    `debit soutenu par groupe ${maxGroupSustained.toFixed(2)}/s` +
    `${worstGroup ? ` (${worstGroup})` : ''} (plafond ${MAX_GROUP_SUSTAINED_PER_S}/s)`));
  console.log('');
  process.exit(0);
});
