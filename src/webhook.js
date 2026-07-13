// src/webhook.js
import fetch from 'node-fetch';
import FormData from 'form-data';
import { error, log } from './logging.js';

const DEFAULT_MAX_BYTES = Number(process.env.MAX_ATTACHMENT_BYTES) || 16 * 1024 * 1024; // 16MB
const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

/**
 * Fetch a remote asset as a Buffer.
 * - Sends a browser-like User-Agent/Accept (Discord's CDN increasingly 403s
 *   plain, header-less requests from automated/cloud origins).
 * - Retries a couple of times on 403/429 before giving up, since this has
 *   been observed to be intermittent rather than consistent.
 * - Uses `.arrayBuffer()` instead of the deprecated `.buffer()`.
 */
async function fetchBufferFromUrl(url, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(url, {
      headers: {
        'User-Agent': BROWSER_USER_AGENT,
        Accept: 'image/*,video/*;q=0.9,*/*;q=0.8',
      },
    });

    if (res.ok) {
      const buffer = Buffer.from(await res.arrayBuffer());
      const length = Number(res.headers.get('content-length')) || buffer.length;
      return { buffer, length };
    }

    if ((res.status === 403 || res.status === 429) && attempt < retries) {
      const waitMs = 500 * (attempt + 1);
      await new Promise(resolve => setTimeout(resolve, waitMs));
      continue;
    }

    throw new Error(`Failed to fetch asset ${url}: ${res.status}`);
  }
}

/**
 * Build the final webhook URL, appending query params Discord requires:
 * - `wait=true` (unchanged previous behavior)
 * - `with_components=true` — REQUIRED whenever the payload includes a
 *   `components` array sent through a webhook, or Discord silently ignores
 *   them (this applies to both V1 action-row buttons and V2 containers).
 */
function buildWebhookUrl(webhookUrl, payload) {
  const url = new URL(webhookUrl);
  if (payload?.wait) url.searchParams.append('wait', 'true');
  if (Array.isArray(payload?.components) && payload.components.length > 0) {
    url.searchParams.append('with_components', 'true');
  }
  return url;
}

/**
 * Send webhook payload with optional attachments.
 * - webhookUrl: string
 * - payload: object (payload_json)
 * - attachments: [{ url, filename, contentType? }]
 *
 * Returns true on success, false on failure.
 *
 * Note: with the current embed.js, `attachments` is always [] (images are
 * linked directly via their Discord CDN URL instead of being downloaded and
 * re-uploaded), so the multipart branch below is effectively dormant right
 * now. It's kept — with the fixes above — in case something else in the
 * codebase ever calls sendWebhook() with real attachments again.
 */
export async function sendWebhook(webhookUrl, payload, attachments = []) {
  if (!webhookUrl) {
    error('Webhook URL is empty');
    return false;
  }

  try {
    // If no attachments, send JSON as before
    if (!attachments || attachments.length === 0) {
      const url = buildWebhookUrl(webhookUrl, payload);

      const res = await fetch(url.toString(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': BROWSER_USER_AGENT,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`Webhook error ${res.status}: ${body}`);
      }
      return true;
    }

    // Build multipart form-data
    const form = new FormData();
    form.append('payload_json', JSON.stringify(payload));

    // Fetch and append attachments as files[i]
    let fileIndex = 0;
    for (let i = 0; i < attachments.length; i++) {
      const att = attachments[i];
      if (!att || !att.url) continue;
      try {
        const { buffer, length } = await fetchBufferFromUrl(att.url);
        if (length > DEFAULT_MAX_BYTES) {
          log(`Attachment ${att.filename || att.url} too large (${length} bytes), skipping attachment.`);
          continue;
        }
        const name = att.filename || `file_${fileIndex}`;
        form.append(`files[${fileIndex}]`, buffer, {
          filename: name,
          contentType: att.contentType || 'application/octet-stream',
        });
        fileIndex++;
      } catch (err) {
        error(`Failed to fetch attachment ${att.url}: ${err.message}`);
        // continue without failing entire request
      }
    }

    const url = buildWebhookUrl(webhookUrl, payload);

    const res = await fetch(url.toString(), {
      method: 'POST',
      body: form,
      headers: form.getHeaders(),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Webhook error ${res.status}: ${body}`);
    }

    return true;
  } catch (err) {
    error(`Failed to send webhook: ${err.message}`);
    return false;
  }
}

/**
 * Send error notice to ERROR_WEBHOOK (keeps previous behavior)
 */
export async function sendErrorNotice(message) {
  const { ERROR_WEBHOOK } = await import('./config.js');
  if (!ERROR_WEBHOOK) return;

  const payload = {
    username: 'Uh Oh :(((',
    content: `\`\`\`\n${message}\n\`\`\``,
  };

  await sendWebhook(ERROR_WEBHOOK, payload, []);
    }
