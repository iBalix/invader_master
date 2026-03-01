/**
 * Env loader - MUST be the first import in index.ts
 * Loads .env from root (../../.env relative to src/config/) then from backend/.env
 */

import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config();
