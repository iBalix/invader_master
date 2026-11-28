/**
 * Sonde de presence de la colonne games.active (fenetre de migration).
 *
 * Les migrations s'appliquent a la main dans le SQL Editor (convention du
 * projet), donc le code peut etre deploye AVANT la colonne. Or un push sur main
 * part immediatement en prod : filtrer sur une colonne absente ferait 500 sur
 * GET /public/games et la page des jeux du bar serait vide.
 *
 * Meme principe que colonneTagsPresente() dans routes/gameRoutes.ts : on
 * sonde (select limit 1) et seul le SUCCES est memorise, JAMAIS l'absence. La
 * migration s'applique en base sans redemarrer le backend, et un cache negatif
 * obligerait a redeployer pour que le filtre se mette a fonctionner. Le cout
 * est donc un select limit 1 par appel, uniquement pendant la fenetre degradee.
 * A retirer quand la migration sera passee partout.
 */

import { IS_STAGING } from '../config/runtime.js';
import { supabaseAdmin } from '../config/supabase.js';

let colonneActiveVue = false;
/** un seul avertissement : les tables interrogent ces routes en boucle */
let absenceSignalee = false;

/**
 * La colonne games.active existe-t-elle deja ?
 * false tant que docs/migration-050-games-v2-active.sql n'est pas appliquee
 * (ou sur erreur passagere : on prefere tout afficher plutot que rien).
 */
export async function colonneActivePresente(): Promise<boolean> {
  if (colonneActiveVue) return true;
  const { error } = await supabaseAdmin.from('games').select('active').limit(1);
  if (error) {
    if (!absenceSignalee) {
      absenceSignalee = true;
      console.warn(
        '[games] colonne active absente, filtre actif/inactif ignore. Appliquer docs/migration-050-games-v2-active.sql.',
      );
    }
    return false;
  }
  colonneActiveVue = true;
  return true;
}

let colonneStagingVue = false;
let absenceStagingSignalee = false;

/**
 * La colonne games.staging_only existe-t-elle deja ?
 * Meme sonde que colonneActivePresente : seul le succes est memorise.
 * false tant que docs/migration-058-games-staging-only.sql n'est pas appliquee.
 */
export async function colonneStagingOnlyPresente(): Promise<boolean> {
  if (colonneStagingVue) return true;
  const { error } = await supabaseAdmin.from('games').select('staging_only').limit(1);
  if (error) {
    if (!absenceStagingSignalee) {
      absenceStagingSignalee = true;
      console.warn(
        '[games] colonne staging_only absente, option "staging uniquement" ignoree. Appliquer docs/migration-058-games-staging-only.sql.',
      );
    }
    return false;
  }
  colonneStagingVue = true;
  return true;
}

/**
 * Visibilite d'un jeu : `active` (visible au bar et en staging) et
 * `staging_only` (visible en staging seulement) ne sont jamais vrais ensemble.
 *
 * "Staging uniquement" force `active = false` : c'est ce qui masque le jeu au
 * bar, par le filtre que la production applique depuis toujours. Activer un
 * jeu retire a l'inverse "staging uniquement". Cf. filtreVisibiliteJeux plus bas.
 *
 * Colonnes absentes (migrations 050 / 058 pas encore appliquees) : le champ
 * est retire de l'ecriture au lieu de faire repondre 500 a PostgREST.
 */
export async function reglerVisibilite(fields: Record<string, unknown>): Promise<void> {
  if (!(await colonneStagingOnlyPresente())) {
    delete fields.staging_only;
  } else if (fields.staging_only === true) {
    fields.active = false;
  } else if (fields.active === true) {
    fields.staging_only = false;
  }
  if (!(await colonneActivePresente())) delete fields.active;
}

/**
 * Quels jeux une liste publique (tables, accueil, site) doit-elle montrer ?
 *   - 'aucun'             : colonne active absente, on montre tout
 *   - 'actifs'            : active = true. C'est toujours le cas en production.
 *   - 'actifs-ou-staging' : active = true OU staging_only = true. Uniquement
 *                           sur l'environnement staging.
 *
 * Un jeu "staging uniquement" est TOUJOURS inactif (gameRoutes le garantit a
 * l'ecriture) : la production le masque donc par son filtre habituel, sans
 * avoir a connaitre la colonne staging_only. Staging et production partagent
 * la base ; cette regle fait qu'aucune version du code de production, meme
 * anterieure a cette option, ne peut montrer au bar un jeu en cours d'essai.
 */
export type FiltreVisibiliteJeux = 'aucun' | 'actifs' | 'actifs-ou-staging';

export async function filtreVisibiliteJeux(): Promise<FiltreVisibiliteJeux> {
  if (!(await colonneActivePresente())) return 'aucun';
  if (IS_STAGING && (await colonneStagingOnlyPresente())) return 'actifs-ou-staging';
  return 'actifs';
}

/** Expression PostgREST du filtre 'actifs-ou-staging', a passer a .or(). */
export const OR_ACTIFS_OU_STAGING = 'active.eq.true,staging_only.eq.true';
