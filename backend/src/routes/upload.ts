import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { randomUUID } from 'crypto';
import { supabaseAdmin } from '../config/supabase.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import { formatBytes, ImageTooLargeError, optimizeImage } from '../lib/imageOptimizer.js';

const BUCKET = 'invader-assets';
// Limite globale a 50 MB pour permettre les videos courtes (mp4/webm).
// Les images et audio restent largement sous cette limite.
const MAX_SIZE = 50 * 1024 * 1024; // 50 MB

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_SIZE },
  fileFilter: (_req, file, cb) => {
    if (
      file.mimetype.startsWith('image/') ||
      file.mimetype.startsWith('audio/') ||
      file.mimetype.startsWith('video/')
    ) {
      cb(null, true);
    } else {
      cb(new Error('Seuls les fichiers image, audio et video sont acceptés'));
    }
  },
});

export const uploadRoutes = Router();

uploadRoutes.use(authMiddleware, requireRole('admin', 'salarie', 'externe'));

uploadRoutes.post('/', upload.single('file'), async (req, res) => {
  try {
    const file = req.file;
    if (!file) {
      res.status(400).json({ status: 'error', message: 'Aucun fichier fourni' });
      return;
    }

    const originalExt = path.extname(file.originalname).toLowerCase();
    const folder = file.mimetype.startsWith('image/')
      ? 'images'
      : file.mimetype.startsWith('video/')
        ? 'videos'
        : 'audio';

    // Compression des images. L'extension et le type suivent le format retenu :
    // une photo PNG ressort en .jpg, un logo transparent reste en .png.
    let optimized;
    try {
      optimized = await optimizeImage(file.buffer, file.mimetype, originalExt);
    } catch (err) {
      if (err instanceof ImageTooLargeError) {
        res.status(413).json({ status: 'error', message: err.message });
        return;
      }
      throw err;
    }

    if (optimized.changed) {
      const saved = Math.round((1 - optimized.buffer.length / file.buffer.length) * 100);
      console.log(
        `[upload] ${file.originalname} : ${formatBytes(file.buffer.length)} -> ` +
          `${formatBytes(optimized.buffer.length)} (-${saved}%, ${optimized.contentType})`,
      );
    }

    const storagePath = `${folder}/${randomUUID()}${optimized.ext}`;

    const { error: uploadError } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(storagePath, optimized.buffer, {
        contentType: optimized.contentType,
        upsert: false,
      });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      res.status(500).json({ status: 'error', message: "Erreur lors de l'upload" });
      return;
    }

    const { data: urlData } = supabaseAdmin.storage
      .from(BUCKET)
      .getPublicUrl(storagePath);

    res.json({
      status: 'success',
      url: urlData.publicUrl,
      path: storagePath,
      // Exposés pour que le back-office puisse dire ce qui a été gagné.
      originalBytes: file.buffer.length,
      bytes: optimized.buffer.length,
    });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ status: 'error', message: "Erreur lors de l'upload" });
  }
});
