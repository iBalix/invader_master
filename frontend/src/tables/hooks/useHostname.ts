/**
 * Hook React qui expose l'identite de la table (hostname + role master/slave).
 *
 * Reactif : si le hostname est ajoute via ?hostname=... ou par
 * l'ecran de setup, le composant se met a jour.
 */

import { useEffect, useState } from 'react';
import { getHostname, parseHostname, type TableIdentity } from '../lib/hostname';

const STORAGE_KEY = 'invaderTableHostname';

export function useHostname(): TableIdentity | null {
  const [identity, setIdentity] = useState<TableIdentity | null>(() =>
    parseHostname(getHostname())
  );

  useEffect(() => {
    function handleStorage(e: StorageEvent) {
      if (e.key === STORAGE_KEY) {
        setIdentity(parseHostname(getHostname()));
      }
    }
    function handleCustom() {
      setIdentity(parseHostname(getHostname()));
    }
    window.addEventListener('storage', handleStorage);
    window.addEventListener('invader:hostname-changed', handleCustom);
    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('invader:hostname-changed', handleCustom);
    };
  }, []);

  return identity;
}
