/**
 * Optimisation des images à l'upload.
 *
 * POURQUOI : rien ne compressait avant, et les fonds de bornes arrivaient en
 * PNG de 2,4 Mo. Sur les mini-PC des tables, ça se voit au chargement. Plutôt
 * que de compresser à la main image par image, on le fait une fois pour toutes
 * ici : tout ce qui passe par POST /api/upload en profite, aujourd'hui et plus
 * tard.
 *
 * PRUDENCE : cette route ne sert pas qu'aux fonds. Elle sert aussi aux médias
 * de quiz, aux visuels produits, aux jaquettes de jeux et aux images de
 * boutons. Chaque règle ci-dessous existe pour ne casser aucun de ces usages :
 *
 *   - SVG intact : le rastériser détruirait le vectoriel.
 *   - GIF et WebP animés intacts : sharp aplatirait l'animation sur sa
 *     première image.
 *   - image avec canal alpha : WebP SANS PERTE. Un logo détouré ne doit pas
 *     gagner un halo pour économiser quelques Ko.
 *   - si le résultat est plus lourd que l'original, on garde l'original. Un
 *     fichier déjà optimisé ne doit pas grossir en passant ici.
 *
 * SORTIE EN WEBP, et pourquoi ce n'est plus du PNG/JPEG : le corpus réel du bar
 * l'a imposé. Les photos produit de la carte étaient des PNG palettisés 256
 * couleurs, format déjà compact où une réoptimisation sans perte ne gagnait que
 * 13 %. En WebP, les 231 images de la carte et de la ludothèque passent de
 * 62,2 Mo à 27,3 Mo. Le WebP a en plus l'avantage de couvrir les deux cas avec
 * un seul format : avec perte quand il n'y a pas d'alpha, sans perte quand il
 * y en a. Tout ce qui consomme ces images est soit une de nos apps React, soit
 * une balise <img> dans le PHP legacy, et Chrome gère le WebP depuis 2014.
 */

import type { Metadata, Sharp } from 'sharp';

/**
 * CHARGEMENT PARESSEUX, et volontairement non fatal.
 *
 * sharp est un module natif : il exige Node >= 20.9 et un binaire compilé pour
 * la plateforme. Un `import` en tête de fichier fait donc tomber TOUT le
 * backend au démarrage si l'hôte ne convient pas. C'est arrivé en production :
 * Railway tournait en Node 18 et le serveur bouclait sur un crash, alors que
 * l'optimisation d'image n'est qu'un confort.
 *
 * Une brique d'agrément ne doit jamais empêcher le bar de fonctionner : si
 * sharp est indisponible, les uploads passent sans compression et on le dit
 * une fois dans les logs.
 */
type SharpModule = {
  (input?: Buffer, opts?: { failOn?: 'none' }): Sharp;
  cache: (v: boolean) => unknown;
  concurrency: (v: number) => unknown;
};

let sharpModule: SharpModule | null = null;
let sharpTried = false;

async function getSharp(): Promise<SharpModule | null> {
  if (sharpTried) return sharpModule;
  sharpTried = true;
  try {
    const mod = (await import('sharp')) as unknown as { default: SharpModule };
    sharpModule = mod.default;
    // Un conteneur Railway n'est pas une ferme de rendu : pas de cache
    // libvips, une image à la fois. La latence d'un upload isolé est
    // négligeable, la mémoire ne l'est pas.
    sharpModule.cache(false);
    sharpModule.concurrency(1);
    console.log('[upload] optimisation d\'image active (sharp)');
  } catch (err) {
    sharpModule = null;
    console.warn(
      '[upload] sharp indisponible, les images seront stockées sans compression : ' +
        (err as Error).message,
    );
  }
  return sharpModule;
}

/** au-delà, on réduit : le plus grand écran du bar est en 1920 */
const MAX_EDGE = 2560;
/**
 * Qualité WebP.
 *
 * Le WebP a remplacé le couple PNG/JPEG en sortie parce que le corpus réel du
 * bar l'exigeait : les photos produit de la carte étaient des PNG palettisés
 * 256 couleurs, un format déjà compact que réoptimiser sans perte ne gagnait
 * que 13 %. En WebP q92, les 231 images de la carte et de la ludothèque tombent
 * de 62,2 Mo à 27,3 Mo, soit 56 % de moins.
 *
 * 92 et pas 88 : mesuré au rendu, à la taille réellement affichée sur la borne
 * (553x311 au plus grand pour une photo produit), q92 donne 41,7 dB de PSNR,
 * au-delà du seuil de 40 dB où l'écart cesse d'être visible. Descendre à 88 ne
 * gagnait que quelques pour cent de plus pour repasser sous ce seuil.
 */
const WEBP_QUALITY = 92;
/**
 * Garde-fou mémoire. Décoder une image de 100 Mpx demande plusieurs centaines
 * de Mo et ferait tomber le conteneur ; mieux vaut un refus lisible.
 */
const MAX_PIXELS = 50_000_000;

/** formats qu'on ne touche pas, quelle que soit leur taille */
const PASSTHROUGH_MIME = new Set(['image/svg+xml', 'image/gif', 'image/x-icon', 'image/vnd.microsoft.icon']);

export interface OptimizedImage {
  buffer: Buffer;
  contentType: string;
  /** extension à utiliser dans le chemin de stockage, point inclus */
  ext: string;
  /** true si le contenu a réellement été ré-encodé */
  changed: boolean;
}

export class ImageTooLargeError extends Error {}

/**
 * Retourne l'image optimisée, ou l'original si l'optimiser n'apporte rien.
 * Ne throw que sur une image démesurée (ImageTooLargeError) ; toute autre
 * anomalie retombe silencieusement sur l'original, un upload ne doit pas
 * échouer parce que la compression a hoqueté.
 */
export async function optimizeImage(
  buffer: Buffer,
  mimetype: string,
  originalExt: string,
): Promise<OptimizedImage> {
  const untouched: OptimizedImage = {
    buffer,
    contentType: mimetype,
    ext: originalExt,
    changed: false,
  };

  if (!mimetype.startsWith('image/')) return untouched;
  if (PASSTHROUGH_MIME.has(mimetype)) return untouched;

  const sharp = await getSharp();
  if (!sharp) return untouched;

  let meta: Metadata;
  try {
    meta = await sharp(buffer).metadata();
  } catch {
    // Illisible par sharp : on ne s'acharne pas, l'original part tel quel.
    return untouched;
  }

  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (!width || !height) return untouched;

  if (width * height > MAX_PIXELS) {
    throw new ImageTooLargeError(
      `Image trop grande (${Math.round((width * height) / 1_000_000)} Mpx, maximum ${MAX_PIXELS / 1_000_000} Mpx)`,
    );
  }

  // Animé : sharp ne garderait que la première image.
  if ((meta.pages ?? 1) > 1) return untouched;

  const hasAlpha = meta.hasAlpha === true;
  const tooBig = Math.max(width, height) > MAX_EDGE;

  try {
    let pipeline = sharp(buffer, { failOn: 'none' }).rotate(); // rotate() applique l'orientation EXIF
    if (tooBig) {
      pipeline = pipeline.resize({
        width: width >= height ? MAX_EDGE : undefined,
        height: height > width ? MAX_EDGE : undefined,
        withoutEnlargement: true,
        fit: 'inside',
      });
    }

    const out = hasAlpha
      ? {
          // Sans perte : la transparence est préservée au pixel près. Un logo
          // détouré ne doit pas gagner un halo pour économiser 20 Ko.
          buffer: await pipeline.webp({ lossless: true, effort: 6 }).toBuffer(),
          contentType: 'image/webp',
          ext: '.webp',
        }
      : {
          buffer: await pipeline.webp({ quality: WEBP_QUALITY, effort: 6 }).toBuffer(),
          contentType: 'image/webp',
          ext: '.webp',
        };

    // Une image déjà optimisée ressort parfois plus lourde : on ne dégrade pas.
    if (out.buffer.length >= buffer.length) return untouched;

    return { ...out, changed: true };
  } catch (err) {
    console.error('[upload] optimisation impossible, original conservé:', (err as Error).message);
    return untouched;
  }
}

/**
 * Recadre au ratio demandé, en rognant au centre.
 *
 * Sert à ramener une image générée par IA au 16:9 des bornes quand le modèle
 * n'a pas honoré la taille demandée. `fit: 'cover'` + `position: 'centre'`
 * reproduit exactement ce que fait l'`object-cover` des bornes : on rogne au
 * même endroit qu'à l'affichage, donc ce qu'on voit à l'aperçu est ce qui sera
 * servi.
 *
 * Si sharp est indisponible (cf. getSharp, déjà arrivé en production sur un
 * Node trop ancien), on renvoie le buffer intact : l'image part dans son format
 * d'origine et la borne la rognera au rendu. Une brique d'agrément ne doit
 * jamais empêcher d'enregistrer un produit.
 */
export async function cropToAspect(
  buffer: Buffer,
  width: number,
  height: number,
): Promise<Buffer> {
  const sharp = await getSharp();
  if (!sharp) {
    console.warn('[imageGen] sharp indisponible, recadrage 16:9 ignoré');
    return buffer;
  }
  try {
    return await sharp(buffer)
      .resize(width, height, { fit: 'cover', position: 'centre' })
      .toBuffer();
  } catch (err) {
    console.error('[imageGen] recadrage impossible, original conservé:', (err as Error).message);
    return buffer;
  }
}

/**
 * Allège une image de référence avant de l'envoyer à l'IA.
 *
 * Les références sont facturées en jetons d'entrée. Une photo produit de 250 Ko
 * en 1280x720 tombe autour de 80 Ko en JPEG q80 sur 1024 px d'arête, sans perte
 * utile pour transmettre un style. Sans sharp, on renvoie l'original : le
 * plafond de poids en amont a déjà écarté les cas extrêmes.
 */
export async function resizeForReference(buffer: Buffer, maxEdge = 1024): Promise<Buffer> {
  const sharp = await getSharp();
  if (!sharp) return buffer;
  try {
    return await sharp(buffer)
      .rotate()
      .resize(maxEdge, maxEdge, { withoutEnlargement: true, fit: 'inside' })
      .jpeg({ quality: 80 })
      .toBuffer();
  } catch {
    return buffer;
  }
}

/** dimensions d'une image, ou null si illisible ou si sharp est absent */
export async function imageSize(buffer: Buffer): Promise<{ width: number; height: number } | null> {
  const sharp = await getSharp();
  if (!sharp) return null;
  try {
    const meta = await sharp(buffer).metadata();
    if (!meta.width || !meta.height) return null;
    return { width: meta.width, height: meta.height };
  } catch {
    return null;
  }
}

/** "2.4 Mo" plutôt que "2538940", pour des logs lisibles en exploitation */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}
