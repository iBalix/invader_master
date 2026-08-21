/**
 * Fond choisi a la main sur CETTE borne, et sa date de peremption.
 *
 * Le serveur attribue un design par table au demarrage. Ensuite le client est
 * libre : la pastille de l'accueil fait tourner le fond, et le choix est
 * memorise ici. Il ne concerne QUE l'ecran ou l'on a touche : la dalle d'en
 * face garde le sien.
 *
 * RETOUR AUTOMATIQUE APRES 10 MINUTES. Le choix d'un client ne doit pas devenir
 * la decoration definitive de la table : dix minutes apres le DERNIER appui sur
 * la pastille, la borne reprend le fond que le serveur lui attribue, celui
 * qu'elle etait seule a avoir. Chaque nouvel appui remet le compte a zero,
 * c'est bien le dernier switch qui declenche le delai.
 *
 * L'echeance est armee par un timer, pas seulement testee au rendu : sans ca,
 * une borne qu'on laisse en place garderait le fond force jusqu'au prochain
 * rendu fortuit. Le timer vit dans TableLayout, monte en permanence sous
 * /table/*, donc le retour se produit aussi pendant l'ecran de veille.
 *
 * POURQUOI UNE TABLE INDEXEE PAR HOSTNAME, et pas une cle de stockage
 * suffixee comme le panier : le middleware persist rehydrate le store a
 * l'import du module, AVANT que le hostname de l'URL (?hostname=...) ait ete
 * ecrit en localStorage. Une cle dynamique lisait donc l'entree du hostname
 * PRECEDENT. Constate en test : la dalle 04-2 heritait du fond force sur la
 * 04-1. Avec une cle stable et une recherche par hostname a la lecture, le
 * probleme ne peut pas se produire.
 */

import { useEffect } from 'react';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { getHostname } from '../lib/hostname';

/** duree de vie d'un fond choisi a la main, depuis le dernier appui */
export const OVERRIDE_TTL_MS = 10 * 60 * 1000;

interface DesignChoice {
  /** id du design force */
  id: string;
  /**
   * Instant du dernier appui, en horloge murale (Date.now).
   * Volontairement pas performance.now() : la valeur est persistee et doit
   * rester interpretable apres un rechargement de la borne.
   */
  at: number;
}

interface DesignState {
  /** choix force par hostname. Absent = celui attribue par le serveur */
  byHost: Record<string, DesignChoice>;
  setOverride: (hostname: string, designId: string | null) => void;
}

export const useDesignStore = create<DesignState>()(
  persist(
    (set) => ({
      byHost: {},
      setOverride: (hostname, designId) =>
        set((s) => {
          const next = { ...s.byHost };
          if (designId) next[hostname] = { id: designId, at: Date.now() };
          else delete next[hostname];
          return { byHost: next };
        }),
    }),
    {
      name: 'invaderTableDesign',
      storage: createJSONStorage(() => localStorage),
      // v0 stockait un simple id, sans date. On ne peut pas deviner l'instant du
      // choix : on le declare peri, la borne repart donc sur le fond du serveur
      // au premier chargement suivant la mise a jour. C'est de toute facon l'etat
      // vers lequel un vieux choix devait converger.
      version: 1,
      migrate: (persisted, version) => {
        if (version >= 1) return persisted as DesignState;
        const ancien = (persisted as { byHost?: Record<string, unknown> } | null)?.byHost ?? {};
        const byHost: Record<string, DesignChoice> = {};
        for (const [hostname, valeur] of Object.entries(ancien)) {
          if (typeof valeur === 'string') byHost[hostname] = { id: valeur, at: 0 };
        }
        return { byHost } as DesignState;
      },
    },
  ),
);

/** id du design force sur la borne courante, ou null s'il n'y en a pas ou plus */
export function useDesignOverride(): {
  overrideId: string | null;
  setOverride: (designId: string | null) => void;
} {
  const host = getHostname() ?? '';
  const choix = useDesignStore((s) => (host ? s.byHost[host] ?? null : null));
  const set = useDesignStore((s) => s.setOverride);

  const perime = choix !== null && Date.now() - choix.at >= OVERRIDE_TTL_MS;

  // Effacement a l'echeance. On efface l'entree plutot que de se contenter de
  // l'ignorer : le store redevient le reflet exact de ce qui est affiche, et la
  // suppression declenche d'elle-meme le re-rendu vers le fond du serveur.
  useEffect(() => {
    if (!host || !choix) return;
    const reste = choix.at + OVERRIDE_TTL_MS - Date.now();
    if (reste <= 0) {
      set(host, null);
      return;
    }
    const timer = window.setTimeout(() => set(host, null), reste);
    return () => window.clearTimeout(timer);
  }, [host, choix, set]);

  return {
    overrideId: choix && !perime ? choix.id : null,
    setOverride: (id) => {
      if (host) set(host, id);
    },
  };
}
