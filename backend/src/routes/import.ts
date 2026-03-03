import { Router, type Request, type Response } from 'express';
import path from 'path';
import { randomUUID } from 'crypto';
import { supabaseAdmin } from '../config/supabase.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';

export const importRoutes = Router();
importRoutes.use(authMiddleware, requireRole('admin', 'salarie'));

const BUCKET = 'invader-assets';
const SPACE_ID = process.env.CONTENTFUL_SPACE_ID ?? '';
const TOKEN = process.env.CONTENTFUL_DELIVERY_TOKEN ?? '';
const CDN_BASE = `https://cdn.contentful.com/spaces/${SPACE_ID}/environments/master`;

// ---------------------------------------------------------------------------
// Contentful helpers
// ---------------------------------------------------------------------------

interface ContentfulEntry {
  sys: { id: string; contentType?: { sys: { id: string } } };
  fields: Record<string, unknown>;
}

interface ContentfulAsset {
  sys: { id: string };
  fields: { title?: string; file?: { url: string; contentType: string; fileName: string } };
}

interface ContentfulCollectionResponse {
  items: Array<{ sys: { id: string }; fields: Record<string, unknown> }>;
  includes?: { Entry?: ContentfulEntry[]; Asset?: ContentfulAsset[] };
}

async function fetchContentfulEntryWithIncludes(
  entryId: string,
): Promise<ContentfulCollectionResponse> {
  const url = `${CDN_BASE}/entries?access_token=${TOKEN}&include=10&locale=fr&sys.id=${entryId}`;
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Contentful API ${res.status}: ${text}`);
  }
  return res.json() as Promise<ContentfulCollectionResponse>;
}

function resolveEntry(
  id: string,
  includes: ContentfulCollectionResponse['includes'],
): ContentfulEntry | undefined {
  return includes?.Entry?.find((e) => e.sys.id === id);
}

function resolveAsset(
  id: string,
  includes: ContentfulCollectionResponse['includes'],
): ContentfulAsset | undefined {
  return includes?.Asset?.find((a) => a.sys.id === id);
}

function getLinkedAssetId(field: unknown): string | null {
  if (
    field &&
    typeof field === 'object' &&
    'sys' in (field as Record<string, unknown>) &&
    (field as { sys: { id: string } }).sys.id
  ) {
    return (field as { sys: { id: string } }).sys.id;
  }
  return null;
}

async function downloadAndUploadAsset(
  asset: ContentfulAsset,
): Promise<string | null> {
  const fileInfo = asset.fields?.file;
  if (!fileInfo?.url) return null;

  const assetUrl = fileInfo.url.startsWith('//') ? `https:${fileInfo.url}` : fileInfo.url;

  const res = await fetch(assetUrl);
  if (!res.ok) {
    console.error(`Failed to download asset ${asset.sys.id}: ${res.status}`);
    return null;
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  const ext = path.extname(fileInfo.fileName || '').toLowerCase() || '.bin';
  const contentType = fileInfo.contentType || 'application/octet-stream';
  const folder = contentType.startsWith('image/') ? 'images' : 'audio';
  const storagePath = `${folder}/${randomUUID()}${ext}`;

  const { error } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(storagePath, buffer, { contentType, upsert: false });

  if (error) {
    console.error(`Upload asset error (${asset.sys.id}):`, error.message);
    return null;
  }

  const { data } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(storagePath);
  return data.publicUrl;
}

// ---------------------------------------------------------------------------
// SSE helpers
// ---------------------------------------------------------------------------

function sendSSE(res: Response, event: string, data: Record<string, unknown>) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

// ---------------------------------------------------------------------------
// POST /api/import/contentful-quiz   (SSE streaming response)
// ---------------------------------------------------------------------------

importRoutes.post('/contentful-quiz', async (req: Request, res: Response) => {
  const { entryId } = req.body;
  if (!entryId || typeof entryId !== 'string') {
    res.status(400).json({ status: 'error', message: 'entryId requis' });
    return;
  }

  if (!SPACE_ID || !TOKEN) {
    res.status(500).json({ status: 'error', message: 'Credentials Contentful non configurés' });
    return;
  }

  // Check duplicate before starting SSE
  const { data: existingQuiz } = await supabaseAdmin
    .from('quizzes')
    .select('id, name')
    .eq('contentful_id', entryId)
    .single();

  if (existingQuiz) {
    res.status(409).json({
      status: 'error',
      message: `Ce quiz a déjà été importé ("${existingQuiz.name}")`,
    });
    return;
  }

  // Start SSE stream
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  try {
    // Step 1: Fetch from Contentful
    sendSSE(res, 'progress', {
      step: 'fetch',
      message: 'Récupération du quiz depuis Contentful...',
    });

    const collection = await fetchContentfulEntryWithIncludes(entryId);

    if (!collection.items || collection.items.length === 0) {
      sendSSE(res, 'error', { message: `Entrée "${entryId}" introuvable dans Contentful` });
      res.end();
      return;
    }

    const entry = collection.items[0];
    const fields = entry.fields;
    const includes = collection.includes;

    const questionRefs = fields.questions as Array<{ sys: { id: string } }> | undefined;
    const totalQuestions = Array.isArray(questionRefs) ? questionRefs.length : 0;
    const totalAssets = includes?.Asset?.length ?? 0;

    sendSSE(res, 'progress', {
      step: 'fetched',
      message: `Quiz "${fields.name}" trouvé — ${totalQuestions} questions, ${totalAssets} assets`,
    });

    // Step 2: Download & upload quiz assets
    sendSSE(res, 'progress', {
      step: 'quiz_assets',
      message: 'Téléchargement des assets du quiz...',
    });

    const bgMusicAssetId = getLinkedAssetId(fields.backgroundMusic);
    const bgImageAssetId = getLinkedAssetId(fields.backgroundImage);

    let bgMusicUrl: string | null = null;
    let bgImageUrl: string | null = null;

    if (bgMusicAssetId) {
      const asset = resolveAsset(bgMusicAssetId, includes);
      if (asset) {
        sendSSE(res, 'progress', {
          step: 'quiz_asset',
          message: `↳ Musique de fond : ${asset.fields?.file?.fileName ?? 'asset'}`,
        });
        bgMusicUrl = await downloadAndUploadAsset(asset);
      }
    }
    if (bgImageAssetId) {
      const asset = resolveAsset(bgImageAssetId, includes);
      if (asset) {
        sendSSE(res, 'progress', {
          step: 'quiz_asset',
          message: `↳ Image de fond : ${asset.fields?.file?.fileName ?? 'asset'}`,
        });
        bgImageUrl = await downloadAndUploadAsset(asset);
      }
    }

    // Step 3: Insert quiz
    sendSSE(res, 'progress', {
      step: 'quiz_create',
      message: 'Création du quiz en base...',
    });

    const quizPayload = {
      name: (fields.name as string) || `Import ${entryId}`,
      theme: (fields.theme as string) || '',
      background_media_youtube: (fields.backgroundMediaYoutube as string) || null,
      background_music_url: bgMusicUrl,
      background_image_url: bgImageUrl,
      pause_promotional_text: (fields.pausePromotionalText as string) || null,
      end_winner_text: (fields.endWinnerText as string) || null,
      end_text_final: (fields.endTextFinal as string) || null,
      do_not_delete: (fields.doNotDelete as boolean) ?? false,
      published: true,
      contentful_id: entryId,
      last_edited_by: req.user!.id,
      last_edited_by_email: req.user!.email,
    };

    const { data: quiz, error: quizError } = await supabaseAdmin
      .from('quizzes')
      .insert(quizPayload)
      .select()
      .single();

    if (quizError) {
      sendSSE(res, 'error', { message: quizError.message });
      res.end();
      return;
    }

    sendSSE(res, 'progress', {
      step: 'quiz_created',
      message: `Quiz "${quiz.name}" créé ✓`,
    });

    // Step 4: Process questions
    let importedCount = 0;

    if (Array.isArray(questionRefs)) {
      for (let i = 0; i < questionRefs.length; i++) {
        const qRef = questionRefs[i];
        const qEntryId = qRef.sys.id;

        sendSSE(res, 'progress', {
          step: 'question',
          message: `Question ${i + 1}/${totalQuestions}...`,
          current: i + 1,
          total: totalQuestions,
        });

        // Check if question already imported
        const { data: existingQ } = await supabaseAdmin
          .from('questions')
          .select('id, question')
          .eq('contentful_id', qEntryId)
          .single();

        if (existingQ) {
          await supabaseAdmin.from('quiz_questions').insert({
            quiz_id: quiz.id,
            question_id: existingQ.id,
            position: i,
          });
          sendSSE(res, 'progress', {
            step: 'question_done',
            message: `Question ${i + 1}/${totalQuestions} — réutilisée : "${existingQ.question.substring(0, 50)}..."`,
            current: i + 1,
            total: totalQuestions,
          });
          importedCount++;
          continue;
        }

        const qEntry = resolveEntry(qEntryId, includes);
        if (!qEntry) {
          sendSSE(res, 'progress', {
            step: 'question_skip',
            message: `Question ${i + 1}/${totalQuestions} — entrée ${qEntryId} introuvable, ignorée`,
            current: i + 1,
            total: totalQuestions,
          });
          continue;
        }

        const qFields = qEntry.fields;

        // Parse answers
        const rawAnswers = (qFields.answers as string[]) || [];
        let correctIndex = 0;
        const cleanAnswers = rawAnswers.map((a, idx) => {
          if (a.endsWith(' (OK)')) {
            correctIndex = idx;
            return a.slice(0, -5);
          }
          return a;
        });

        while (cleanAnswers.length < 4) cleanAnswers.push('');

        // Resolve question assets
        const musicId = getLinkedAssetId(qFields.music);
        const imgQuestionId = getLinkedAssetId(qFields.imageQuestion);
        const imgAnswerId = getLinkedAssetId(qFields.imageAnswer);

        let musicUrl: string | null = null;
        let imgQuestionUrl: string | null = null;
        let imgAnswerUrl: string | null = null;

        if (musicId) {
          const a = resolveAsset(musicId, includes);
          if (a) {
            sendSSE(res, 'progress', {
              step: 'question_asset',
              message: `↳ Musique : ${a.fields?.file?.fileName ?? 'audio'}`,
            });
            musicUrl = await downloadAndUploadAsset(a);
          }
        }
        if (imgQuestionId) {
          const a = resolveAsset(imgQuestionId, includes);
          if (a) {
            sendSSE(res, 'progress', {
              step: 'question_asset',
              message: `↳ Image question : ${a.fields?.file?.fileName ?? 'image'}`,
            });
            imgQuestionUrl = await downloadAndUploadAsset(a);
          }
        }
        if (imgAnswerId) {
          const a = resolveAsset(imgAnswerId, includes);
          if (a) {
            sendSSE(res, 'progress', {
              step: 'question_asset',
              message: `↳ Image réponse : ${a.fields?.file?.fileName ?? 'image'}`,
            });
            imgAnswerUrl = await downloadAndUploadAsset(a);
          }
        }

        // Difficulty
        const rawDiff = qFields.difficulty;
        let difficulty: string[] = [];
        if (Array.isArray(rawDiff)) {
          difficulty = rawDiff as string[];
        } else if (typeof rawDiff === 'string' && rawDiff) {
          difficulty = [rawDiff];
        }

        const questionPayload = {
          question: (qFields.question as string) || '',
          difficulty,
          answers: cleanAnswers,
          correct_answer_index: correctIndex,
          help_animator: (qFields.helpAnimator as string) || null,
          music_url: musicUrl,
          video_youtube: (qFields.videoYoutube as string) || null,
          image_question_url: imgQuestionUrl,
          image_answer_url: imgAnswerUrl,
          contentful_id: qEntryId,
        };

        const { data: newQ, error: qError } = await supabaseAdmin
          .from('questions')
          .insert(questionPayload)
          .select()
          .single();

        if (qError) {
          console.error(`Insert question error (${qEntryId}):`, qError.message);
          sendSSE(res, 'progress', {
            step: 'question_error',
            message: `Question ${i + 1}/${totalQuestions} — erreur : ${qError.message}`,
            current: i + 1,
            total: totalQuestions,
          });
          continue;
        }

        await supabaseAdmin.from('quiz_questions').insert({
          quiz_id: quiz.id,
          question_id: newQ.id,
          position: i,
        });

        importedCount++;

        sendSSE(res, 'progress', {
          step: 'question_done',
          message: `Question ${i + 1}/${totalQuestions} — "${(newQ.question as string).substring(0, 50)}..." ✓`,
          current: i + 1,
          total: totalQuestions,
        });
      }
    }

    // Update last edited
    await supabaseAdmin
      .from('quizzes')
      .update({ last_edited_by: req.user!.id, last_edited_by_email: req.user!.email })
      .eq('id', quiz.id);

    sendSSE(res, 'done', {
      quiz: { id: quiz.id, name: quiz.name, questionCount: importedCount },
    });

    res.end();
  } catch (err) {
    console.error('Import contentful quiz error:', err);
    const message = err instanceof Error ? err.message : 'Erreur serveur';
    sendSSE(res, 'error', { message });
    res.end();
  }
});

// ---------------------------------------------------------------------------
// POST /api/import/contentful-carte   (SSE streaming — imports all categories + products)
// ---------------------------------------------------------------------------

async function fetchContentfulCollection(
  contentType: string,
  extra = '',
): Promise<ContentfulCollectionResponse> {
  const url = `${CDN_BASE}/entries?access_token=${TOKEN}&content_type=${contentType}&limit=500&locale=fr&include=2${extra}`;
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Contentful API ${res.status}: ${text}`);
  }
  return res.json() as Promise<ContentfulCollectionResponse>;
}

importRoutes.post('/contentful-carte', async (req: Request, res: Response) => {
  if (!SPACE_ID || !TOKEN) {
    res.status(500).json({ status: 'error', message: 'Credentials Contentful non configurés' });
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  try {
    // Step 1: Fetch all categories & products from Contentful
    sendSSE(res, 'progress', { step: 'fetch', message: 'Récupération des catégories depuis Contentful...' });
    const catCollection = await fetchContentfulCollection('carteCatgorie', '&order=fields.weight');
    const catItems = catCollection.items;
    const catAssets = catCollection.includes;

    sendSSE(res, 'progress', { step: 'fetch', message: `${catItems.length} catégories trouvées` });

    sendSSE(res, 'progress', { step: 'fetch', message: 'Récupération des produits depuis Contentful...' });
    const prodCollection = await fetchContentfulCollection('carteProduit');
    const prodItems = prodCollection.items;
    const prodAssets = prodCollection.includes;

    sendSSE(res, 'progress', {
      step: 'fetched',
      message: `${prodItems.length} produits trouvés — ${(prodAssets?.Asset ?? []).length + (catAssets?.Asset ?? []).length} assets`,
    });

    // Merge all assets from both collections
    const allAssets: ContentfulAsset[] = [
      ...(catAssets?.Asset ?? []),
      ...(prodAssets?.Asset ?? []),
    ];
    const assetMap = new Map(allAssets.map((a) => [a.sys.id, a]));

    // Step 2: Import products
    sendSSE(res, 'progress', { step: 'products', message: 'Import des produits...' });

    const contentfulToProductId = new Map<string, string>();
    let productCount = 0;
    let assetCount = 0;

    for (let i = 0; i < prodItems.length; i++) {
      const p = prodItems[i];
      const pf = p.fields;
      const cfId = p.sys.id;

      sendSSE(res, 'progress', {
        step: 'product',
        message: `Produit ${i + 1}/${prodItems.length} : ${(pf.name as string) || cfId}`,
        current: i + 1,
        total: prodItems.length,
      });

      const { data: existing } = await supabaseAdmin
        .from('menu_products')
        .select('id')
        .eq('contentful_id', cfId)
        .single();

      if (existing) {
        contentfulToProductId.set(cfId, existing.id);
        sendSSE(res, 'progress', {
          step: 'product_done',
          message: `Produit ${i + 1}/${prodItems.length} — déjà importé ✓`,
          current: i + 1,
          total: prodItems.length,
        });
        productCount++;
        continue;
      }

      let iconUrl: string | null = null;
      let imageUrl: string | null = null;

      const iconAssetId = getLinkedAssetId(pf.icon);
      if (iconAssetId) {
        const asset = assetMap.get(iconAssetId);
        if (asset) {
          sendSSE(res, 'progress', { step: 'product_asset', message: `↳ Icône : ${asset.fields?.file?.fileName ?? 'image'}` });
          iconUrl = await downloadAndUploadAsset(asset);
          if (iconUrl) assetCount++;
        }
      }

      const imgAssetId = getLinkedAssetId(pf.image);
      if (imgAssetId) {
        const asset = assetMap.get(imgAssetId);
        if (asset) {
          sendSSE(res, 'progress', { step: 'product_asset', message: `↳ Image : ${asset.fields?.file?.fileName ?? 'image'}` });
          imageUrl = await downloadAndUploadAsset(asset);
          if (imageUrl) assetCount++;
        }
      }

      const payload = {
        name: (pf.name as string) || '',
        description: (pf.description as string) || null,
        subtitle: (pf.subtitle as string) || null,
        price: (pf.price as number) ?? 0,
        price_hh: (pf.priceHH as number) ?? null,
        price_second: (pf.priceSecond as number) ?? null,
        icon_url: iconUrl,
        image_url: imageUrl,
        display_order: (pf.order as number) ?? 100,
        contentful_id: cfId,
      };

      const { data: newP, error: pErr } = await supabaseAdmin
        .from('menu_products')
        .insert(payload)
        .select()
        .single();

      if (pErr) {
        sendSSE(res, 'progress', {
          step: 'product_error',
          message: `Produit ${i + 1}/${prodItems.length} — erreur : ${pErr.message}`,
          current: i + 1,
          total: prodItems.length,
        });
        continue;
      }

      contentfulToProductId.set(cfId, newP.id);
      productCount++;

      sendSSE(res, 'progress', {
        step: 'product_done',
        message: `Produit ${i + 1}/${prodItems.length} — "${(pf.name as string).substring(0, 40)}" ✓`,
        current: i + 1,
        total: prodItems.length,
      });
    }

    // Step 3: Import categories
    sendSSE(res, 'progress', { step: 'categories', message: 'Import des catégories...' });

    const contentfulToCatId = new Map<string, string>();
    let categoryCount = 0;

    // First pass: insert all categories without parent_id
    for (let i = 0; i < catItems.length; i++) {
      const c = catItems[i];
      const cf = c.fields;
      const cfId = c.sys.id;

      sendSSE(res, 'progress', {
        step: 'category',
        message: `Catégorie ${i + 1}/${catItems.length} : ${(cf.name as string) || cfId}`,
        current: i + 1,
        total: catItems.length,
      });

      const { data: existing } = await supabaseAdmin
        .from('menu_categories')
        .select('id')
        .eq('contentful_id', cfId)
        .single();

      if (existing) {
        contentfulToCatId.set(cfId, existing.id);
        sendSSE(res, 'progress', {
          step: 'category_done',
          message: `Catégorie ${i + 1}/${catItems.length} — déjà importée ✓`,
          current: i + 1,
          total: catItems.length,
        });
        categoryCount++;
        continue;
      }

      const payload = {
        name: (cf.name as string) || '',
        is_main_category: (cf.isMainCategory as boolean) ?? false,
        weight: (cf.weight as number) ?? 0,
        begin_hour: (cf.beginHour as string) || null,
        end_hour: (cf.endHour as string) || null,
        contentful_id: cfId,
      };

      const { data: newCat, error: cErr } = await supabaseAdmin
        .from('menu_categories')
        .insert(payload)
        .select()
        .single();

      if (cErr) {
        sendSSE(res, 'progress', {
          step: 'category_error',
          message: `Catégorie ${i + 1}/${catItems.length} — erreur : ${cErr.message}`,
          current: i + 1,
          total: catItems.length,
        });
        continue;
      }

      contentfulToCatId.set(cfId, newCat.id);
      categoryCount++;

      sendSSE(res, 'progress', {
        step: 'category_done',
        message: `Catégorie ${i + 1}/${catItems.length} — "${(cf.name as string).substring(0, 40)}" ✓`,
        current: i + 1,
        total: catItems.length,
      });
    }

    // Second pass: resolve parent_id + product links
    sendSSE(res, 'progress', { step: 'links', message: 'Résolution des liens parents et produits...' });

    for (const c of catItems) {
      const cfId = c.sys.id;
      const dbCatId = contentfulToCatId.get(cfId);
      if (!dbCatId) continue;
      const cf = c.fields;

      // Resolve subCategories -> set parent_id on children
      const subCatRefs = cf.subCategories as Array<{ sys: { id: string } }> | undefined;
      if (Array.isArray(subCatRefs)) {
        for (const sub of subCatRefs) {
          const childDbId = contentfulToCatId.get(sub.sys.id);
          if (childDbId) {
            await supabaseAdmin
              .from('menu_categories')
              .update({ parent_id: dbCatId })
              .eq('id', childDbId);
          }
        }
      }

      // Link products
      const menuRefs = cf.menu as Array<{ sys: { id: string } }> | undefined;
      if (Array.isArray(menuRefs)) {
        const linksToInsert = menuRefs
          .map((ref, pos) => {
            const prodDbId = contentfulToProductId.get(ref.sys.id);
            if (!prodDbId) return null;
            return { category_id: dbCatId, product_id: prodDbId, position: pos };
          })
          .filter(Boolean);

        if (linksToInsert.length > 0) {
          await supabaseAdmin.from('category_products').upsert(linksToInsert as Array<{
            category_id: string;
            product_id: string;
            position: number;
          }>, { onConflict: 'category_id,product_id' });
        }
      }
    }

    sendSSE(res, 'done', {
      categories: categoryCount,
      products: productCount,
      assets: assetCount,
    });

    res.end();
  } catch (err) {
    console.error('Import contentful carte error:', err);
    const message = err instanceof Error ? err.message : 'Erreur serveur';
    sendSSE(res, 'error', { message });
    res.end();
  }
});
