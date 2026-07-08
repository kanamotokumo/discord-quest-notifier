// ─── State (Atomic read/write with full quest data) ───────────────────────
import { STATE_FILE, STATE_TMP } from './config.js';
import { warn } from './logging.js';
import fs from 'fs';

export function loadState() {
    try {
        if (fs.existsSync(STATE_FILE)) {
            const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
            if (!state.quests || Array.isArray(state.quests)) state.quests = {};
            return state;
        }
    } catch (err) {
        warn(`Could not read state: ${err.message} — using empty state.`);
    }
    return { quests: {}, last_check: null };
}

export function saveState(state) {
    const data = JSON.stringify(state, null, 2);
    fs.writeFileSync(STATE_TMP, data, 'utf8');
    fs.renameSync(STATE_TMP, STATE_FILE);
}

/**
 * Calculate hash of quest critical fields for change detection
 */
export function hashQuestData(quest) {
    if (!quest) return null;
    
    const config = quest.config || {};
    const critical = {
        expires_at: config.expires_at,
        starts_at: config.starts_at,
        reward_expires: config.rewards_config?.rewards_expire_at,
        task_count: Object.keys(config.task_config_v2?.tasks || {}).length,
        reward_type: config.rewards_config?.rewards?.[0]?.type,
        sku_id: config.rewards_config?.rewards?.[0]?.sku_id,
    };
    
    return Buffer.from(JSON.stringify(critical)).toString('base64');
} 
