import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { randomUUID } from 'crypto';
import { supabaseAdmin } from '../config/supabase.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';

const BUCKET = 'invader-assets';
const MAX_SIZE = 10 * 1024 * 1024; // 10 MB

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_SIZE },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('audio/')) {
      cb(null, true);
    } else {
      cb(new Error('Seuls les fichiers image et audio sont acceptés'));
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

    const ext = path.extname(file.originalname).toLowerCase();
    const folder = file.mimetype.startsWith('image/') ? 'images' : 'audio';
    const storagePath = `${folder}/${randomUUID()}${ext}`;

    const { error: uploadError } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(storagePath, file.buffer, {
        contentType: file.mimetype,
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
    });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ status: 'error', message: "Erreur lors de l'upload" });
  }
});
