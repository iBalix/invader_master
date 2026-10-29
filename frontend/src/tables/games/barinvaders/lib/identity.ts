/**
 * Identité joueur Bar Invaders, persistée en localStorage PAR SESSION :
 * une dalle qui recharge (F5, reboot) reprend son siège via son playerToken
 * (le backend accepte join avec token seul). On garde les 10 dernières.
 */

const KEY = 'invaderInvIdentity';
const LAST_PSEUDO_KEY = 'invaderChessPseudo'; // partagé volontairement avec les autres jeux du bar
const MAX_ENTRIES = 10;

export interface InvIdentity {
  playerToken: string;
  pseudo: string;
  savedAt: number;
}

type IdentityMap = Record<string, InvIdentity>;

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
    /* quota / navigation privée : la reprise de siège sera juste impossible */
  }
}

export function getInvIdentity(sessionId: string): InvIdentity | null {
  return readAll()[sessionId] ?? null;
}

export function saveInvIdentity(sessionId: string, identity: Omit<InvIdentity, 'savedAt'>): void {
  const map = readAll();
  map[sessionId] = { ...identity, savedAt: Date.now() };
  const ids = Object.keys(map).sort((a, b) => map[b].savedAt - map[a].savedAt);
  for (const id of ids.slice(MAX_ENTRIES)) delete map[id];
  writeAll(map);
}

export function clearInvIdentity(sessionId: string): void {
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
