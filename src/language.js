// ─── Language / Internationalization ──────────────────────────────────────
import { LOCALE } from './config.js';
import { warn } from './logging.js';

let languageData = null;

try {
    const module = await import(`./languages/${LOCALE}.json`, {
        with: { type: 'json' }
    });
    languageData = module.default;
} catch (err) {
    warn(`Language file not found for locale: ${LOCALE}. Falling back to en-US.`);

    const fallback = await import('./languages/en-US.json', {
        with: { type: 'json' }
    });

    languageData = fallback.default;
}

export const i18n = languageData || {};
