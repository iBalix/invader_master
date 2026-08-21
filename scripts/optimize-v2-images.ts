/**
 * Rattrapage : recompresse en WebP les images deja en place sur la carte v2 et
 * la ludotheque v2.
 *
 * POURQUOI : les bornes telechargeaient 62,2 Mo d'images pour ces deux pages,
 * dont 43 Mo pour 60 photos produit enregistrees en PNG palettise. L'optimiseur
 * d'upload ne s'applique qu'aux NOUVELLES images ; ce script rattrape
 * l'existant, avec exactement les memes regles puisqu'il appelle le meme
 * optimizeImage().
 *
 * PRUDENCE, et c'est le point central de ce script : 221 des 231 fichiers sont
 * PARTAGES avec les tables v1, que l'ancien site PHP invader_table consomme
 * encore en production via /public/carte et /public/games. On n'ecrase donc
 * jamais un objet existant et on ne supprime rien : on ecrit un NOUVEAU fichier
 * et on ne met a jour que les colonnes v2. L'ancien site continue de servir les
 * memes octets qu'avant, au bit pres.
 *
 * Usage, depuis la racine du projet :
 *   npx tsx scripts/optimize-v2-images.ts              # passe a blanc
 *   npx tsx scripts/optimize-v2-images.ts --apply      # ecrit
 *   npx tsx scripts/optimize-v2-images.ts --limit 5    # echantillon
 *
 * La passe a blanc telecharge et recompresse pour de vrai : ses chiffres sont
 * ceux qu'on obtiendra, seules les ecritures sont retenues.
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { optimizeImage, formatBytes, ImageTooLargeError } from '../backend/src/lib/imageOptimizer';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Variables SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY requises.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const BUCKET = 'invader-assets';
const FOLDER = 'images';
/** seules les URL de notre propre stockage sont touchees */
const PREFIXE_STOCKAGE = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/`;

const APPLIQUER = process.argv.includes('--apply');
const LIMITE = (() => {
  const i = process.argv.indexOf('--limit');
  return i >= 0 ? Number(process.argv[i + 1]) : null;
})();
/** nombre d'images traitees en parallele : assez pour aller vite, pas de quoi saturer */
const PARALLELISME = 4;

/** table + colonne a reecrire, dans l'ordre d'importance du gain attendu */
const CIBLES: { table: string; colonne: string }[] = [
  { table: 'menu_products_v2', colonne: 'image_url' },
  { table: 'menu_products_v2', colonne: 'icon_url' },
  { table: 'games_v2', colonne: 'cover_url' },
  { table: 'game_images_v2', colonne: 'image_url' },
  { table: 'game_consoles_v2', colonne: 'logo_url' },
  { table: 'game_categories_v2', colonne: 'texture_url' },
];

interface Resultat {
  ancienne: string;
  nouvelle: string | null;
  avant: number;
  apres: number;
  action: string;
}

function extensionDe(url: string): string {
  const nom = url.split('/').pop() ?? '';
  const point = nom.lastIndexOf('.');
  return point > 0 ? nom.slice(point) : '';
}

/** mimetype annonce par le stockage, avec repli sur l'extension */
function mimeDe(entete: string | null, ext: string): string {
  if (entete && entete.startsWith('image/')) return entete.split(';')[0].trim();
  const parExt: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
  };
  return parExt[ext.toLowerCase()] ?? 'application/octet-stream';
}

async function collecterUrls(): Promise<Map<string, { table: string; colonne: string }[]>> {
  /** URL -> emplacements qui la referencent (une meme image peut servir plusieurs fois) */
  const parUrl = new Map<string, { table: string; colonne: string }[]>();

  for (const cible of CIBLES) {
    const { data, error } = await supabase
      .from(cible.table)
      .select(cible.colonne)
      .not(cible.colonne, 'is', null);

    if (error) {
      console.error(`  ! lecture de ${cible.table}.${cible.colonne} : ${error.message}`);
      continue;
    }

    let retenues = 0;
    let ignorees = 0;
    for (const ligne of data ?? []) {
      const url = (ligne as Record<string, unknown>)[cible.colonne];
      if (typeof url !== 'string' || !url) continue;
      if (!url.startsWith(PREFIXE_STOCKAGE)) {
        ignorees += 1;
        continue;
      }
      const emplacements = parUrl.get(url) ?? [];
      // deux fois le meme couple table/colonne pour une meme URL : un seul UPDATE suffit
      if (!emplacements.some((e) => e.table === cible.table && e.colonne === cible.colonne)) {
        emplacements.push(cible);
      }
      parUrl.set(url, emplacements);
      retenues += 1;
    }
    const suffixe = ignorees > 0 ? `, ${ignorees} hors de notre stockage ignoree(s)` : '';
    console.log(`  ${cible.table}.${cible.colonne} : ${retenues} reference(s)${suffixe}`);
  }

  return parUrl;
}

async function traiter(ancienne: string): Promise<Resultat> {
  const reponse = await fetch(ancienne);
  if (!reponse.ok) {
    return { ancienne, nouvelle: null, avant: 0, apres: 0, action: `echec HTTP ${reponse.status}` };
  }
  const brut = Buffer.from(await reponse.arrayBuffer());
  const ext = extensionDe(ancienne);
  const mime = mimeDe(reponse.headers.get('content-type'), ext);

  let optimisee;
  try {
    optimisee = await optimizeImage(brut, mime, ext);
  } catch (err) {
    const raison = err instanceof ImageTooLargeError ? 'image trop grande' : (err as Error).message;
    return { ancienne, nouvelle: null, avant: brut.length, apres: brut.length, action: `ignoree : ${raison}` };
  }

  if (!optimisee.changed) {
    return { ancienne, nouvelle: null, avant: brut.length, apres: brut.length, action: 'inchangee' };
  }

  const base = { ancienne, avant: brut.length, apres: optimisee.buffer.length };

  if (!APPLIQUER) {
    return { ...base, nouvelle: null, action: 'a convertir' };
  }

  const chemin = `${FOLDER}/${randomUUID()}${optimisee.ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(chemin, optimisee.buffer, {
    contentType: optimisee.contentType,
    upsert: false,
  });
  if (error) {
    return { ...base, nouvelle: null, action: `echec upload : ${error.message}` };
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(chemin);
  return { ...base, nouvelle: data.publicUrl, action: 'convertie' };
}

/** applique les resultats sur les colonnes v2, une requete par emplacement */
async function reecrireColonnes(
  resultats: Resultat[],
  parUrl: Map<string, { table: string; colonne: string }[]>,
): Promise<number> {
  let lignes = 0;
  for (const r of resultats) {
    if (!r.nouvelle) continue;
    for (const { table, colonne } of parUrl.get(r.ancienne) ?? []) {
      const { data, error } = await supabase
        .from(table)
        .update({ [colonne]: r.nouvelle })
        .eq(colonne, r.ancienne)
        .select('id');
      if (error) {
        console.error(`  ! ${table}.${colonne} : ${error.message}`);
        continue;
      }
      lignes += data?.length ?? 0;
    }
  }
  return lignes;
}

async function main(): Promise<void> {
  console.log(APPLIQUER ? '=== MODE ECRITURE ===' : '=== PASSE A BLANC (ajouter --apply pour ecrire) ===');
  console.log('\nLecture des colonnes v2 :');
  const parUrl = await collecterUrls();

  let urls = [...parUrl.keys()].sort();
  if (LIMITE) urls = urls.slice(0, LIMITE);
  console.log(`\n${urls.length} image(s) unique(s) a traiter.\n`);

  const resultats: Resultat[] = [];
  for (let i = 0; i < urls.length; i += PARALLELISME) {
    const lot = await Promise.all(urls.slice(i, i + PARALLELISME).map(traiter));
    for (const r of lot) {
      resultats.push(r);
      const nom = r.ancienne.split('/').pop() ?? '';
      const gain = r.avant > 0 ? Math.round((1 - r.apres / r.avant) * 100) : 0;
      const detail =
        r.action === 'inchangee' || r.avant === 0
          ? r.action
          : `${formatBytes(r.avant)} -> ${formatBytes(r.apres)} (-${gain}%) ${r.action}`;
      console.log(`  [${String(resultats.length).padStart(3)}/${urls.length}] ${nom.slice(0, 40).padEnd(40)} ${detail}`);
    }
  }

  const convertibles = resultats.filter((r) => r.action === 'convertie' || r.action === 'a convertir');
  const avant = resultats.reduce((s, r) => s + r.avant, 0);
  const apres = resultats.reduce((s, r) => s + r.apres, 0);

  console.log('\n=== BILAN ===');
  console.log(`  images traitees    : ${resultats.length}`);
  console.log(`  a convertir        : ${convertibles.length}`);
  console.log(`  inchangees         : ${resultats.filter((r) => r.action === 'inchangee').length}`);
  const echecs = resultats.filter((r) => r.action.startsWith('echec') || r.action.startsWith('ignoree'));
  if (echecs.length) console.log(`  echecs / ignorees  : ${echecs.length}`);
  console.log(`  poids avant        : ${formatBytes(avant)}`);
  console.log(`  poids apres        : ${formatBytes(apres)}`);
  console.log(`  gain               : ${formatBytes(avant - apres)} (${Math.round((1 - apres / avant) * 100)}%)`);

  if (!APPLIQUER) {
    console.log('\nRien n\'a ete ecrit. Relancer avec --apply pour appliquer.');
    return;
  }

  const lignes = await reecrireColonnes(resultats, parUrl);
  console.log(`\n  ${lignes} ligne(s) v2 mise(s) a jour.`);

  // Plan de rollback : rejouer ces couples en sens inverse remet l'etat d'avant.
  // Aucun ancien objet n'a ete supprime, les anciennes URL repondent donc encore.
  const correspondance = resultats
    .filter((r) => r.nouvelle)
    .map((r) => ({
      ancienne: r.ancienne,
      nouvelle: r.nouvelle,
      emplacements: parUrl.get(r.ancienne),
      avant: r.avant,
      apres: r.apres,
    }));
  const fichier = `optimize-v2-images-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  writeFileSync(fichier, JSON.stringify(correspondance, null, 2));
  console.log(`  correspondance ecrite dans ${fichier} (sert de plan de rollback).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
