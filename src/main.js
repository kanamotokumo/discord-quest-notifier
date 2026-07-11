// src/main.js
// ─── Main ─────────────────────────────────────────────────────────────────
import {
    fetchQuests,
    buildNewQuestEmbed,
    buildUpdatedQuestEmbed,
    i18n,
    log,
    warn,
    error,
    info,
    loadState,
    saveState,
    hashQuestData,
    sendWebhook,
    sendErrorNotice,
    detectQuestChanges
} from './module.js';
import { DISCORD_TOKEN, MAIN_WEBHOOK, PING_ROLE_ID, REPOSITORY, ERROR_WEBHOOK, GITHUB_TOKEN } from './config.js';

// Validate config
if (!DISCORD_TOKEN || !MAIN_WEBHOOK || !GITHUB_TOKEN || !REPOSITORY) {
    console.error('❌ Missing required environment variables: DISCORD_TOKEN, MAIN_WEBHOOK, GITHUB_TOKEN, REPOSITORY');
    process.exit(1);
}

/**
 * Fetch image assets from GitHub (returns raw URL with cache-busting uuid)
 */
const getAttachments = async (path) => {
    try {
        const base = `https://raw.githubusercontent.com/${REPOSITORY}/refs/heads/main/assets/${path}`;
        const url = new URL(base);
        url.searchParams.append('uuid', crypto.randomUUID());
        return url.href;
    } catch (err) {
        error(`Failed to build asset URL for ${path}: ${err.message}`);
        return null;
    }
};

/**
 * Normalize state entry so it always has .config (some older state entries may store raw config differently)
 */
function normalizeStateEntry(entry) {
    if (!entry) return null;
    // If entry.config exists, assume it's already normalized
    if (entry.config) return entry;
    // If entry looks like a raw config (has id, config_version...), wrap it
    if (entry.id && entry.starts_at && entry.expires_at && entry.hash) {
        return {
            id: entry.id,
            config: entry, // treat the entry itself as config
            ...entry
        };
    }
    return entry;
}

/**
 * Main tracker function
 */
async function main() {
    log('Starting quest tracker...');
    const state = loadState();
    if (!state.quests) state.quests = {};

    let quests;
    try {
        quests = await fetchQuests();
    } catch (err) {
        error(`Fetch failed: ${err.message}`);
        await sendErrorNotice(err.message);
        process.exit(1);
    }

    if (!Array.isArray(quests)) {
        error('fetchQuests did not return an array.');
        process.exit(1);
    }

    log(`Found ${quests.length} active quest(s).`);

    const now = new Date();

    // Prepare lists
    const newQuests = [];
    const updatedQuests = [];

    for (const quest of quests) {
        try {
            const hasConfig = quest?.config && quest.config.expires_at;
            const isNotExpired = hasConfig ? new Date(quest.config.expires_at) > now : false;
            if (!isNotExpired) continue; // skip expired

            const inStateRaw = state.quests[quest.id];
            const inState = normalizeStateEntry(inStateRaw);

            if (!inState) {
                // NEW quest
                newQuests.push(quest);
                continue;
            }

            // Compute hash and detect changes
            const newHash = hashQuestData(quest);
            const oldHash = inState.hash || '';

            // Use detectQuestChanges for fine-grained detection
            const changes = detectQuestChanges(inState, quest);
            const hasFlagChanges = Object.values(changes).some(v => v === true);

            // If hash changed OR detectQuestChanges found something -> updated
            if (newHash !== oldHash || hasFlagChanges) {
                updatedQuests.push({ quest, changes, oldQuest: inState });
            }
        } catch (err) {
            warn(`Error processing quest ${quest?.id}: ${err?.message}`);
            // continue processing other quests
        }
    }

    // Sort new quests by start time (ascending)
    newQuests.sort((a, b) => {
        const timeA = new Date(a.config?.starts_at || 0).getTime();
        const timeB = new Date(b.config?.starts_at || 0).getTime();
        return timeA - timeB;
    });

    // Summary logs
    if (newQuests.length > 0) log(`Found ${newQuests.length} new quest(s).`);
    if (updatedQuests.length > 0) log(`Found ${updatedQuests.length} updated quest(s).`);
    if (newQuests.length === 0 && updatedQuests.length === 0) log('No new or updated quests.');

    // If nothing to send, still update last_check and exit gracefully
    if (newQuests.length === 0 && updatedQuests.length === 0) {
        state.last_check = new Date().toISOString();
        saveState(state);
        log('✨ Tracker completed successfully (no changes).');
        return;
    }

    // Fetch assets once
    log('Fetching assets from GitHub...');
    let avatarWebhook = await getAttachments('avatar.png');
    if (!avatarWebhook) avatarWebhook = await getAttachments('discord.webp');

    const rewardIconUrl = 'https://cdn.discordapp.com/assets/content/fb761d9c206f93cd8c4e7301798abe3f623039a4054f2e7accd019e1bb059fc8.webm';
    const emptyIconUrl = await getAttachments('empty.png');
    const discordQuests = await getAttachments('discordQuests.png');
    const globalAssets = { avatarWebhook, rewardIconUrl, emptyIconUrl, discordQuests };

    // Send new quests
    if (newQuests.length > 0) {
        log(`Sending ${newQuests.length} new quest notification(s)...`);
        for (const quest of newQuests) {
            try {
                const content = PING_ROLE_ID ? `<@&${PING_ROLE_ID}>` : '';
                const embedPayload = await buildNewQuestEmbed(content, quest, globalAssets);
                await sendWebhook(MAIN_WEBHOOK, embedPayload, true);

                const expiresAt = quest.config?.rewards_config?.rewards_expire_at || quest.config?.expires_at || new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString();
                state.quests[quest.id] = {
                    id: quest.id,
                    config: quest.config,
                    hash: hashQuestData(quest),
                    starts_at: quest.config?.starts_at,
                    expires_at: expiresAt,
                    sent_at: new Date().toISOString(),
                    type: 'new'
                };

                log(`✅ Sent new quest: ${quest.id}`);
                await new Promise(r => setTimeout(r, 1100));
            } catch (err) {
                error(`Failed to send new quest ${quest.id}: ${err.message}`);
                await sendErrorNotice(`New Quest ${quest.id}: ${err.message}`);
            }
        }
    }

    // Send updated quests
    if (updatedQuests.length > 0) {
        log(`Sending ${updatedQuests.length} updated quest notification(s)...`);
        for (const { quest, changes, oldQuest } of updatedQuests) {
            try {
                // Ensure oldQuest normalized (has config)
                const normalizedOld = normalizeStateEntry(oldQuest) || { id: quest.id, config: oldQuest.config || {} };

                const content = PING_ROLE_ID ? `<@&${PING_ROLE_ID}>` : '';
                // buildUpdatedQuestEmbed signature: (content, oldQuest, newQuest, assets, changes)
                const embedPayload = await buildUpdatedQuestEmbed(content, normalizedOld, quest, globalAssets, changes);
                await sendWebhook(MAIN_WEBHOOK, embedPayload, true);

                // Update state entry
                state.quests[quest.id] = {
                    ...state.quests[quest.id],
                    id: quest.id,
                    config: quest.config,
                    hash: hashQuestData(quest),
                    expires_at: quest.config?.expires_at,
                    updated_at: new Date().toISOString(),
                    type: 'updated'
                };

                log(`✅ Sent updated quest: ${quest.id}`);
                await new Promise(r => setTimeout(r, 1100));
            } catch (err) {
                error(`Failed to send updated quest ${quest.id}: ${err.message}`);
                await sendErrorNotice(`Updated Quest ${quest.id}: ${err.message}`);
            }
        }
    }

    // Persist state after sending
    saveState(state);

    // Cleanup expired quests from state
    log('Cleaning up expired quests...');
    let deletedCount = 0;
    for (const questId of Object.keys(state.quests)) {
        try {
            const questData = state.quests[questId];
            const expireTime = new Date(questData.expires_at);
            if (expireTime < now) {
                delete state.quests[questId];
                deletedCount++;
            }
        } catch (err) {
            warn(`Failed to evaluate expiry for ${questId}: ${err.message}`);
        }
    }

    if (deletedCount > 0) {
        log(`♻️ Cleaned up ${deletedCount} expired quest(s) from state.`);
        saveState(state);
    } else {
        log('🛑 No expired quests to clean up.');
    }

    state.last_check = new Date().toISOString();
    saveState(state);
    log('✨ Tracker completed successfully!');
}

// Run main
main().catch(async err => {
    error(err.message);
    await sendErrorNotice(err.stack ?? err.message);
    process.exit(1);
});
