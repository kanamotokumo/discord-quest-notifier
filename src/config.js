// ─── Configuration ────────────────────────────────────────────────────────
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const TOKEN = process.env.DISCORD_TOKEN || '';
export const WEBHOOK = process.env.MAIN_WEBHOOK || '';
export const ERR_WEBHOOK = process.env.ERROR_WEBHOOK || '';
export const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
export const REPOSITORY = process.env.REPOSITORY || '';
export const PING_ROLE = process.env.PING_ROLE_ID || '';
export const LOCALE = process.env.LOCALE || 'en-US';

export const STATE_FILE = path.join(__dirname, '..', 'state.json');
export const STATE_TMP = path.join(__dirname, '..', 'state.tmp.json');

// Validation
const required = ['TOKEN', 'WEBHOOK', 'GITHUB_TOKEN', 'REPOSITORY'];
const missing = required.filter(key => !process.env[key]);
if (missing.length > 0) {
    console.error(`❌ Missing required environment variables: ${missing.join(', ')}`);
    process.exit(1);
}
 
