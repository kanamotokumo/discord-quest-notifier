// src/discord.js
import { DISCORD_TOKEN } from './config.js';
import { warn, error } from './logging.js';

const DEFAULT_RETRIES = 3;
const RETRY_BASE_MS = 800;

/**
 * Simple sleep helper
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fetch wrapper with retries for transient errors (429, 5xx)
 */
async function fetchWithRetries(url, options = {}, retries = DEFAULT_RETRIES) {
  let attempt = 0;
  while (true) {
    attempt++;
    const res = await fetch(url, options);
    if (res.ok) return res;

    // Retry on rate limit or server errors
    if ((res.status === 429 || (res.status >= 500 && res.status < 600)) && attempt <= retries) {
      const retryAfter = res.headers.get('retry-after');
      const waitMs = retryAfter ? Number(retryAfter) * 1000 : RETRY_BASE_MS * attempt;
      warn(`Discord API ${res.status} — retrying attempt ${attempt}/${retries} after ${waitMs}ms`);
      await sleep(waitMs);
      continue;
    }

    return res;
  }
}

/**
 * Fetch quests for the authorized account
 * Returns an array (possibly empty) of quests
 */
export async function fetchQuests() {
  const url = 'https://discord.com/api/v9/quests/@me';
  const headers = {
    Authorization: DISCORD_TOKEN,
    'Content-Type': 'application/json',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'X-Super-Properties': Buffer.from(JSON.stringify({
      os: 'Windows',
      browser: 'Chrome',
      device: '',
    })).toString('base64'),
  };

  let res;
  try {
    res = await fetchWithRetries(url, { headers });
  } catch (err) {
    error(`Network error while fetching quests: ${err.message}`);
    throw new Error(`Network error while fetching quests: ${err.message}`);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    // Provide helpful error message including status and body
    throw new Error(`Discord API ${res.status}: ${body}`);
  }

  // Parse JSON safely
  let data;
  try {
    data = await res.json();
  } catch (err) {
    error(`Failed to parse Discord response JSON: ${err.message}`);
    throw new Error(`Failed to parse Discord response JSON: ${err.message}`);
  }

  // Ensure we always return an array
  if (!data || !Array.isArray(data.quests) && !Array.isArray(data)) {
    // Some responses may return object with quests property, others may return array directly
    if (Array.isArray(data?.quests)) return data.quests;
    // If shape unexpected, return empty array but warn
    warn('Discord response did not contain expected quests array; returning empty list.');
    return [];
  }

  // Normalize: if API returned { quests: [...] } return that, else if returned array return it
  return Array.isArray(data.quests) ? data.quests : (Array.isArray(data) ? data : []);
}
