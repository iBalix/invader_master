/**
 * Fond choisi a la main sur CETTE borne.
 *
 * Le serveur attribue un design par table au demarrage. Ensuite le client est
 * libre : la pastille de l'accueil fait tourner le fond, et le choix est
 * memorise ici. Il ne concerne QUE l'ecran ou l'on a touche : la dalle d'en
 * face garde le sien.
 *
 * POURQUOI UNE TABLE INDEXEE PAR HOSTNAME, et pas une cle de stockage
 * suffixee comme le panier : le middleware persist rehydrate le store a
 * l'import du module, AVANT que le hostname de l'URL (?hostname=...) ait ete
 * ecrit en localStorage. Une cle dynamique lisait donc l'entree du hostname
 * PRECEDENT. Constate en test : la dalle 04-2 heritait du fond force sur la
 * 04-1. Avec une cle stable et une recherche par hostname a la lecture, le
 * probleme ne peut pas se produire.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { getHostname } from '../lib/hostname';

interface DesignState {
  /** id du design force, par hostname. Absent = celui attribue par le serveur */
  byHost: Record<string, string>;
  setOverride: (hostname: string, designId: string | null) => void;
}

export const useDesignStore = create<DesignState>()(
  persist(
    (set) => ({
      byHost: {},
      setOverride: (hostname, designId) =>
        set((s) => {
          const next = { ...s.byHost };
          if (designId) next[hostname] = designId;
          else delete next[hostname];
          return { byHost: next };
        }),
    }),
    {
      name: 'invaderTableDesign',
      storage: createJSONStorage(() => localStorage),
    },
  ),
);

/** id du design force sur la borne courante, ou null */
export function useDesignOverride(): {
  overrideId: string | null;
  setOverride: (designId: string | null) => void;
} {
  const host = getHostname() ?? '';
  const overrideId = useDesignStore((s) => (host ? s.byHost[host] ?? null : null));
  const set = useDesignStore((s) => s.setOverride);
  return { overrideId, setOverride: (id) => host && set(host, id) };
}
