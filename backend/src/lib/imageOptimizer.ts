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
 *   - image avec canal alpha : elle reste en PNG. La convertir en JPEG
 *     noircirait le fond d'un logo transparent.
 *   - si le résultat est plus lourd que l'original, on garde l'original. Un
 *     fichier déjà optimisé ne doit pas grossir en passant ici.
 */

import sharp, { type Metadata } from 'sharp';

// Un conteneur Railway n'est pas une ferme de rendu : pas de cache libvips,
// une image à la fois. La latence d'un upload isolé est négligeable, la
// mémoire ne l'est pas.
sharp.cache(false);
sharp.concurrency(1);

/** au-delà, on réduit : le plus grand écran du bar est en 1920 */
const MAX_EDGE = 2560;
/** qualité JPEG : au-dessus, le gain de poids disparaît sans gain visible */
const JPEG_QUALITY = 88;
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
          // Sans perte : la transparence est préservée au pixel près.
          buffer: await pipeline.png({ compressionLevel: 9, effort: 10 }).toBuffer(),
          contentType: 'image/png',
          ext: '.png',
        }
      : {
          buffer: await pipeline
            .jpeg({ quality: JPEG_QUALITY, progressive: true, mozjpeg: true })
            .toBuffer(),
          contentType: 'image/jpeg',
          ext: '.jpg',
        };

    // Un JPEG déjà optimisé ressort souvent plus lourd : on ne dégrade pas.
    if (out.buffer.length >= buffer.length) return untouched;

    return { ...out, changed: true };
  } catch (err) {
    console.error('[upload] optimisation impossible, original conservé:', (err as Error).message);
    return untouched;
  }
}

/** "2.4 Mo" plutôt que "2538940", pour des logs lisibles en exploitation */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}
