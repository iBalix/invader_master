/**
 * Confirmation DANS la page, en remplacement de `confirm()`.
 *
 * Pourquoi : le bouton « Lancer la finale » ne faisait plus rien en soirée.
 * `confirm()` est une boîte de dialogue native, et le navigateur a le droit de
 * la supprimer : Chrome propose « empêcher cette page de créer des boîtes de
 * dialogue supplémentaires » dès qu'une page en ouvre plusieurs, et une fois
 * cochée (ou décidée par le navigateur) l'appel retourne `false`
 * immédiatement, sans rien afficher. Une console d'animateur en ouvre une
 * dizaine par soirée (fin de manche, rejouer, annuler, arrêter) : les actions
 * confirmées finissaient donc par devenir inertes, silencieusement, alors que
 * les boutons sans confirmation continuaient de marcher.
 *
 * Au passage c'est mieux à l'usage : une cible de 52 px dans le noir, à une
 * main, plutôt qu'un dialogue système minuscule en haut de l'écran.
 */

import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

interface Demande {
  message: string;
  resoudre: (ok: boolean) => void;
}

export function useConfirmation(): {
  demander: (message: string) => Promise<boolean>;
  dialogue: React.ReactNode;
} {
  const [demande, setDemande] = useState<Demande | null>(null);

  const demander = useCallback(
    (message: string) =>
      new Promise<boolean>((resoudre) => {
        // une demande en remplace une autre : deux dialogues empilés ne
        // pourraient de toute façon pas être répondus dans l'ordre
        setDemande((precedente) => {
          precedente?.resoudre(false);
          return { message, resoudre };
        });
      }),
    [],
  );

  const repondre = useCallback(
    (ok: boolean) => {
      setDemande((d) => {
        d?.resoudre(ok);
        return null;
      });
    },
    [],
  );

  // clavier : la console se pilote aussi au trackpad depuis le bar
  useEffect(() => {
    if (!demande) return;
    const touche = (e: KeyboardEvent) => {
      if (e.key === 'Escape') repondre(false);
      if (e.key === 'Enter') repondre(true);
    };
    document.addEventListener('keydown', touche);
    return () => document.removeEventListener('keydown', touche);
  }, [demande, repondre]);

  // PORTAIL vers <body>, et pas un simple `fixed` la ou il est monte : un
  // ancetre en `backdrop-blur` (l'en-tete collant de la console) ou en
  // `transform` (le gabarit du laboratoire) devient le referentiel des
  // positions fixes, et le dialogue partait hors ecran.
  const dialogue = demande
    ? createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-end justify-center bg-slate-950/80 p-4 backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-modal="true"
      onClick={() => repondre(false)}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-900 p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-base font-semibold leading-snug text-slate-100">{demande.message}</p>
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={() => repondre(false)}
            className="min-h-[52px] flex-1 rounded-xl border border-white/15 text-sm font-bold text-slate-300 hover:bg-white/10"
          >
            Annuler
          </button>
          <button
            type="button"
            autoFocus
            onClick={() => repondre(true)}
            className="min-h-[52px] flex-1 rounded-xl bg-indigo-500 text-sm font-black text-white hover:bg-indigo-400"
          >
            Confirmer
          </button>
        </div>
      </div>
    </div>,
        document.body,
      )
    : null;

  return { demander, dialogue };
}
