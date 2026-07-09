// ─── Embed Builder ────────────────────────────────────────────────────────
import { i18n } from './language.js';
import { formatDate, getReward, buildChangeDescription } from './utils.js';

const PING_ROLE_ID = process.env.PING_ROLE_ID;

/**
 * Build embed for NEW quest
 */
export async function buildNewQuestEmbed(content, quest, assets) {
    const config = quest.config;
    if (!config) return null;

    const questId = quest.id || '';
    const questLink = `https://canary.discord.com/quests/${questId}`;

    // Ping role hoặc fallback text
    let baseContent = content || `Nhiệm vụ mới: [${config.messages?.quest_name || i18n.error.new_quest}](${questLink})`;
    if (PING_ROLE_ID) {
        baseContent = `<@&${PING_ROLE_ID}> Nhiệm Vụ mới đã đến !!! [Click vào đây để làm nhiệm vụ](${questLink})`;
    }

    const durationStr = `${formatDate(config.starts_at)} - ${formatDate(config.expires_at)}`;

    const primaryReward = config.rewards_config?.rewards?.[0];
    const rewardName = primaryReward?.messages?.name || i18n.error.reward;
    const skuId = primaryReward?.sku_id || '';
    const rewards = getReward(primaryReward, rewardName);

    const questName = config.messages?.quest_name || i18n.error.new_quest;
    const gameTitle = config.messages?.game_title || i18n.error.game_name;
    const gamePublisher = config.messages?.game_publisher || i18n.error.game_publisher;

    const applicationLink = config.application?.link || questLink || 'https://discord.com';
    const applicationName = config.application?.name || '';
    const applicationId = config.application?.id || '';

    const heroUrl = config.assets?.hero ? `https://cdn.discordapp.com/${config.assets.hero}` : assets.discordQuests;

    const embed = {
        title: `${i18n.new_quest} - ${questName}`,
        url: questLink,
        description: `**${i18n.duration}:** ${durationStr}\n**${i18n.game}:** ${gameTitle} (${gamePublisher})\n**${i18n.application}:** [${applicationName}](${applicationLink}) (\`${applicationId}\`)\n\n**${i18n.reward_type}:** ${rewards.rewardType}\n**${i18n.sku_id}:** \`${skuId}\`\n**${i18n.reward_name.normal}:** ${rewardName}${rewards.extraReward}\n${rewards.expires}\n\n---\n# *Nếu như không thấy nhiệm vụ trong app Discord, trước hết phải khởi động lại ứng dụng. Nếu vẫn không thấy thì fake IP sang US, UK, v.v. Chúng tôi sẽ gửi thông báo về yêu cầu về IP vào mỗi buổi trưa (nếu có).*`,
        thumbnail: { url: heroUrl },
        footer: { text: `${i18n.quest_id}: ${questId}` }
    };

    return {
        username: i18n.name,
        avatar_url: assets.avatarWebhook,
        content: baseContent,
        embeds: [embed]
    };
}

/**
 * Build embed for UPDATED quest
 */
export async function buildUpdatedQuestEmbed(content, oldQuest, newQuest, assets, changes) {
    const config = newQuest.config;
    if (!config) return null;

    const questName = config.messages?.quest_name || i18n.error.new_quest;
    const questId = newQuest.id || '';
    const questLink = `https://canary.discord.com/quests/${questId}`;

    // Ping role hoặc fallback text
    let baseContent = content || `Nhiệm vụ đã cập nhật: [${questName}](${questLink})`;
    if (PING_ROLE_ID) {
        baseContent = `<@&${PING_ROLE_ID}> Nhiệm Vụ đã cập nhật !!! [Click vào đây để xem chi tiết](${questLink})`;
    }

    const changeDescription = buildChangeDescription(oldQuest, newQuest, changes);
    const heroUrl = config.assets?.hero ? `https://cdn.discordapp.com/${config.assets.hero}` : assets.discordQuests;

    const embed = {
        title: `${i18n.updated_quest} - ${questName}`,
        url: questLink,
        description: `## ${i18n.changes_detected}\n${changeDescription}\n\n---\n# *Nếu như không thấy nhiệm vụ trong app Discord, trước hết phải khởi động lại ứng dụng. Nếu vẫn không thấy thì fake IP sang US, UK, v.v. Chúng tôi sẽ gửi thông báo về yêu cầu về IP vào mỗi buổi trưa (nếu có).*`,
        thumbnail: { url: heroUrl },
        footer: { text: `${i18n.quest_id}: ${questId}` }
    };

    return {
        username: i18n.name,
        avatar_url: assets.avatarWebhook,
        content: baseContent,
        embeds: [embed]
    };
}
