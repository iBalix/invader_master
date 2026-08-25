/**
 * Generation d'images produit par IA.
 *
 * Calque sur services/battleQuestionGen.ts : fetch natif, pas de SDK, cle lue a
 * l'appel et non au demarrage, erreurs portant un `httpStatus` que la route
 * relaie via son helper serverError().
 *
 * TOUT SE PASSE COTE SERVEUR, ET CE N'EST PAS UN CHOIX DE STYLE. express.json()
 * est monte sans option `limit` (index.ts), donc plafonne au defaut de 100 Ko :
 * une image generee pese 1 a 3 Mo en base64 et ne peut pas transiter par un
 * corps JSON. Le front n'envoie qu'un prompt et recoit qu'une URL, ce qui garde
 * au passage la cle OpenAI hors du navigateur.
 *
 * CHAINE : references -> multipart -> OpenAI -> b64 -> recadrage 16:9 ->
 * optimizeImage() -> bucket invader-assets -> URL publique.
 */

import { randomUUID } from 'crypto';
import { supabaseAdmin } from '../config/supabase.js';
import {
  optimizeImage,
  cropToAspect,
  imageSize,
  resizeForReference,
  formatBytes,
} from '../lib/imageOptimizer.js';

const BUCKET = 'invader-assets';

/**
 * Prefixe legitime des medias du bar.
 *
 * `menu_products_v2.image_url` est du texte libre : telecharger une URL venue de
 * la base avec un simple fetch ouvrirait une SSRF depuis un process qui detient
 * la cle service_role. On refuse donc tout ce qui ne vient pas de notre bucket,
 * et on passe par le SDK Storage plutot que par le reseau. Meme garde-fou que
 * scripts/optimize-v2-images.ts.
 */
const PREFIXE_STOCKAGE = `${process.env.SUPABASE_URL ?? ''}/storage/v1/object/public/${BUCKET}/`;

/** le modele bouge vite : gpt-image-1 disparait en octobre 2026, rien n'est fige */
const MODELE = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2';
const QUALITE_DEFAUT = (process.env.OPENAI_IMAGE_QUALITY || 'medium') as Qualite;
/** garde-fou anti-emballement, en memoire : il se remet a zero au redeploiement */
const MAX_PAR_JOUR = Number(process.env.OPENAI_IMAGE_MAX_PER_DAY || 50);

/** format des bornes : toutes les images produit y sont affichees en 16:9 */
const LARGEUR = 1280;
const HAUTEUR = 720;
/** taille documentee, utilisee en repli si le modele refuse 1280x720 */
const TAILLE_REPLI = '1536x1024';

const MAX_REFERENCES = 4;
const MAX_OCTETS_PAR_REFERENCE = 8 * 1024 * 1024;
const MAX_OCTETS_CUMULES = 12 * 1024 * 1024;

const TIMEOUT_GENERATION_MS = 120_000;
const TIMEOUT_REFERENCE_MS = 15_000;

export type Qualite = 'low' | 'medium' | 'high';

export interface ResultatGeneration {
  url: string;
  path: string;
  bytes: number;
  width: number;
  height: number;
  model: string;
  quality: Qualite;
  referenceCount: number;
  /** true si le modele n'a pas honore 1280x720 et qu'on a recadre */
  cropped: boolean;
  durationMs: number;
}

function erreur(message: string, httpStatus: number): Error {
  return Object.assign(new Error(message), { httpStatus });
}

// ---------------------------------------------------------------------------
// Garde-fous de facturation
// ---------------------------------------------------------------------------

/**
 * Une generation a la fois par utilisateur. Le double-clic est le premier poste
 * de gaspillage : chaque appel est facture, abouti ou non. Meme patron que le
 * verrou stockJobRunning de battleQuestionGen.
 */
const enCours = new Set<string>();

/**
 * Deduplication par requestId.
 *
 * L'intercepteur 401 de frontend/src/lib/api.ts REJOUE la requete d'origine
 * apres avoir rafraichi le jeton. Si le jeton expire pendant une generation de
 * 40 s, le rejeu declencherait une seconde image payante pour un seul clic. On
 * memorise donc le resultat quelques minutes et on le renvoie tel quel.
 */
const dejaVu = new Map<string, { at: number; resultat: ResultatGeneration }>();
const TTL_DEDUP_MS = 5 * 60 * 1000;

function purgerDedup(): void {
  const limite = Date.now() - TTL_DEDUP_MS;
  for (const [cle, v] of dejaVu) if (v.at < limite) dejaVu.delete(cle);
}

/** compteur journalier en memoire, suffisant comme filet anti-emballement */
let compteurJour = { jour: '', n: 0 };

function incrementerCompteur(): void {
  const jour = new Date().toISOString().slice(0, 10);
  if (compteurJour.jour !== jour) compteurJour = { jour, n: 0 };
  if (compteurJour.n >= MAX_PAR_JOUR) {
    throw erreur(
      `Plafond de ${MAX_PAR_JOUR} generations par jour atteint. Reglable via OPENAI_IMAGE_MAX_PER_DAY.`,
      429,
    );
  }
  compteurJour.n += 1;
}

// ---------------------------------------------------------------------------
// References
// ---------------------------------------------------------------------------

/** chemin de stockage derive d'une URL publique, ou null si elle est etrangere */
function cheminDepuisUrl(url: string): string | null {
  if (!PREFIXE_STOCKAGE.startsWith('http') || !url.startsWith(PREFIXE_STOCKAGE)) return null;
  return decodeURIComponent(url.slice(PREFIXE_STOCKAGE.length));
}

/**
 * Telecharge les images de reference depuis le bucket, allegees.
 *
 * Toute reference qui echoue est sautee sans faire echouer la generation : mieux
 * vaut une image generee avec deux exemples sur trois qu'un message d'erreur.
 */
async function chargerReferences(urls: string[]): Promise<Buffer[]> {
  const out: Buffer[] = [];
  let cumul = 0;

  for (const url of urls.slice(0, MAX_REFERENCES)) {
    const chemin = cheminDepuisUrl(url);
    if (!chemin) {
      console.warn('[imageGen] reference hors bucket ignoree');
      continue;
    }
    try {
      const minuteur = setTimeout(() => undefined, TIMEOUT_REFERENCE_MS);
      const { data, error } = await supabaseAdmin.storage.from(BUCKET).download(chemin);
      clearTimeout(minuteur);
      if (error || !data) {
        console.warn(`[imageGen] reference introuvable: ${chemin}`);
        continue;
      }
      // supabase-js v2 renvoie un Blob, pas un Buffer
      const brut = Buffer.from(await data.arrayBuffer());
      if (brut.length > MAX_OCTETS_PAR_REFERENCE) {
        console.warn(`[imageGen] reference trop lourde ignoree (${formatBytes(brut.length)})`);
        continue;
      }
      const allege = await resizeForReference(brut);
      if (cumul + allege.length > MAX_OCTETS_CUMULES) break;
      cumul += allege.length;
      out.push(allege);
    } catch (err) {
      console.warn('[imageGen] reference illisible ignoree:', (err as Error).message);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Appel OpenAI
// ---------------------------------------------------------------------------

/** un seul appel, taille imposee ; renvoie le b64 ou leve */
async function appelerOpenAI(
  apiKey: string,
  prompt: string,
  references: Buffer[],
  taille: string,
  qualite: Qualite,
): Promise<string> {
  const controleur = new AbortController();
  const minuteur = setTimeout(() => controleur.abort(), TIMEOUT_GENERATION_MS);

  try {
    let reponse: Response;

    if (references.length > 0) {
      // Multipart : on ne pose PAS Content-Type a la main, undici doit generer
      // lui-meme le boundary. Le poser casse le parsing cote OpenAI.
      const form = new FormData();
      form.set('model', MODELE);
      form.set('prompt', prompt);
      form.set('size', taille);
      form.set('quality', qualite);
      form.set('n', '1');
      references.forEach((buf, i) => {
        form.append('image[]', new Blob([new Uint8Array(buf)], { type: 'image/jpeg' }), `ref-${i}.jpg`);
      });
      reponse = await fetch('https://api.openai.com/v1/images/edits', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
        signal: controleur.signal,
      });
    } else {
      reponse = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: MODELE, prompt, size: taille, quality: qualite, n: 1 }),
        signal: controleur.signal,
      });
    }

    if (!reponse.ok) {
      const corps = await reponse.text();
      const extrait = corps.slice(0, 400);
      console.error(`[imageGen] OpenAI ${reponse.status}: ${extrait}`);
      if (reponse.status === 400 && /moderation|safety|rejected/i.test(corps)) {
        throw erreur("Prompt refuse par la moderation d'OpenAI. Reformule la description.", 400);
      }
      if (reponse.status === 429) {
        throw erreur('OpenAI limite le debit ou le credit est epuise. Reessaie dans un moment.', 429);
      }
      // 400 sur la taille : signale a l'appelant pour qu'il tente le repli
      throw Object.assign(new Error(extrait), {
        httpStatus: reponse.status === 400 ? 400 : 502,
        openaiStatus: reponse.status,
        openaiBody: corps,
      });
    }

    const json = (await reponse.json()) as { data?: { b64_json?: string }[] };
    const b64 = json.data?.[0]?.b64_json;
    if (!b64) throw erreur("OpenAI n'a renvoye aucune image", 502);
    return b64;
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      throw erreur('La generation a depasse 2 minutes, elle a ete abandonnee.', 504);
    }
    throw err;
  } finally {
    clearTimeout(minuteur);
  }
}

/** le message d'erreur OpenAI incrimine-t-il la taille demandee ? */
function estRefusDeTaille(err: unknown): boolean {
  const e = err as { openaiStatus?: number; openaiBody?: string };
  return e.openaiStatus === 400 && /\bsize\b/i.test(e.openaiBody ?? '');
}

// ---------------------------------------------------------------------------
// Assemblage du prompt
// ---------------------------------------------------------------------------

/**
 * Remplit le gabarit de carte_settings.
 *
 * L'operateur ne voit jamais ce gabarit au moment de generer : il n'ecrit que ce
 * qui change d'une image a l'autre. Le nom du produit, son type et sa
 * description sont injectes ici, cote serveur, a partir de la fiche en cours
 * d'edition.
 *
 * {PRODUCT_NAME} apparait deux fois dans le gabarit fourni (l'accroche et le
 * texte de l'enseigne neon), d'ou le remplacement global et non ponctuel.
 *
 * Un gabarit sans aucun marqueur reste valide : la description est alors
 * simplement ajoutee a la suite, ce qui evite qu'un prompt reecrit a la main
 * dans les reglages ne perde silencieusement le produit.
 */
function assemblerPrompt(o: {
  gabarit: string;
  productName: string;
  productType: string;
  description: string;
  nbReferences: number;
}): string {
  const gabarit = o.gabarit.trim();
  const nom = o.productName.trim() || 'the product';
  const type = o.productType.trim() || 'drink';

  const aDesMarqueurs = /\{PRODUCT_(NAME|TYPE|DESCRIPTION)\}/.test(gabarit);
  const base = aDesMarqueurs
    ? gabarit
        .replaceAll('{PRODUCT_NAME}', nom)
        .replaceAll('{PRODUCT_TYPE}', type)
        .replaceAll('{PRODUCT_DESCRIPTION}', o.description)
    : `${gabarit}\n\n${nom} : ${o.description}`;

  // La consigne d'inspiration n'a de sens que s'il y a effectivement des
  // exemples joints : la reclamer sans piece jointe ferait halluciner un style.
  if (o.nbReferences === 0) return base.trim();
  return (
    base.trim() +
    `\n\nSTYLE REFERENCE: match the rendering style, framing and lighting mood of the ` +
    `${o.nbReferences} attached reference image(s). Do not copy their subject or their text.`
  );
}

// ---------------------------------------------------------------------------
// Entree publique
// ---------------------------------------------------------------------------

export interface OptionsGeneration {
  /** nom du produit en cours d'edition, injecte dans {PRODUCT_NAME} */
  productName: string;
  /** cocktail | shooter | food : pilote la branche conditionnelle du gabarit */
  productType: string;
  /** description du produit et precisions de l'operateur, injectees dans {PRODUCT_DESCRIPTION} */
  description: string;
  /** gabarit de prompt commun, lu dans carte_settings */
  promptDeBase: string;
  /** URL publiques des visuels a joindre en exemple */
  referenceUrls: string[];
  quality?: Qualite;
  /** identifiant de l'utilisateur, pour le verrou anti double-clic */
  userId: string;
  /** identifiant du clic, pour ne pas facturer deux fois un rejeu */
  requestId?: string;
}

export async function generateProductImage(opts: OptionsGeneration): Promise<ResultatGeneration> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw erreur('OPENAI_API_KEY non configuree', 500);

  const description = opts.description.trim();
  if (description.length < 3) throw erreur('Decris ce que doit montrer l\'image', 400);
  if (description.length > 2000) throw erreur('Description trop longue (2000 caracteres maximum)', 400);

  purgerDedup();
  if (opts.requestId) {
    const connu = dejaVu.get(opts.requestId);
    if (connu) {
      console.log('[imageGen] rejeu detecte, resultat precedent renvoye sans refacturation');
      return connu.resultat;
    }
  }

  if (enCours.has(opts.userId)) {
    throw erreur('Une generation est deja en cours, attends qu\'elle se termine.', 409);
  }
  enCours.add(opts.userId);

  const debut = Date.now();
  try {
    const references = await chargerReferences(opts.referenceUrls);

    const promptFinal = assemblerPrompt({
      gabarit: opts.promptDeBase,
      productName: opts.productName,
      productType: opts.productType,
      description,
      nbReferences: references.length,
    });

    const qualite = opts.quality ?? QUALITE_DEFAUT;
    incrementerCompteur();

    let b64: string;
    let recadre = false;
    try {
      b64 = await appelerOpenAI(apiKey, promptFinal, references, `${LARGEUR}x${HAUTEUR}`, qualite);
    } catch (err) {
      if (!estRefusDeTaille(err)) throw err;
      // Un 400 n'est pas facture, ce repli est gratuit. Un seul essai, jamais de boucle.
      console.warn(`[imageGen] ${LARGEUR}x${HAUTEUR} refuse, repli sur ${TAILLE_REPLI}`);
      b64 = await appelerOpenAI(apiKey, promptFinal, references, TAILLE_REPLI, qualite);
      recadre = true;
    }

    // annote explicitement : Buffer.from() infere Buffer<ArrayBuffer>, alors que
    // sharp renvoie Buffer<ArrayBufferLike>, plus large
    let buffer: Buffer = Buffer.from(b64, 'base64');

    // Recadrage au 16:9 des bornes, que le repli ait servi ou que le modele ait
    // simplement rendu un autre format.
    const taille = await imageSize(buffer);
    const ratioVoulu = LARGEUR / HAUTEUR;
    if (taille && Math.abs(taille.width / taille.height - ratioVoulu) > 0.01) {
      buffer = await cropToAspect(buffer, LARGEUR, HAUTEUR);
      recadre = true;
    }

    const optimisee = await optimizeImage(buffer, 'image/png', '.png');
    // optimizeImage peut renvoyer l'original inchange (sharp absent, ou WebP plus
    // lourd) : on suit SON extension et SON content-type, jamais .webp en dur.
    const chemin = `images/${randomUUID()}${optimisee.ext}`;

    const { error: erreurUpload } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(chemin, optimisee.buffer, { contentType: optimisee.contentType, upsert: false });
    if (erreurUpload) throw erreur(`Stockage: ${erreurUpload.message}`, 500);

    const { data: urlData } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(chemin);
    const finale = (await imageSize(optimisee.buffer)) ?? { width: LARGEUR, height: HAUTEUR };

    const resultat: ResultatGeneration = {
      url: urlData.publicUrl,
      path: chemin,
      bytes: optimisee.buffer.length,
      width: finale.width,
      height: finale.height,
      model: MODELE,
      quality: qualite,
      referenceCount: references.length,
      cropped: recadre,
      durationMs: Date.now() - debut,
    };

    console.log(
      `[imageGen] "${opts.productName}" (${opts.productType}) refs=${references.length} ${MODELE}/${qualite} ` +
        `${finale.width}x${finale.height} -> ${formatBytes(resultat.bytes)} en ${(resultat.durationMs / 1000).toFixed(1)} s`,
    );

    if (opts.requestId) dejaVu.set(opts.requestId, { at: Date.now(), resultat });
    return resultat;
  } finally {
    enCours.delete(opts.userId);
  }
}
