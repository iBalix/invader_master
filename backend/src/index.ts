/**
 * Invader Master backend - Express server
 */

import './config/env.js';
import { createServer } from 'http';
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
import { gameCategoryRoutes } from './routes/gameCategories.js';
import { gameConsoleRoutes } from './routes/gameConsoles.js';
import { gameRoutes } from './routes/gameRoutes.js';
import { projectorConfigRoutes } from './routes/projectorConfig.js';
import { eventsRoutes } from './routes/events.js';
import { tvConfigRoutes } from './routes/tvConfigs.js';
import { translationRoutes } from './routes/translations.js';
import { financeImportRoutes } from './routes/financeImport.js';
import { battleQuestionRoutes } from './routes/battleQuestions.js';
import { publicRoutes } from './routes/public.js';
import { tablesRoutes } from './routes/tables.js';
import { liveEventStateAuthRoutes, liveEventStatePublicRoutes } from './routes/liveEventState.js';
import { tableDevicesRoutes } from './routes/tableDevices.js';
import { tableScreensaverFeaturedRoutes } from './routes/tableScreensaverFeatured.js';
import { tableHomeFeaturedRoutes } from './routes/tableHomeFeatured.js';
import { couponsRoutes } from './routes/coupons.js';
import { tableOrdersRoutes } from './routes/tableOrders.js';
import { barRoutes } from './routes/bar.js';
import { cashRoutes } from './routes/cash.js';
import { rolePermissionRoutes } from './routes/rolePermissions.js';
import { initAgentBridge } from './websocket/agent-bridge.js';

const app = express();
const PORT = process.env.PORT ?? 3001;

const defaultCorsOrigins = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175',
  'http://127.0.0.1:5173',
  'https://invadermaster-frontend-production.up.railway.app',
  // invader_admin (PHP) - dev local + MAMP
  'http://localhost',
  'http://localhost:80',
  'http://localhost:8888',
];

const corsOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map((s) => s.trim())
  : defaultCorsOrigins;

app.use(express.json());

app.use('/public', cors(), publicRoutes);
app.use('/public/tables', cors(), tablesRoutes);
app.use('/public/live-event', cors(), liveEventStatePublicRoutes);

app.get('/health', cors(), (_req, res) => {
  res.json({ status: 'ok' });
});

app.use(cors({ origin: corsOrigins, credentials: true }));

app.use('/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/quizzes', quizRoutes);
app.use('/api/questions', questionRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/import', importRoutes);
app.use('/api/menu-categories', menuCategoryRoutes);
app.use('/api/menu-products', menuProductRoutes);
app.use('/api/game-categories', gameCategoryRoutes);
app.use('/api/game-consoles', gameConsoleRoutes);
app.use('/api/games', gameRoutes);
app.use('/api/projector-config', projectorConfigRoutes);
app.use('/api/projector-config/events', eventsRoutes); // alias retro-compat (projo.php legacy)
app.use('/api/events', eventsRoutes);
app.use('/api/live-event', liveEventStateAuthRoutes);
app.use('/api/tv-configs', tvConfigRoutes);
app.use('/api/translations', translationRoutes);
app.use('/api/finance-import', financeImportRoutes);
app.use('/api/battle-questions', battleQuestionRoutes);
app.use('/api/bar', barRoutes);
app.use('/api/cash', cashRoutes);
app.use('/api/role-permissions', rolePermissionRoutes);
app.use('/api/table-devices', tableDevicesRoutes);
app.use('/api/table-screensaver-featured', tableScreensaverFeaturedRoutes);
app.use('/api/table-home-featured', tableHomeFeaturedRoutes);
app.use('/api/coupons', couponsRoutes);
app.use('/api/table-orders', tableOrdersRoutes);

app.use((_req, res) => {
  res.status(404).json({ status: 'error', message: 'Not found' });
});

const server = createServer(app);
initAgentBridge(server);

server.listen(PORT, () => {
  console.log(`[invader-backend] Listening on port ${PORT}`);
});
