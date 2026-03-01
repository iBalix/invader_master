/**
 * Lance en parallèle le backend et le frontend (dev).
 * Cross-platform (Windows / macOS / Linux).
 * Usage : node scripts/invader-start.js (ou npm run dev depuis la racine)
 */

const { spawn } = require('child_process');
const path = require('path');

const root = path.join(__dirname, '..');
const backendCwd = path.join(root, 'backend');
const frontendCwd = path.join(root, 'frontend');

console.log('[invader-start] Démarrage backend (port 3001) et frontend (port 5173)...\n');

const backend = spawn('npm', ['run', 'dev'], {
  cwd: backendCwd,
  stdio: 'inherit',
  shell: true,
  env: { ...process.env },
});

const frontend = spawn('npm', ['run', 'dev'], {
  cwd: frontendCwd,
  stdio: 'inherit',
  shell: true,
  env: { ...process.env },
});

backend.on('error', (err) => {
  console.error('[invader-start] Backend error:', err);
});
frontend.on('error', (err) => {
  console.error('[invader-start] Frontend error:', err);
});

backend.on('close', (code) => {
  if (code !== 0 && code !== null) process.exit(code);
});
frontend.on('close', (code) => {
  if (code !== 0 && code !== null) process.exit(code);
});

process.on('SIGINT', () => {
  backend.kill('SIGINT');
  frontend.kill('SIGINT');
  process.exit(0);
});
