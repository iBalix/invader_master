import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config();

export const WS_URL = process.env.INVADER_MASTER_WS_URL;
export const AGENT_TOKEN = process.env.BAR_AGENT_TOKEN;
export const SCRIPTS_DIR = path.resolve(__dirname, '../scripts');

if (!WS_URL || !AGENT_TOKEN) {
  throw new Error('Missing env: INVADER_MASTER_WS_URL and BAR_AGENT_TOKEN are required');
}
