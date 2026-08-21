/**
 * Identité joueur blackjack, persistée en localStorage PAR SESSION :
 * une dalle qui recharge (F5, reboot) reprend son siège via son playerToken
 * (le backend accepte join avec token seul). On garde les 10 dernières.
 */

const KEY = 'invaderBjIdentity';
const LAST_PSEUDO_KEY = 'invaderChessPseudo'; // partagé volontairement avec les échecs
const MAX_ENTRIES = 10;

export interface BjIdentity {
  playerToken: string;
  pseudo: string;
  savedAt: number;
}

type IdentityMap = Record<string, BjIdentity>;

function readAll(): IdentityMap {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as IdentityMap;
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

function writeAll(map: IdentityMap): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    /* quota / private mode : la reprise de siège sera juste impossible */
  }
}

export function getBjIdentity(sessionId: string): BjIdentity | null {
  return readAll()[sessionId] ?? null;
}

export function saveBjIdentity(sessionId: string, identity: Omit<BjIdentity, 'savedAt'>): void {
  const map = readAll();
  map[sessionId] = { ...identity, savedAt: Date.now() };
  const ids = Object.keys(map).sort((a, b) => map[b].savedAt - map[a].savedAt);
  for (const id of ids.slice(MAX_ENTRIES)) delete map[id];
  writeAll(map);
}

export function clearBjIdentity(sessionId: string): void {
  const map = readAll();
  if (sessionId in map) {
    delete map[sessionId];
    writeAll(map);
  }
}

export function getLastPseudo(): string {
  try {
    return localStorage.getItem(LAST_PSEUDO_KEY) ?? '';
  } catch {
    return '';
  }
}

export function saveLastPseudo(pseudo: string): void {
  try {
    localStorage.setItem(LAST_PSEUDO_KEY, pseudo);
  } catch {
    /* ignore */
  }
}

export function isValidPseudo(pseudo: string): boolean {
  const trimmed = pseudo.trim();
  return trimmed.length >= 2 && trimmed.length <= 16;
}
