import { Router, type Request, type Response } from 'express';
import path from 'node:path';
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
  const url = `${CDN_BASE}/entries?access_token=${TOKEN}&include=2&locale=fr&sys.id=${entryId}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Contentful API ${res.status}: ${text}`);
    }
    return res.json() as Promise<ContentfulCollectionResponse>;
  } finally {
    clearTimeout(timeout);
  }
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
  retries = 3,
): Promise<string | null> {
  const fileInfo = asset.fields?.file;
  if (!fileInfo?.url) return null;

  const assetUrl = fileInfo.url.startsWith('//') ? `https:${fileInfo.url}` : fileInfo.url;

  let buffer: Buffer | null = null;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);
      const res = await fetch(assetUrl, { signal: controller.signal });
      clearTimeout(timeout);
      if (!res.ok) {
        console.error(`Failed to download asset ${asset.sys.id}: ${res.status}`);
        return null;
      }
      buffer = Buffer.from(await res.arrayBuffer());
      break;
    } catch (err) {
      console.error(`Download asset ${asset.sys.id} attempt ${attempt}/${retries} failed:`, (err as Error).message);
      if (attempt === retries) return null;
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }

  if (!buffer) return null;

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
// GET /api/import/diff-contentful-quizzes   (compare Contentful vs DB)
// ---------------------------------------------------------------------------

importRoutes.get('/diff-contentful-quizzes', async (_req: Request, res: Response) => {
  if (!SPACE_ID || !TOKEN) {
    res.status(500).json({ status: 'error', message: 'Credentials Contentful non configurés' });
    return;
  }

  try {
    let cfQuizzes: ContentfulCollectionResponse;
    let cfQuestions: ContentfulCollectionResponse;
    try {
      cfQuizzes = await fetchContentfulCollection('quizz');
    } catch (fetchErr) {
      console.error('Fetch Contentful quizzes failed:', fetchErr);
      res.status(502).json({ status: 'error', message: `Impossible de contacter Contentful (quizz): ${fetchErr instanceof Error ? fetchErr.message : 'fetch failed'}` });
      return;
    }
    try {
      cfQuestions = await fetchContentfulCollection('question');
    } catch (fetchErr) {
      console.error('Fetch Contentful questions failed:', fetchErr);
      res.status(502).json({ status: 'error', message: `Impossible de contacter Contentful (question): ${fetchErr instanceof Error ? fetchErr.message : 'fetch failed'}` });
      return;
    }

    const { data: dbQuizzes } = await supabaseAdmin.from('quizzes').select('contentful_id');
    const { data: dbQuestions } = await supabaseAdmin.from('questions').select('contentful_id');

    const dbQuizIds = new Set((dbQuizzes ?? []).map((q) => q.contentful_id).filter(Boolean));
    const dbQuestionIds = new Set((dbQuestions ?? []).map((q) => q.contentful_id).filter(Boolean));

    const missingQuizzes = cfQuizzes.items
      .filter((q) => !dbQuizIds.has(q.sys.id))
      .map((q) => ({ contentfulId: q.sys.id, name: (q.fields.name as string) || q.sys.id }));

    const missingQuestions = cfQuestions.items
      .filter((q) => !dbQuestionIds.has(q.sys.id))
      .map((q) => ({ contentfulId: q.sys.id, question: (q.fields.question as string) || q.sys.id }));

    res.json({
      status: 'success',
      missingQuizzes,
      missingQuestions,
      totalContentfulQuizzes: cfQuizzes.items.length,
      totalContentfulQuestions: cfQuestions.items.length,
      totalDbQuizzes: dbQuizIds.size,
      totalDbQuestions: dbQuestionIds.size,
    });
  } catch (err) {
    console.error('Diff contentful quizzes error:', err);
    res.status(500).json({ status: 'error', message: 'Erreur serveur' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/import/sync-contentful-quizzes   (SSE — selective import)
// ---------------------------------------------------------------------------

importRoutes.post('/sync-contentful-quizzes', async (req: Request, res: Response) => {
  const { quizIds } = req.body as { quizIds?: string[] };
  if (!Array.isArray(quizIds) || quizIds.length === 0) {
    res.status(400).json({ status: 'error', message: 'quizIds requis (tableau d\'IDs Contentful)' });
    return;
  }

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
    let importedQuizzes = 0;
    let importedQuestions = 0;

    for (let qi = 0; qi < quizIds.length; qi++) {
      const entryId = quizIds[qi];

      sendSSE(res, 'progress', { step: 'quiz', message: `Quiz ${qi + 1}/${quizIds.length} — récupération...`, current: qi + 1, total: quizIds.length });

      const { data: existingQuiz } = await supabaseAdmin
        .from('quizzes')
        .select('id')
        .eq('contentful_id', entryId)
        .single();

      if (existingQuiz) {
        sendSSE(res, 'progress', { step: 'quiz_done', message: `Quiz ${qi + 1}/${quizIds.length} — déjà importé ✓`, current: qi + 1, total: quizIds.length });
        importedQuizzes++;
        continue;
      }

      let collection: Awaited<ReturnType<typeof fetchContentfulEntryWithIncludes>>;
      try {
        collection = await fetchContentfulEntryWithIncludes(entryId);
      } catch (fetchErr) {
        sendSSE(res, 'progress', { step: 'quiz_error', message: `Quiz ${qi + 1}/${quizIds.length} — erreur Contentful : ${fetchErr instanceof Error ? fetchErr.message : 'fetch failed'}`, current: qi + 1, total: quizIds.length });
        continue;
      }
      if (!collection.items || collection.items.length === 0) {
        sendSSE(res, 'progress', { step: 'quiz_error', message: `Quiz ${qi + 1}/${quizIds.length} — introuvable sur Contentful`, current: qi + 1, total: quizIds.length });
        continue;
      }

      const entry = collection.items[0];
      const fields = entry.fields;
      const includes = collection.includes;

      let bgMusicUrl: string | null = null;
      let bgImageUrl: string | null = null;

      try {
        const bgMusicAssetId = getLinkedAssetId(fields.backgroundMusic);
        if (bgMusicAssetId) {
          const asset = resolveAsset(bgMusicAssetId, includes);
          if (asset) {
            sendSSE(res, 'progress', { step: 'asset', message: `  ↳ Musique de fond...` });
            bgMusicUrl = await downloadAndUploadAsset(asset);
          }
        }
        const bgImageAssetId = getLinkedAssetId(fields.backgroundImage);
        if (bgImageAssetId) {
          const asset = resolveAsset(bgImageAssetId, includes);
          if (asset) {
            sendSSE(res, 'progress', { step: 'asset', message: `  ↳ Image de fond...` });
            bgImageUrl = await downloadAndUploadAsset(asset);
          }
        }
      } catch (assetErr) {
        sendSSE(res, 'progress', { step: 'asset_error', message: `  ↳ Erreur asset quiz : ${(assetErr as Error).message}` });
      }

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
      published: false,
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
        sendSSE(res, 'progress', { step: 'quiz_error', message: `Quiz erreur : ${quizError.message}`, current: qi + 1, total: quizIds.length });
        continue;
      }

      const questionRefs = fields.questions as Array<{ sys: { id: string } }> | undefined;
      const totalQ = Array.isArray(questionRefs) ? questionRefs.length : 0;
      if (Array.isArray(questionRefs)) {
        for (let i = 0; i < questionRefs.length; i++) {
          const qRef = questionRefs[i];
          const qEntryId = qRef.sys.id;

          sendSSE(res, 'progress', { step: 'question', message: `  Question ${i + 1}/${totalQ}...` });

          const { data: existingQ } = await supabaseAdmin.from('questions').select('id').eq('contentful_id', qEntryId).single();
          if (existingQ) {
            await supabaseAdmin.from('quiz_questions').insert({ quiz_id: quiz.id, question_id: existingQ.id, position: i });
            importedQuestions++;
            sendSSE(res, 'progress', { step: 'question_done', message: `  Question ${i + 1}/${totalQ} — réutilisée ✓` });
            continue;
          }

          const qEntry = resolveEntry(qEntryId, includes);
          if (!qEntry) {
            sendSSE(res, 'progress', { step: 'question_error', message: `  Question ${i + 1}/${totalQ} — introuvable` });
            continue;
          }

          const qFields = qEntry.fields;
          const rawAnswers = (qFields.answers as string[]) || [];
          let correctIndex = 0;
          const cleanAnswers = rawAnswers.map((a, idx) => {
            if (a.endsWith(' (OK)')) { correctIndex = idx; return a.slice(0, -5); }
            return a;
          });
          while (cleanAnswers.length < 4) cleanAnswers.push('');

          let musicUrl: string | null = null;
          let imgQuestionUrl: string | null = null;
          let imgAnswerUrl: string | null = null;

          const musicId = getLinkedAssetId(qFields.music);
          if (musicId) { const a = resolveAsset(musicId, includes); if (a) { sendSSE(res, 'progress', { step: 'asset', message: `  ↳ Audio...` }); musicUrl = await downloadAndUploadAsset(a); } }
          const imgQId = getLinkedAssetId(qFields.imageQuestion);
          if (imgQId) { const a = resolveAsset(imgQId, includes); if (a) { sendSSE(res, 'progress', { step: 'asset', message: `  ↳ Image question...` }); imgQuestionUrl = await downloadAndUploadAsset(a); } }
          const imgAId = getLinkedAssetId(qFields.imageAnswer);
          if (imgAId) { const a = resolveAsset(imgAId, includes); if (a) { sendSSE(res, 'progress', { step: 'asset', message: `  ↳ Image réponse...` }); imgAnswerUrl = await downloadAndUploadAsset(a); } }

          const rawDiff = qFields.difficulty;
          let difficulty: string[] = [];
          if (Array.isArray(rawDiff)) difficulty = rawDiff as string[];
          else if (typeof rawDiff === 'string' && rawDiff) difficulty = [rawDiff];

          const { data: newQ, error: qError } = await supabaseAdmin
            .from('questions')
            .insert({
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
            })
            .select()
            .single();

          if (qError) continue;

          await supabaseAdmin.from('quiz_questions').insert({ quiz_id: quiz.id, question_id: newQ.id, position: i });
          importedQuestions++;
        }
      }

      importedQuizzes++;
      sendSSE(res, 'progress', {
        step: 'quiz_done',
        message: `Quiz ${qi + 1}/${quizIds.length} — "${(fields.name as string)}" ✓`,
        current: qi + 1,
        total: quizIds.length,
      });
    }

    sendSSE(res, 'done', { quizzes: importedQuizzes, questions: importedQuestions });
    res.end();
  } catch (err) {
    console.error('Sync contentful quizzes error:', err);
    const message = err instanceof Error ? err.message : 'Erreur serveur';
    sendSSE(res, 'error', { message });
    res.end();
  }
});

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
        published: false,
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
        message: `Quiz "${quiz.name}" créé (draft) ✓`,
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

// ---------------------------------------------------------------------------
// POST /api/import/contentful-games   (SSE streaming — imports categories, consoles, games)
// ---------------------------------------------------------------------------

importRoutes.post('/contentful-games', async (req: Request, res: Response) => {
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
    // Step 1: Fetch all content types
    sendSSE(res, 'progress', { step: 'fetch', message: 'Récupération des catégories de jeux...' });
    const catCollection = await fetchContentfulCollection('gameCategory', '&order=fields.order');
    const catItems = catCollection.items;
    sendSSE(res, 'progress', { step: 'fetch', message: `${catItems.length} catégories trouvées` });

    sendSSE(res, 'progress', { step: 'fetch', message: 'Récupération des consoles...' });
    const consoleCollection = await fetchContentfulCollection('console');
    const consoleItems = consoleCollection.items;
    sendSSE(res, 'progress', { step: 'fetch', message: `${consoleItems.length} consoles trouvées` });

    sendSSE(res, 'progress', { step: 'fetch', message: 'Récupération des jeux...' });
    const gameCollection = await fetchContentfulCollection('game', '&order=fields.order');
    const gameItems = gameCollection.items;
    const allAssets: ContentfulAsset[] = [
      ...(catCollection.includes?.Asset ?? []),
      ...(consoleCollection.includes?.Asset ?? []),
      ...(gameCollection.includes?.Asset ?? []),
    ];
    const assetMap = new Map(allAssets.map((a) => [a.sys.id, a]));

    sendSSE(res, 'progress', {
      step: 'fetched',
      message: `${gameItems.length} jeux, ${allAssets.length} assets`,
    });

    // Step 2: Import categories
    sendSSE(res, 'progress', { step: 'categories', message: 'Import des catégories...' });
    const cfToCatId = new Map<string, string>();
    let categoryCount = 0;

    for (let i = 0; i < catItems.length; i++) {
      const c = catItems[i];
      const cfId = c.sys.id;
      const cf = c.fields;

      const { data: existing } = await supabaseAdmin
        .from('game_categories')
        .select('id')
        .eq('contentful_id', cfId)
        .single();

      if (existing) {
        cfToCatId.set(cfId, existing.id);
        categoryCount++;
        sendSSE(res, 'progress', {
          step: 'category_done',
          message: `Catégorie ${i + 1}/${catItems.length} — déjà importée ✓`,
          current: i + 1,
          total: catItems.length,
        });
        continue;
      }

      const { data: newCat, error: cErr } = await supabaseAdmin
        .from('game_categories')
        .insert({
          name: (cf.name as string) || '',
          display_order: (cf.order as number) ?? 100,
          contentful_id: cfId,
        })
        .select()
        .single();

      if (cErr) {
        sendSSE(res, 'progress', { step: 'category_error', message: `Catégorie erreur : ${cErr.message}` });
        continue;
      }

      cfToCatId.set(cfId, newCat.id);
      categoryCount++;
      sendSSE(res, 'progress', {
        step: 'category_done',
        message: `Catégorie ${i + 1}/${catItems.length} — "${cf.name}" ✓`,
        current: i + 1,
        total: catItems.length,
      });
    }

    // Step 3: Import consoles
    sendSSE(res, 'progress', { step: 'consoles', message: 'Import des consoles...' });
    const cfToConsoleId = new Map<string, string>();
    let consoleCount = 0;
    let assetCount = 0;

    for (let i = 0; i < consoleItems.length; i++) {
      const c = consoleItems[i];
      const cfId = c.sys.id;
      const cf = c.fields;

      const { data: existing } = await supabaseAdmin
        .from('game_consoles')
        .select('id')
        .eq('contentful_id', cfId)
        .single();

      if (existing) {
        cfToConsoleId.set(cfId, existing.id);
        consoleCount++;
        sendSSE(res, 'progress', {
          step: 'console_done',
          message: `Console ${i + 1}/${consoleItems.length} — déjà importée ✓`,
          current: i + 1,
          total: consoleItems.length,
        });
        continue;
      }

      let logoUrl: string | null = null;
      const logoAssetId = getLinkedAssetId(cf.logo);
      if (logoAssetId) {
        const asset = assetMap.get(logoAssetId);
        if (asset) {
          sendSSE(res, 'progress', { step: 'console_asset', message: `↳ Logo : ${asset.fields?.file?.fileName ?? 'image'}` });
          logoUrl = await downloadAndUploadAsset(asset);
          if (logoUrl) assetCount++;
        }
      }

      const { data: newConsole, error: consErr } = await supabaseAdmin
        .from('game_consoles')
        .insert({
          name: (cf.name as string) || '',
          library: (cf.library as string) || '',
          logo_url: logoUrl,
          contentful_id: cfId,
        })
        .select()
        .single();

      if (consErr) {
        sendSSE(res, 'progress', { step: 'console_error', message: `Console erreur : ${consErr.message}` });
        continue;
      }

      cfToConsoleId.set(cfId, newConsole.id);
      consoleCount++;
      sendSSE(res, 'progress', {
        step: 'console_done',
        message: `Console ${i + 1}/${consoleItems.length} — "${cf.name}" ✓`,
        current: i + 1,
        total: consoleItems.length,
      });
    }

    // Step 4: Import games
    sendSSE(res, 'progress', { step: 'games', message: 'Import des jeux...' });
    let gameCount = 0;

    for (let i = 0; i < gameItems.length; i++) {
      const g = gameItems[i];
      const cfId = g.sys.id;
      const gf = g.fields;

      sendSSE(res, 'progress', {
        step: 'game',
        message: `Jeu ${i + 1}/${gameItems.length} : ${(gf.name as string) || cfId}`,
        current: i + 1,
        total: gameItems.length,
      });

      const { data: existing } = await supabaseAdmin
        .from('games')
        .select('id')
        .eq('contentful_id', cfId)
        .single();

      if (existing) {
        gameCount++;
        sendSSE(res, 'progress', {
          step: 'game_done',
          message: `Jeu ${i + 1}/${gameItems.length} — déjà importé ✓`,
          current: i + 1,
          total: gameItems.length,
        });
        continue;
      }

      // Resolve console
      const consoleRef = gf.console as { sys: { id: string } } | undefined;
      const consoleCfId = consoleRef?.sys?.id;
      const consoleDbId = consoleCfId ? cfToConsoleId.get(consoleCfId) : undefined;

      if (!consoleDbId) {
        sendSSE(res, 'progress', {
          step: 'game_error',
          message: `Jeu ${i + 1}/${gameItems.length} — console introuvable, ignoré`,
          current: i + 1,
          total: gameItems.length,
        });
        continue;
      }

      // Download cover
      let coverUrl: string | null = null;
      const coverAssetId = getLinkedAssetId(gf.cover);
      if (coverAssetId) {
        const asset = assetMap.get(coverAssetId);
        if (asset) {
          sendSSE(res, 'progress', { step: 'game_asset', message: `↳ Cover : ${asset.fields?.file?.fileName ?? 'image'}` });
          coverUrl = await downloadAndUploadAsset(asset);
          if (coverUrl) assetCount++;
        }
      }

      // Platform
      const platform = Array.isArray(gf.platform) ? (gf.platform as string[]) : [];

      const { data: newGame, error: gErr } = await supabaseAdmin
        .from('games')
        .insert({
          name: (gf.name as string) || '',
          subtitle: (gf.subtitle as string) || null,
          description: (gf.description as string) || null,
          cover_url: coverUrl,
          file_name: (gf.fileName as string) || `game_${cfId}`,
          console_id: consoleDbId,
          platform,
          competition: (gf.competition as boolean) ?? false,
          competition_link: (gf.competitionLink as string) || null,
          display_order: (gf.order as number) ?? 100,
          contentful_id: cfId,
        })
        .select()
        .single();

      if (gErr) {
        sendSSE(res, 'progress', {
          step: 'game_error',
          message: `Jeu ${i + 1}/${gameItems.length} — erreur : ${gErr.message}`,
          current: i + 1,
          total: gameItems.length,
        });
        continue;
      }

      // Download additional images
      const imageRefs = gf.images as Array<{ sys: { id: string } }> | undefined;
      if (Array.isArray(imageRefs)) {
        const imgRows: Array<{ game_id: string; image_url: string; position: number }> = [];
        for (let j = 0; j < imageRefs.length; j++) {
          const asset = assetMap.get(imageRefs[j].sys.id);
          if (asset) {
            const url = await downloadAndUploadAsset(asset);
            if (url) {
              imgRows.push({ game_id: newGame.id, image_url: url, position: j });
              assetCount++;
            }
          }
        }
        if (imgRows.length > 0) {
          await supabaseAdmin.from('game_images').insert(imgRows);
        }
      }

      // Link categories
      const catRefs = gf.categories as Array<{ sys: { id: string } }> | undefined;
      if (Array.isArray(catRefs)) {
        const links = catRefs
          .map((ref) => {
            const catDbId = cfToCatId.get(ref.sys.id);
            if (!catDbId) return null;
            return { category_id: catDbId, game_id: newGame.id };
          })
          .filter(Boolean);
        if (links.length > 0) {
          await supabaseAdmin.from('game_category_games').insert(links as Array<{ category_id: string; game_id: string }>);
        }
      }

      gameCount++;
      sendSSE(res, 'progress', {
        step: 'game_done',
        message: `Jeu ${i + 1}/${gameItems.length} — "${(gf.name as string).substring(0, 40)}" ✓`,
        current: i + 1,
        total: gameItems.length,
      });
    }

    sendSSE(res, 'done', {
      categories: categoryCount,
      consoles: consoleCount,
      games: gameCount,
      assets: assetCount,
    });

    res.end();
  } catch (err) {
    console.error('Import contentful games error:', err);
    const message = err instanceof Error ? err.message : 'Erreur serveur';
    sendSSE(res, 'error', { message });
    res.end();
  }
});

// ---------------------------------------------------------------------------
// POST /api/import/contentful-media-support   (SSE — projector config, events, TV configs)
// ---------------------------------------------------------------------------

importRoutes.post('/contentful-media-support', async (req: Request, res: Response) => {
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
    let assetCount = 0;

    // Step 1: Import projector config
    sendSSE(res, 'progress', { step: 'fetch', message: 'Récupération de la config projecteur...' });
    const projoCollection = await fetchContentfulCollection('configurationProjo');
    const projoItems = projoCollection.items;
    const projoAssets = projoCollection.includes;
    const projoAssetMap = new Map((projoAssets?.Asset ?? []).map((a) => [a.sys.id, a]));

    let projoCount = 0;
    for (const item of projoItems) {
      const cf = item.fields;
      const cfId = item.sys.id;

      const { data: existing } = await supabaseAdmin
        .from('projector_config')
        .select('id')
        .eq('contentful_id', cfId)
        .single();

      if (existing) {
        sendSSE(res, 'progress', { step: 'projo_done', message: 'Config projecteur déjà importée ✓' });
        projoCount++;
        continue;
      }

      let imageUrl: string | null = null;
      const imgAssetId = getLinkedAssetId(cf.nextEventImage);
      if (imgAssetId) {
        const asset = projoAssetMap.get(imgAssetId);
        if (asset) {
          imageUrl = await downloadAndUploadAsset(asset);
          if (imageUrl) assetCount++;
        }
      }

      await supabaseAdmin.from('projector_config').insert({
        name: (cf.name as string) || 'Config Projo',
        next_event_title: (cf.nextEventTitle as string) || null,
        next_event_subtitle: (cf.nextEventSubtitle as string) || null,
        next_event_description: (cf.nextEventDescription as string) || null,
        next_event_image_url: imageUrl,
        background_video_youtube: (cf.backgroundVideoYoutube as string) || null,
        contentful_id: cfId,
      });

      projoCount++;
      sendSSE(res, 'progress', { step: 'projo_done', message: `Config projecteur "${cf.name}" importée ✓` });
    }

    // Step 2: Import events
    sendSSE(res, 'progress', { step: 'fetch', message: 'Récupération des events...' });
    const eventCollection = await fetchContentfulCollection('event');
    const eventItems = eventCollection.items;
    sendSSE(res, 'progress', { step: 'fetch', message: `${eventItems.length} events trouvés` });

    let eventCount = 0;
    for (let i = 0; i < eventItems.length; i++) {
      const item = eventItems[i];
      const cf = item.fields;
      const cfId = item.sys.id;

      const { data: existing } = await supabaseAdmin
        .from('projector_events')
        .select('id')
        .eq('contentful_id', cfId)
        .single();

      if (existing) {
        eventCount++;
        sendSSE(res, 'progress', {
          step: 'event_done',
          message: `Event ${i + 1}/${eventItems.length} — déjà importé ✓`,
          current: i + 1,
          total: eventItems.length,
        });
        continue;
      }

      const iconArr = cf.icon as string[] | undefined;

      await supabaseAdmin.from('projector_events').insert({
        name: (cf.name as string) || '',
        description: (cf.description as string) || null,
        date: (cf.date as string) || new Date().toISOString(),
        icon: Array.isArray(iconArr) && iconArr.length > 0 ? iconArr[0] : null,
        contentful_id: cfId,
      });

      eventCount++;
      sendSSE(res, 'progress', {
        step: 'event_done',
        message: `Event ${i + 1}/${eventItems.length} — "${cf.name}" ✓`,
        current: i + 1,
        total: eventItems.length,
      });
    }

    // Step 3: Import TV configs
    sendSSE(res, 'progress', { step: 'fetch', message: 'Récupération des configs TV...' });
    const tvCollection = await fetchContentfulCollection('configurationTV');
    const tvItems = tvCollection.items;
    const tvAssets = tvCollection.includes;
    const tvAssetMap = new Map((tvAssets?.Asset ?? []).map((a) => [a.sys.id, a]));

    sendSSE(res, 'progress', { step: 'fetch', message: `${tvItems.length} configs TV trouvées` });

    let tvCount = 0;
    for (let i = 0; i < tvItems.length; i++) {
      const item = tvItems[i];
      const cf = item.fields;
      const cfId = item.sys.id;

      sendSSE(res, 'progress', {
        step: 'tv',
        message: `Config TV ${i + 1}/${tvItems.length} : ${(cf.name as string) || cfId}`,
        current: i + 1,
        total: tvItems.length,
      });

      const { data: existing } = await supabaseAdmin
        .from('tv_configs')
        .select('id')
        .eq('contentful_id', cfId)
        .single();

      if (existing) {
        tvCount++;
        sendSSE(res, 'progress', {
          step: 'tv_done',
          message: `Config TV ${i + 1}/${tvItems.length} — déjà importée ✓`,
          current: i + 1,
          total: tvItems.length,
        });
        continue;
      }

      const youtubeVideos = Array.isArray(cf.youtubeVideos) ? (cf.youtubeVideos as string[]) : [];
      const target = Array.isArray(cf.target) ? (cf.target as string[]) : [];

      const mediaVideoUrls: string[] = [];
      const videoRefs = cf.mediaVideos as Array<{ sys: { id: string } }> | undefined;
      if (Array.isArray(videoRefs)) {
        for (const ref of videoRefs) {
          const asset = tvAssetMap.get(ref.sys.id);
          if (asset) {
            const url = await downloadAndUploadAsset(asset);
            if (url) {
              mediaVideoUrls.push(url);
              assetCount++;
            }
          }
        }
      }

      const mediaImageUrls: string[] = [];
      const imageRefs = cf.mediaImages as Array<{ sys: { id: string } }> | undefined;
      if (Array.isArray(imageRefs)) {
        for (const ref of imageRefs) {
          const asset = tvAssetMap.get(ref.sys.id);
          if (asset) {
            const url = await downloadAndUploadAsset(asset);
            if (url) {
              mediaImageUrls.push(url);
              assetCount++;
            }
          }
        }
      }

      await supabaseAdmin.from('tv_configs').insert({
        name: (cf.name as string) || '',
        youtube_videos: youtubeVideos,
        media_video_urls: mediaVideoUrls,
        media_image_urls: mediaImageUrls,
        target,
        contentful_id: cfId,
      });

      tvCount++;
      sendSSE(res, 'progress', {
        step: 'tv_done',
        message: `Config TV ${i + 1}/${tvItems.length} — "${cf.name}" ✓`,
        current: i + 1,
        total: tvItems.length,
      });
    }

    sendSSE(res, 'done', {
      projectorConfigs: projoCount,
      events: eventCount,
      tvConfigs: tvCount,
      assets: assetCount,
    });

    res.end();
  } catch (err) {
    console.error('Import contentful media-support error:', err);
    const message = err instanceof Error ? err.message : 'Erreur serveur';
    sendSSE(res, 'error', { message });
    res.end();
  }
});

// ---------------------------------------------------------------------------
// POST /api/import/contentful-translations   (SSE — imports translation keys)
// ---------------------------------------------------------------------------

importRoutes.post('/contentful-translations', async (req: Request, res: Response) => {
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
    sendSSE(res, 'progress', { step: 'fetch', message: 'Récupération des traductions FR...' });
    const frUrl = `${CDN_BASE}/entries?access_token=${TOKEN}&content_type=traductions&locale=fr&limit=1`;
    const frRes = await fetch(frUrl);
    if (!frRes.ok) throw new Error(`Contentful FR ${frRes.status}`);
    const frJson = await frRes.json() as { items: Array<{ fields: Record<string, unknown> }> };

    sendSSE(res, 'progress', { step: 'fetch', message: 'Récupération des traductions EN...' });
    const enUrl = `${CDN_BASE}/entries?access_token=${TOKEN}&content_type=traductions&locale=en&limit=1`;
    const enRes = await fetch(enUrl);
    if (!enRes.ok) throw new Error(`Contentful EN ${enRes.status}`);
    const enJson = await enRes.json() as { items: Array<{ fields: Record<string, unknown> }> };

    if (!frJson.items.length) {
      sendSSE(res, 'error', { message: 'Aucune entrée traductions trouvée sur Contentful' });
      res.end();
      return;
    }

    const frFields = frJson.items[0].fields;
    const enFields = enJson.items.length > 0 ? enJson.items[0].fields : {};

    const keys = Object.keys(frFields).filter((k) => k !== 'name');
    sendSSE(res, 'progress', { step: 'fetched', message: `${keys.length} clés de traduction trouvées` });

    let count = 0;
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      const valueFr = (frFields[key] as string) ?? '';
      const valueEn = (enFields[key] as string) ?? '';

      sendSSE(res, 'progress', {
        step: 'translation',
        message: `Clé ${i + 1}/${keys.length} : ${key}`,
        current: i + 1,
        total: keys.length,
      });

      const { data: existing } = await supabaseAdmin
        .from('translations')
        .select('id')
        .eq('key', key)
        .single();

      if (existing) {
        sendSSE(res, 'progress', {
          step: 'translation_done',
          message: `Clé ${i + 1}/${keys.length} — "${key}" déjà importée ✓`,
          current: i + 1,
          total: keys.length,
        });
        count++;
        continue;
      }

      const { error } = await supabaseAdmin.from('translations').insert({
        key,
        value_fr: valueFr,
        value_en: valueEn,
      });

      if (error) {
        sendSSE(res, 'progress', {
          step: 'translation_error',
          message: `Clé "${key}" — erreur : ${error.message}`,
          current: i + 1,
          total: keys.length,
        });
        continue;
      }

      count++;
      sendSSE(res, 'progress', {
        step: 'translation_done',
        message: `Clé ${i + 1}/${keys.length} — "${key}" ✓`,
        current: i + 1,
        total: keys.length,
      });
    }

    sendSSE(res, 'done', { translations: count });
    res.end();
  } catch (err) {
    console.error('Import contentful translations error:', err);
    const message = err instanceof Error ? err.message : 'Erreur serveur';
    sendSSE(res, 'error', { message });
    res.end();
  }
});

// ---------------------------------------------------------------------------
// POST /api/import/contentful-i18n   (SSE — imports EN values for carte & games)
// ---------------------------------------------------------------------------

async function fetchContentfulCollectionLocale(
  contentType: string,
  locale: string,
  extra = '',
): Promise<ContentfulCollectionResponse> {
  const url = `${CDN_BASE}/entries?access_token=${TOKEN}&content_type=${contentType}&limit=500&locale=${locale}${extra}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Contentful API ${res.status}`);
  return res.json() as Promise<ContentfulCollectionResponse>;
}

importRoutes.post('/contentful-i18n', async (req: Request, res: Response) => {
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
    let updatedCount = 0;

    // 1. Menu categories EN
    sendSSE(res, 'progress', { step: 'fetch', message: 'Récupération catégories carte EN...' });
    const catEn = await fetchContentfulCollectionLocale('carteCatgorie', 'en');
    for (let i = 0; i < catEn.items.length; i++) {
      const item = catEn.items[i];
      const nameEn = (item.fields.name as string) || '';
      if (!nameEn) continue;
      const { error } = await supabaseAdmin
        .from('menu_categories')
        .update({ name_en: nameEn })
        .eq('contentful_id', item.sys.id);
      if (!error) updatedCount++;
      sendSSE(res, 'progress', {
        step: 'category_done',
        message: `Cat. carte ${i + 1}/${catEn.items.length} — "${nameEn}" ✓`,
        current: i + 1,
        total: catEn.items.length,
      });
    }

    // 2. Menu products EN
    sendSSE(res, 'progress', { step: 'fetch', message: 'Récupération produits carte EN...' });
    const prodEn = await fetchContentfulCollectionLocale('carteProduit', 'en');
    for (let i = 0; i < prodEn.items.length; i++) {
      const item = prodEn.items[i];
      const f = item.fields;
      const update: Record<string, string> = {};
      if (f.name) update.name_en = f.name as string;
      if (f.subtitle) update.subtitle_en = f.subtitle as string;
      if (f.description) update.description_en = f.description as string;
      if (Object.keys(update).length === 0) continue;
      const { error } = await supabaseAdmin
        .from('menu_products')
        .update(update)
        .eq('contentful_id', item.sys.id);
      if (!error) updatedCount++;
      sendSSE(res, 'progress', {
        step: 'product_done',
        message: `Produit ${i + 1}/${prodEn.items.length} — "${f.name ?? item.sys.id}" ✓`,
        current: i + 1,
        total: prodEn.items.length,
      });
    }

    // 3. Game categories EN
    sendSSE(res, 'progress', { step: 'fetch', message: 'Récupération catégories jeux EN...' });
    const gameCatEn = await fetchContentfulCollectionLocale('gameCategory', 'en');
    for (let i = 0; i < gameCatEn.items.length; i++) {
      const item = gameCatEn.items[i];
      const nameEn = (item.fields.name as string) || '';
      if (!nameEn) continue;
      const { error } = await supabaseAdmin
        .from('game_categories')
        .update({ name_en: nameEn })
        .eq('contentful_id', item.sys.id);
      if (!error) updatedCount++;
      sendSSE(res, 'progress', {
        step: 'game_cat_done',
        message: `Cat. jeux ${i + 1}/${gameCatEn.items.length} — "${nameEn}" ✓`,
        current: i + 1,
        total: gameCatEn.items.length,
      });
    }

    // 4. Games EN
    sendSSE(res, 'progress', { step: 'fetch', message: 'Récupération jeux EN...' });
    const gameEn = await fetchContentfulCollectionLocale('game', 'en');
    for (let i = 0; i < gameEn.items.length; i++) {
      const item = gameEn.items[i];
      const f = item.fields;
      const update: Record<string, string> = {};
      if (f.name) update.name_en = f.name as string;
      if (f.subtitle) update.subtitle_en = f.subtitle as string;
      if (f.description) update.description_en = f.description as string;
      if (Object.keys(update).length === 0) continue;
      const { error } = await supabaseAdmin
        .from('games')
        .update(update)
        .eq('contentful_id', item.sys.id);
      if (!error) updatedCount++;
      sendSSE(res, 'progress', {
        step: 'game_done',
        message: `Jeu ${i + 1}/${gameEn.items.length} — "${f.name ?? item.sys.id}" ✓`,
        current: i + 1,
        total: gameEn.items.length,
      });
    }

    sendSSE(res, 'done', { updated: updatedCount });
    res.end();
  } catch (err) {
    console.error('Import contentful i18n error:', err);
    const message = err instanceof Error ? err.message : 'Erreur serveur';
    sendSSE(res, 'error', { message });
    res.end();
  }
});
