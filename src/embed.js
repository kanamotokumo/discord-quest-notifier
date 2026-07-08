// ─── Embed Builder ────────────────────────────────────────────────────────
import { i18n } from './language.js';
import { formatDate, formatDateTime, getReward, buildChangeDescription } from './utils.js';

/**
 * Build embed for NEW quest
 */
export async function buildNewQuestEmbed(content, quest, assets) {
    const config = quest.config;
    if (!config) return null;

    const embed = [];
    const subComponents = [];
    
    if (content) subComponents.push({ type: 10, content });

    const durationStr = `${formatDate(config.starts_at)} - ${formatDate(config.expires_at)}`;
    let videoUrl;
    
    const taskList = Object.values(config.task_config_v2?.tasks || {})
        .map(task => {
            const minutes = task.target ? task.target / 60 : 0;
            const taskName = task.type
                .toLowerCase()
                .replace(/_/g, ' ')
                .replace(/^\w/, c => c.toUpperCase());

            try {
                for (const type of ['video', 'video_low_res', 'video_hls']) {
                    videoUrl = task.assets[type].url;
                    if (videoUrl) break;
                }
            } catch { }

            return `* ${taskName} (${minutes} minutes)`;
        })
        .join('\n');

    const task_condition = config.task_config_v2?.join_operator || "or";

    const primaryReward = config.rewards_config?.rewards?.[0];
    const rewardName = primaryReward?.messages?.name || i18n.error.reward;
    const skuId = primaryReward?.sku_id || '';
    const rewards = getReward(primaryReward, rewardName);
    const rewardType = rewards?.rewardType;
    const extraReward = rewards?.extraReward;
    const decorExpires = rewards?.expires;

    const questName = config.messages?.quest_name || i18n.error.new_quest;
    const gameTitle = config.messages?.game_title || i18n.error.game_name;
    const gamePublisher = config.messages?.game_publisher || i18n.error.game_publisher;

    const questId = quest.id || '';
    const questLink = `https://canary.discord.com/quests/${questId}`;

    const applicationLink = config.application?.link || questLink || 'https://discord.com';
    const applicationName = config.application?.name || '';
    const applicationId = config.application?.id || '';

    const CDN_BASE = 'https://cdn.discordapp.com/';
    const heroUrl = config.assets?.hero ? `${CDN_BASE}${config.assets.hero}` : assets.discordQuests;
    
    let currentRewardIconUrl = assets.rewardIconUrl;
    if (!rewardName.toLowerCase().includes('orb')) {
        currentRewardIconUrl = primaryReward?.asset ? (CDN_BASE + primaryReward.asset) : assets.emptyIconUrl;
    }
    
    const currentRewardIcon = new URL(currentRewardIconUrl);
    currentRewardIcon.searchParams.append('format', 'webp');

    subComponents.push(
        {
            type: 10,
            content: `# ${i18n.new_quest} - [${questName}](${questLink})`
        },
        {
            type: 12,
            items: [{
                media: { url: heroUrl },
                description: questName
            }]
        },
        {
            type: 14,
            divider: true,
            spacing: 1
        },
        {
            type: 10,
            content: `## ${i18n.quest_info}`
        },
        {
            type: 10,
            content: `**${i18n.duration}:** ${durationStr}\n**${i18n.game}:** ${gameTitle} (${gamePublisher})\n**${i18n.application}:** [${applicationName}](${applicationLink}) (\`${applicationId}\`)`
        },
        {
            type: 14,
            divider: true,
            spacing: 1
        },
        {
            type: 10,
            content: `## ${i18n.tasks}`
        },
        {
            type: 10,
            content: `${i18n.task_condition[task_condition]}\n${taskList}`
        },
        {
            type: 14,
            divider: true,
            spacing: 1
        },
        {
            type: 9,
            components: [
                {
                    type: 10,
                    content: `## ${i18n.rewards_title}`
                },
                {
                    type: 10,
                    content: `**${i18n.reward_type}:** ${rewardType}${decorExpires}\n**${i18n.sku_id}:** \`${skuId}\`\n**${i18n.reward_name.normal}:** ${rewardName}${extraReward}\n**${i18n.reward_expires}:** ${formatDate(config.rewards_config?.rewards_expire_at)}`
                }
            ],
            accessory: {
                type: 11,
                media: { url: currentRewardIcon.href }
            }
        }
    );

    if (videoUrl) {
        subComponents.push(
            {
                type: 14,
                divider: true,
                spacing: 1
            },
            {
                type: 12,
                items: [{
                    media: { url: videoUrl },
                    description: applicationName
                }]
            }
        );
    }

    subComponents.push(
        {
            type: 14,
            divider: true,
            spacing: 1
        },
        {
            type: 10,
            content: `${i18n.quest_id}: \`${questId}\``
        }
    );

    embed.push({
        type: 17,
        components: subComponents
    });

    return {
        flags: 1 << 15,
        username: i18n.name,
        components: embed,
        avatar_url: assets.avatarWebhook
    };
}

/**
 * Build embed for UPDATED quest
 */
export async function buildUpdatedQuestEmbed(content, oldQuest, newQuest, assets, changes) {
    const config = newQuest.config;
    if (!config) return null;

    const embed = [];
    const subComponents = [];

    if (content) subComponents.push({ type: 10, content });

    const questName = config.messages?.quest_name || i18n.error.new_quest;
    const questId = newQuest.id || '';
    const questLink = `https://canary.discord.com/quests/${questId}`;

    const changeDescription = buildChangeDescription(oldQuest, newQuest, changes);

    const CDN_BASE = 'https://cdn.discordapp.com/';
    const heroUrl = config.assets?.hero ? `${CDN_BASE}${config.assets.hero}` : assets.discordQuests;

    subComponents.push(
        {
            type: 10,
            content: `# ${i18n.updated_quest} - [${questName}](${questLink})`
        },
        {
            type: 12,
            items: [{
                media: { url: heroUrl },
                description: questName
            }]
        },
        {
            type: 14,
            divider: true,
            spacing: 1
        },
        {
            type: 10,
            content: `## ${i18n.changes_detected}`
        },
        {
            type: 10,
            content: changeDescription
        },
        {
            type: 14,
            divider: true,
            spacing: 1
        },
        {
            type: 10,
            content: `${i18n.quest_id}: \`${questId}\``
        }
    );

    embed.push({
        type: 17,
        components: subComponents
    });

    return {
        flags: 1 << 15,
        username: i18n.name,
        components: embed,
        avatar_url: assets.avatarWebhook
    };
  } 
