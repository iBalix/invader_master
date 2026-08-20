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
  /** identifiant de la table, prefixe compris : "TABLE01" (= channel Pusher) */
  tableId: string;
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
 * Regex STRICTEMENT alignee sur celle du backend (backend/src/routes/tables.ts
 * et services/tableLaunch.ts). Avant, le front acceptait "TABLE1-1" et
 * "TABLE01-3" que le serveur rejetait ensuite : la table semblait configuree
 * mais aucun appel n'aboutissait.
 */
const HOSTNAME_RE = /^TABLE(\d{2})-([12])$/;

/**
 * Parse un hostname "TABLE01-1" -> identite de la table.
 * Renvoie null si le format n'est pas respecte.
 *
 * Ce null est important : l'ancien code repliait tout hostname invalide sur
 * un role "master", donc une borne mal configuree se croyait capable de
 * lancer des jeux et polluait table_devices. Desormais elle part sur l'ecran
 * de setup, ou l'erreur est visible tout de suite.
 */
export function parseHostname(hostname: string | null): TableIdentity | null {
  if (!hostname) return null;
  const match = hostname.trim().toUpperCase().match(HOSTNAME_RE);
  if (!match) return null;
  const tableNumber = match[1];
  const role: TableRole = match[2] === '1' ? 'master' : 'slave';
  return {
    hostname: hostname.trim().toUpperCase(),
    tableNumber,
    tableId: `TABLE${tableNumber}`,
    role,
  };
}

/** Le hostname saisi est-il exploitable ? (utilise par l'ecran de setup) */
export function isValidHostname(hostname: string): boolean {
  return HOSTNAME_RE.test(hostname.trim().toUpperCase());
}
