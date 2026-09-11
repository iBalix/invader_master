#!/usr/bin/env node
/**
 * Vérifie que les deux copies de la simulation Flappy Bar sont identiques.
 *
 * Railway construit backend/ et frontend/ depuis deux racines séparées : le
 * fichier ne peut pas être partagé par import, il est donc dupliqué. Le serveur
 * rejoue les flaps des joueurs pour valider leurs morts ; la moindre divergence
 * entre les deux copies fausserait les distances officielles. Ce script est
 * branché dans `npm run lint` à la racine.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const COPIES = [
  path.join(ROOT, 'backend', 'src', 'games', 'flappybar', 'flapSim.ts'),
  path.join(ROOT, 'frontend', 'src', 'tables', 'games', 'flappybar', 'sim', 'flapSim.ts'),
];

function read(file) {
  try {
    // CRLF normalisé : le poste de dev est sous Windows
    return fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  } catch (err) {
    console.error(`[check-flap-sim] fichier introuvable : ${path.relative(ROOT, file)}`);
    process.exit(1);
  }
}

const [a, b] = COPIES.map(read);
if (a === b) {
  console.log('[check-flap-sim] OK : les deux copies de flapSim.ts sont identiques');
  process.exit(0);
}

const linesA = a.split('\n');
const linesB = b.split('\n');
let firstDiff = 0;
while (firstDiff < linesA.length && firstDiff < linesB.length && linesA[firstDiff] === linesB[firstDiff]) {
  firstDiff += 1;
}
console.error('[check-flap-sim] ECHEC : les deux copies de flapSim.ts divergent.');
console.error(`  première différence ligne ${firstDiff + 1}`);
console.error(`  backend  : ${JSON.stringify(linesA[firstDiff] ?? '<fin de fichier>')}`);
console.error(`  frontend : ${JSON.stringify(linesB[firstDiff] ?? '<fin de fichier>')}`);
console.error('  => recopier la version de référence (backend) vers frontend/src/tables/games/flappybar/sim/flapSim.ts');
process.exit(1);
