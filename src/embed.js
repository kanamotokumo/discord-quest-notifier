// src/embed.js
import { i18n } from './language.js';
import { formatDate, getReward, buildChangeDescription } from './utils.js';

const PING_ROLE_ID = process.env.PING_ROLE_ID || '';

/**
 * Helpers
 */
function safeJoinArray(val, fallback = '???') {
  if (!val) return fallback;
  if (Array.isArray(val)) {
    if (val.length === 0) return fallback;
    return val.join(', ');
  }
  return String(val);
}

function extractPlatform(config) {
  if (!config) return '???';
  if (Array.isArray(config.platforms) && config.platforms.length) return config.platforms.join(', ');
  if (config.platform) return config.platform;
  if (config.platform_type) return config.platform_type;
  // some APIs use platform_name or platformIds
  if (config.platform_name) return config.platform_name;
  return 'Đa nền tảng';
}

function extractFeature(config) {
  if (!config) return '???';
  if (Array.isArray(config.features) && config.features.length) return config.features.join(', ');
  if (config.feature) return config.feature;
  if (Array.isArray(config.feature_flags) && config.feature_flags.length) return config.feature_flags.join(', ');
  if (config.feature_flags) return String(config.feature_flags);
  return '???';
}

function buildTasksList(config) {
  const tasks = Object.values(config.task_config_v2?.tasks || {});
  if (!tasks.length) return '* ???';
  return tasks.map(task => {
    const minutes = task.target ? Math.round(task.target / 60) : 0;
    const type = String(task.type || '').toLowerCase().replace(/_/g, ' ');
    const name = type ? type.replace(/^\w/, c => c.toUpperCase()) : 'Task';
    return `* ${name} (${minutes} phút)`;
  }).join('\n');
}

/**
 * Build embed for NEW quest
 */
export async function buildNewQuestEmbed(content, quest, assets) {
  const config = quest?.config;
  if (!config) return null;

  const questId = quest.id || '';
  const questName = config.messages?.quest_name || i18n.error.new_quest;
  const questLink = `https://canary.discord.com/quests/${questId}`;

  // content (ping role or simple text). Ping role will handle link delivery.
  let baseContent = content || `Nhiệm vụ mới: ${questName}`;
  if (PING_ROLE_ID) {
    baseContent = `<@&${PING_ROLE_ID}> Nhiệm Vụ mới đã đến !!! [Click vào đây để làm nhiệm vụ](${questLink})`;
  }

  // Dates
  const durationStr = `${formatDate(config.starts_at)} - ${formatDate(config.expires_at)}`;
  const rewardDeadline = formatDate(config.rewards_config?.rewards_expire_at) || '???';

  // Platform and feature
  const platforms = extractPlatform(config);
  const features = extractFeature(config);

  // Reward
  const primaryReward = config.rewards_config?.rewards?.[0] || null;
  const rewardName = primaryReward?.messages?.name || i18n.error.reward;
  const skuId = primaryReward?.sku_id || '???';
  const rewards = getReward(primaryReward, rewardName); // { rewardType, extraReward, expires }

  // Reward image (if any)
  const rewardImageUrl = primaryReward?.asset ? `https://cdn.discordapp.com/${primaryReward.asset}` : null;

  // Game / Application
  const gameTitle = config.messages?.game_title || i18n.error.game_name;
  const gamePublisher = config.messages?.game_publisher || i18n.error.game_publisher;
  const applicationName = config.application?.name || '???';
  const applicationId = config.application?.id || '';

  // Hero image (will appear after description)
  const heroUrl = config.assets?.hero ? `https://cdn.discordapp.com/${config.assets.hero}` : assets.discordQuests;

  // Tasks
  const taskList = buildTasksList(config);

  // Build description: instruction first, then info sections
  const descriptionLines = [
    `*Nếu như không thấy nhiệm vụ trong app Discord, trước hết phải khởi động lại ứng dụng. Nếu vẫn không thấy thì fake IP sang US, UK, v.v. Chúng tôi sẽ gửi thông báo về yêu cầu về IP vào mỗi buổi trưa (nếu có).*`,
    '',
    `**Thông tin nhiệm vụ**`,
    `**Thời hạn**: ${durationStr}`,
    `**Hạn chót nhận thưởng**: ${rewardDeadline}`,
    `**Nền tảng nhận**: ${platforms}`,
    `**Game**: ${gameTitle} (${gamePublisher})`,
    `**Application**: ${applicationName} (${applicationId})`,
    `**Tính năng**: ${features}`,
    '',
    `**Yêu cầu**`,
    `Người dùng phải hoàn thành một trong các yêu cầu sau:`,
    `${taskList}`,
    '',
    `**Phần thưởng**`,
    `**Loại phần thưởng**: ${rewards.rewardType}`,
    `**ID SKU**: \`${skuId}\``,
    `**Phần thưởng**: ${rewardName}${rewards.extraReward || ''}`,
    `${rewards.expires || ''}`,
    '',
    `**ID Nhiệm vụ**: ${questId}`
  ];

  const embedMain = {
    title: questName, // only name, no markdown or link
    description: descriptionLines.join('\n'),
    image: { url: heroUrl }, // hero image appears after description
    footer: { text: `${i18n.quest_id}: ${questId}` }
  };

  // If reward image exists, attach it as a separate embed below
  const embeds = [embedMain];
  if (rewardImageUrl) {
    embeds.push({
      description: `**Ảnh phần thưởng**`,
      image: { url: rewardImageUrl }
    });
  }

  return {
    username: i18n.name,
    avatar_url: assets.avatarWebhook,
    content: baseContent,
    embeds
  };
}

/**
 * Build embed for UPDATED quest
 * Only list detected changes using buildChangeDescription
 */
export async function buildUpdatedQuestEmbed(content, oldQuest, newQuest, assets, changes) {
  const config = newQuest?.config;
  if (!config) return null;

  const questId = newQuest.id || '';
  const questName = config.messages?.quest_name || i18n.error.new_quest;
  const questLink = `https://canary.discord.com/quests/${questId}`;

  let baseContent = content || `Nhiệm vụ đã cập nhật: ${questName}`;
  if (PING_ROLE_ID) {
    baseContent = `<@&${PING_ROLE_ID}> Nhiệm Vụ đã cập nhật !!! [Click vào đây để xem chi tiết](${questLink})`;
  }

  // Hero image
  const heroUrl = config.assets?.hero ? `https://cdn.discordapp.com/${config.assets.hero}` : assets.discordQuests;

  // Detect changes description (only changed fields)
  const changeDescription = buildChangeDescription(oldQuest, newQuest, changes) || 'Không có thay đổi';

  const descriptionLines = [
    `*Nếu như không thấy nhiệm vụ trong app Discord, trước hết phải khởi động lại ứng dụng. Nếu vẫn không thấy thì fake IP sang US, UK, v.v. Chúng tôi sẽ gửi thông báo về yêu cầu về IP vào mỗi buổi trưa (nếu có).*`,
    '',
    `**Thay đổi**`,
    `${changeDescription}`,
    '',
    `**ID Nhiệm vụ**: \`${questId}\``
  ];

  const embed = {
    title: questName,
    description: descriptionLines.join('\n'),
    image: { url: heroUrl },
    footer: { text: `${i18n.quest_id}: ${questId}` }
  };

  return {
    username: i18n.name,
    avatar_url: assets.avatarWebhook,
    content: baseContent,
    embeds: [embed]
  };
}
