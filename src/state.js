// src/state.js
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
 * Discord Quest "features" bitfield — confirmed against a real quests.json
 * dump that `config.features` is a number[] (e.g. [3, 9, 13, 14, 15, 16, 18,
 * 19, 23]), not strings. This table decodes those IDs into readable names.
 */
export const QUEST_FEATURES = {
    0: 'GIFT_INVENTORY_SETTINGS_BADGE',
    1: 'QUEST_BAR',
    2: 'QUEST_INVENTORY_CARD',
    3: 'QUESTS_EMBED',
    4: 'ACTIVITY_PANEL',
    5: 'QUEST_LIVE_STREAM',
    6: 'MEMBERS_LIST',
    7: 'CONTENT_ACCESSIBILITY',
    8: 'DESKTOP_VIEW',
    9: 'CONSOLE_LINKING',
    10: 'AGE_GATE',
    11: 'REWARD_CODE_VALIDATION',
    12: 'FRACTIONAL_PREMIUM',
    13: 'IMPLICIT_COMPLETION',
    14: 'SHOW_IN_QUEST_HOME',
    15: 'PROGRESS_BAR_TEXT',
    16: 'QUIET_NOTIFICATIONS',
    17: 'EXPERIMENT_ELIGIBLE',
    18: 'REWARD_CODE_EXPIRATION',
    19: 'MOBILE_VIEW',
    20: 'EMBEDDED_APPLICATION',
    21: 'VIDEO_QUEST',
    22: 'COSPONSOR_DISPLAY',
    23: 'ORBS_REWARD',
};

/** Decode a quest's raw numeric `features` array into readable flag names. */
export function decodeFeatures(featureIds) {
    if (!Array.isArray(featureIds)) return [];
    return featureIds.map(id => QUEST_FEATURES[id] || `UNKNOWN_${id}`);
}

/**
 * Calculate a hash covering every quest field that can visibly change.
 * Field paths here are verified against a real quests.json dump rather than
 * guessed. Notable corrections vs the previous version:
 *   - `features` is a number[] (bitfield IDs) — hashed as sorted raw numbers
 *     (decoding is a display concern, handled by decodeFeatures() above).
 *   - Platform info does NOT live at a top-level `config.platforms` (that
 *     field doesn't exist in real data) — the only real platform signal is
 *     `rewards_config.platforms` (also number[]).
 *   - `colors.primary` / `colors.secondary` exist per-quest and are worth
 *     tracking since they affect embed branding.
 *   - individual rewards can carry `orb_quantity` (orb rewards) or their own
 *     `expires_at` (collectible rewards) — both now included per reward,
 *     not just sku/type/name.
 */
export function hashQuestData(quest) {
    if (!quest) return null;

    const config = quest.config || {};
    const tasks = config.task_config_v2?.tasks || {};
    const rewards = config.rewards_config?.rewards || [];
    const rewardPlatforms = config.rewards_config?.platforms || [];

    const critical = {
        // Naming / identity
        quest_name: config.messages?.quest_name,
        game_title: config.messages?.game_title,
        game_publisher: config.messages?.game_publisher,
        application_id: config.application?.id,
        application_name: config.application?.name,

        // Timing
        starts_at: config.starts_at,
        expires_at: config.expires_at,
        reward_expires_at: config.rewards_config?.rewards_expire_at,

        // Branding
        color_primary: config.colors?.primary,
        color_secondary: config.colors?.secondary,

        // Feature flags & platforms — both number[] in the real API, sorted
        // so re-ordering alone isn't reported as a "change"
        features: Array.isArray(config.features) ? [...config.features].sort((a, b) => a - b) : null,
        reward_platforms: Array.isArray(rewardPlatforms) ? [...rewardPlatforms].sort((a, b) => a - b) : null,

        // Every task's type + target, not just how many there are
        tasks: Object.keys(tasks)
            .sort()
            .map(key => ({
                key,
                type: tasks[key]?.type,
                target: tasks[key]?.target,
            })),

        // Every reward's sku/type/name/orb-amount/own-expiry, not just the
        // first reward's type + sku
        rewards: rewards.map(r => ({
            sku_id: r?.sku_id,
            type: r?.type,
            name: r?.messages?.name,
            orb_quantity: r?.orb_quantity ?? null,
            expires_at: r?.expires_at ?? null,
        })),

        // Every asset path — a swapped hero image/video/reward icon counts too
        assets: {
            hero: config.assets?.hero,
            hero_video: config.assets?.hero_video,
            quest_bar_hero: config.assets?.quest_bar_hero,
            quest_bar_hero_video: config.assets?.quest_bar_hero_video,
            game_tile: config.assets?.game_tile,
            game_tile_light: config.assets?.game_tile_light,
            game_tile_dark: config.assets?.game_tile_dark,
            logotype: config.assets?.logotype,
            logotype_light: config.assets?.logotype_light,
            logotype_dark: config.assets?.logotype_dark,
        },
    };

    return Buffer.from(JSON.stringify(critical)).toString('base64');
}
