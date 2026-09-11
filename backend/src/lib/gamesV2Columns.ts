/**
 * Sonde de presence de la colonne games_v2.active (fenetre de migration).
 *
 * Les migrations s'appliquent a la main dans le SQL Editor (convention du
 * projet), donc le code peut etre deploye AVANT la colonne. Or un push sur main
 * part immediatement en prod : filtrer sur une colonne absente ferait 500 sur
 * GET /public/games-v2 et la page des jeux du bar serait vide.
 *
 * Meme principe que colonneTagsPresente() dans routes/gameRoutesV2.ts : on
 * sonde (select limit 1) et seul le SUCCES est memorise, JAMAIS l'absence. La
 * migration s'applique en base sans redemarrer le backend, et un cache negatif
 * obligerait a redeployer pour que le filtre se mette a fonctionner. Le cout
 * est donc un select limit 1 par appel, uniquement pendant la fenetre degradee.
 * A retirer quand la migration sera passee partout.
 */

import { supabaseAdmin } from '../config/supabase.js';

let colonneActiveVue = false;
/** un seul avertissement : les tables interrogent ces routes en boucle */
let absenceSignalee = false;

/**
 * La colonne games_v2.active existe-t-elle deja ?
 * false tant que docs/migration-050-games-v2-active.sql n'est pas appliquee
 * (ou sur erreur passagere : on prefere tout afficher plutot que rien).
 */
export async function colonneActivePresente(): Promise<boolean> {
  if (colonneActiveVue) return true;
  const { error } = await supabaseAdmin.from('games_v2').select('active').limit(1);
  if (error) {
    if (!absenceSignalee) {
      absenceSignalee = true;
      console.warn(
        '[games-v2] colonne active absente, filtre actif/inactif ignore. Appliquer docs/migration-050-games-v2-active.sql.',
      );
    }
    return false;
  }
  colonneActiveVue = true;
  return true;
}
