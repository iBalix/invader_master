/**
 * Interdit toute forme de zoom utilisateur sur une surface kiosque.
 *
 * POURQUOI : tout le parc est tactile et sans clavier ni souris a portee. Un
 * zoom declenche par accident laisse la dalle agrandie sans que personne sache
 * revenir en arriere, jusqu'au prochain redemarrage du navigateur.
 *
 * Le pincement et le double-tap sont deja bloques en CSS (`touch-action` sur
 * html/body dans index.css) et par le viewport verrouille dans index.html. Ce
 * hook couvre ce que le CSS ne peut pas atteindre :
 *   - Ctrl / Cmd + molette, le zoom navigateur ;
 *   - Ctrl / Cmd + plus, moins, zero ;
 *   - les evenements `gesture*` de WebKit, qui echappent a `touch-action`.
 *
 * A APPELER UNIQUEMENT DEPUIS LES SURFACES KIOSQUE (bornes, projecteur, ecrans
 * de bar). Pas depuis le back-office : un salarie sur son portable doit garder
 * le droit de zoomer sa page.
 *
 * A ne pas confondre avec le `zoom` CSS applique a la surface joueur sur borne
 * (cf. TablePlayPage) : celui-la est une mise a l'echelle de mise en page,
 * decidee par nous, et rien ici ne l'affecte.
 */

import { useEffect } from 'react';

export function useSansZoom(): void {
  useEffect(() => {
    const surMolette = (e: WheelEvent) => {
      // seul le zoom est vise : une molette simple doit continuer a defiler
      if (e.ctrlKey || e.metaKey) e.preventDefault();
    };

    const surTouche = (e: KeyboardEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      // '=' et '_' : sur beaucoup de dispositions, plus et moins arrivent sous
      // ces touches sans Maj
      if (['+', '-', '=', '_', '0'].includes(e.key)) e.preventDefault();
    };

    const surGeste = (e: Event) => e.preventDefault();

    // passive: false, sinon preventDefault est ignore et le navigateur zoome
    // quand meme, silencieusement.
    window.addEventListener('wheel', surMolette, { passive: false });
    window.addEventListener('keydown', surTouche);
    for (const nom of ['gesturestart', 'gesturechange', 'gestureend']) {
      document.addEventListener(nom, surGeste, { passive: false });
    }

    return () => {
      window.removeEventListener('wheel', surMolette);
      window.removeEventListener('keydown', surTouche);
      for (const nom of ['gesturestart', 'gesturechange', 'gestureend']) {
        document.removeEventListener(nom, surGeste);
      }
    };
  }, []);
}
