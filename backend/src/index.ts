/**
 * Invader Master backend - Express server
 */

import './config/env.js';
import express from 'express';
import cors from 'cors';
import { authRoutes } from './routes/auth.js';
import { userRoutes } from './routes/users.js';
import { quizRoutes } from './routes/quizzes.js';
import { questionRoutes } from './routes/questions.js';
import { uploadRoutes } from './routes/upload.js';
import { importRoutes } from './routes/import.js';
import { menuCategoryRoutes } from './routes/menuCategories.js';
import { menuProductRoutes } from './routes/menuProducts.js';
import { publicRoutes } from './routes/public.js';

const app = express();
const PORT = process.env.PORT ?? 3001;

const corsOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map((s) => s.trim())
  : ['http://localhost:5173', 'http://127.0.0.1:5173'];

app.use(cors({ origin: corsOrigins, credentials: true }));
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/auth', authRoutes);
app.use('/api', userRoutes);
app.use('/api/quizzes', quizRoutes);
app.use('/api/questions', questionRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/import', importRoutes);
app.use('/api/menu-categories', menuCategoryRoutes);
app.use('/api/menu-products', menuProductRoutes);
app.use('/public', publicRoutes);

app.use((_req, res) => {
  res.status(404).json({ status: 'error', message: 'Not found' });
});

app.listen(PORT, () => {
  console.log(`[invader-backend] Listening on port ${PORT}`);
});
