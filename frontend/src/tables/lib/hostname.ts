/**
 * Gestion du hostname de la table tactile.
 *
 * Strategie :
 * 1. ?hostname=TABLE01-1 dans l'URL (premiere visite ou override)
 * 2. localStorage.invaderTableHostname
 * 3. Sinon : null -> ecran de setup affiche
 *
 * Convention :
 *   - TABLExx-1 = ecran MASTER (peut lancer des jeux)
 *   - TABLExx-2 = ecran SLAVE  (recoit le state du master pendant un jeu)
 */

const STORAGE_KEY = 'invaderTableHostname';

export type TableRole = 'master' | 'slave';

export interface TableIdentity {
  hostname: string;
  tableNumber: string; // ex: "01"
  role: TableRole;
}

export function getHostname(): string | null {
  // ?hostname=... a la priorite et ecrase le storage
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get('hostname');
    if (fromUrl) {
      const cleaned = fromUrl.trim().toUpperCase();
      try {
        localStorage.setItem(STORAGE_KEY, cleaned);
      } catch {
        /* ignore quota / private mode */
      }
      return cleaned;
    }

    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  }
  return null;
}

export function setHostname(hostname: string): void {
  const cleaned = hostname.trim().toUpperCase();
  try {
    localStorage.setItem(STORAGE_KEY, cleaned);
  } catch {
    /* ignore */
  }
}

export function clearHostname(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Parse un hostname "TABLE01-1" -> { tableNumber: "01", role: "master" }.
 * Renvoie null si la regex n'est pas respectee (ex: TABLE-DEV).
 */
export function parseHostname(hostname: string | null): TableIdentity | null {
  if (!hostname) return null;
  const match = hostname.match(/^TABLE(\d{1,3})-(\d)$/i);
  if (!match) {
    return { hostname, tableNumber: '??', role: 'master' };
  }
  const tableNumber = match[1].padStart(2, '0');
  const role: TableRole = match[2] === '1' ? 'master' : 'slave';
  return { hostname, tableNumber, role };
}
