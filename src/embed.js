// src/embed.js
// ─── Embed Builder — 100% Discord Components V2, no legacy embeds, ever ────
//
// Every payload built here sets the IS_COMPONENTS_V2 flag unconditionally
// and never sets `content` or `embeds` — there is no code path left that
// can produce a V1 rich embed.
//
// Layout mirrors the reference screenshots:
//   [ping?] "# Nhiệm vụ mới - {name}"
//   → hero image (Media Gallery)
//   → restart/fake-IP note
//   → quest info block (duration, reward deadline, platform, game, app, feature)
//   → requirements block (intro line + task bullets)
//   → reward block (type/sku/name) with the reward icon as a small Thumbnail
//     accessory next to it
//   → hero video (separate Media Gallery, large + playable)
//   → quest id
//   → "Open quest" button
//
// Images/video use the original Discord CDN URL directly as the component's
// `media.url` — nothing is downloaded or re-uploaded server-side, so there's
// nothing left that can 403.
import fs from 'fs/promises';
import path from 'path';
import { i18n } from './language.js';
import { formatDate, getReward, buildChangeDescription } from './utils.js';
import { decodeFeatures } from './state.js';

const PING_ROLE_ID = process.env.PING_ROLE_ID || '';
const IS_COMPONENTS_V2 = 1 << 15; // 32768

/* ── asset path resolution (unchanged behavior, still zero downloads) ──────── */

async function readStateFile() {
  try {
    const p = path.resolve(process.cwd(), 'state.json');
    const raw = await fs.readFile(p, 'utf8').catch(() => null);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch (err) {
    return {};
  }
}

function buildCdnUrl(assetPath) {
  if (!assetPath) return null;
  const s = String(assetPath).trim();
  if (!s) return null;
  if (s.startsWith('http://') || s.startsWith('https://')) return s;
  const normalized = s.replace(/^\/+/, '');
  return `https://cdn.discordapp.com/${normalized}`;
}

async function resolveAssetPath(assetValue, questId) {
  if (!assetValue) return null;
  const trimmed = String(assetValue).trim();
  if (!trimmed) return null;

  if (/PLACEHOLDER/i.test(trimmed) || trimmed.toLowerCase() === 'placeholder') {
    try {
      const state = await readStateFile();
      const prev = state?.quests?.[questId];
      const prevConfig = prev?.config || {};
      const prevAssets = prevConfig.assets || {};
      const candidates = [
        prevAssets.hero,
        prevAssets.hero_video,
        prevAssets.quest_bar_hero,
        prevAssets.quest_bar_hero_video,
        prevAssets.game_tile,
        prevAssets.game_tile_light,
        prevAssets.game_tile_dark,
        prevAssets.logotype,
        prevAssets.logotype_light,
        prevAssets.logotype_dark,
      ];
      for (const c of candidates) {
        if (c && !/PLACEHOLDER/i.test(String(c))) return String(c).trim();
      }
    } catch (e) {
      // ignore, fall through to null
    }
    return null;
  }

  return trimmed;
}

/**
 * Resolve hero image / hero video / reward icon URLs. Reward icon falls back
 * to assets.rewardIconUrl (from main.js's globalAssets) when the quest has
 * no game_tile/logotype of its own, so the reward block always has an icon.
 */
async function resolveAssetUrls(config, assetsFallback, questId) {
  const heroRaw = config?.assets?.hero || config?.assets?.quest_bar_hero || null;
  const heroVideoRaw = config?.assets?.hero_video || config?.assets?.quest_bar_hero_video || null;
  const rewardRaw =
    config?.assets?.game_tile ||
    config?.assets?.game_tile_light ||
    config?.assets?.game_tile_dark ||
    config?.assets?.logotype ||
    config?.assets?.logotype_light ||
    config?.assets?.logotype_dark ||
    null;

  const heroPath = await resolveAssetPath(heroRaw, questId);
  const heroVideoPath = await resolveAssetPath(heroVideoRaw, questId);
  const rewardPath = await resolveAssetPath(rewardRaw, questId);

  const heroUrl = buildCdnUrl(heroPath) || assetsFallback?.discordQuests || null;
  const videoUrl = buildCdnUrl(heroVideoPath) || null;
  const rewardUrl = buildCdnUrl(rewardPath) || assetsFallback?.rewardIconUrl || null;

  return { heroUrl, videoUrl, rewardUrl };
}

/* ── small V2 component builders ─────────────────────────────────────────── */

const textDisplay = content => ({ type: 10, content });
const separator = (divider = true, spacing = 1) => ({ type: 14, divider, spacing });

/** Builds a Media Gallery from any number of {url, description} entries (falsy entries ignored). */
function mediaGallery(...items) {
  const built = items.filter(Boolean).map(({ url, description }) => ({ media: { url }, description }));
  return built.length ? { type: 12, items: built } : null;
}

/** Text + small image side by side (Section+Thumbnail) — falls back to plain text if no image. */
function sectionOrText(bodyText, thumbnailUrl) {
  if (thumbnailUrl) {
    return {
      type: 9,
      components: [textDisplay(bodyText)],
      accessory: { type: 11, media: { url: thumbnailUrl } },
    };
  }
  return textDisplay(bodyText);
}

function openQuestButtonRow(questLink) {
  return {
    type: 1,
    components: [{ type: 2, style: 5, label: i18n.open_quest_button || 'Mở nhiệm vụ', url: questLink }],
  };
}

/* ── text blocks ──────────────────────────────────────────────────────────── */

// PLAY_ON_* task keys are the only real, observed signal for which platforms
// a quest supports — there is no top-level `config.platforms` field in the
// real API data (confirmed against a live quests.json dump), so we derive
// this instead of reading a field that never existed.
const PLATFORM_TASK_LABELS = {
  PLAY_ON_DESKTOP: 'PC',
  PLAY_ON_XBOX: 'Xbox',
  PLAY_ON_PLAYSTATION: 'PlayStation',
};

function derivePlatformsText(config) {
  const taskKeys = Object.keys(config.task_config_v2?.tasks || {});
  const matched = taskKeys.map(k => PLATFORM_TASK_LABELS[k]).filter(Boolean);
  return matched.length ? matched.join(', ') : 'Đa nền tảng';
}

function buildInfoText(config) {
  const durationStr = `${formatDate(config.starts_at)} - ${formatDate(config.expires_at)}`;
  const rewardDeadline = formatDate(config.rewards_config?.rewards_expire_at) || '—';
  const gameTitle = config.messages?.game_title || i18n.error.game_name;
  const gamePublisher = config.messages?.game_publisher || i18n.error.game_publisher;
  const applicationName = config.application?.name || '—';
  const applicationId = config.application?.id || '—';
  const platforms = derivePlatformsText(config);
  // `features` is a real number[] bitfield (e.g. [3, 9, 13, ...]) — decode it
  // into readable names rather than showing raw IDs.
  const featureNames = decodeFeatures(config.features);
  const features = featureNames.length ? featureNames.join(', ') : '—';

  return [
    `**${i18n.quest_info || 'Thông tin nhiệm vụ'}**`,
    `**${i18n.duration || 'Thời hạn'}**: ${durationStr}`,
    `**${i18n.reward_deadline || 'Hạn chót nhận thưởng'}**: ${rewardDeadline}`,
    `**${i18n.platforms || 'Nền tảng nhận'}**: ${platforms}`,
    `**${i18n.game || 'Game'}**: ${gameTitle} (${gamePublisher})`,
    `**${i18n.application || 'Application'}**: ${applicationName} (\`${applicationId}\`)`,
    `**${i18n.features || 'Tính năng'}**: \`${features}\``,
  ].join('\n');
}

function buildRequirementsText(config) {
  const tasks = Object.values(config.task_config_v2?.tasks || {});
  const tasksList = tasks.length
    ? tasks
        .map(t => {
          const minutes = t.target ? Math.round(t.target / 60) : 0;
          const name = String(t.type || '').replace(/_/g, ' ').trim() || 'TASK';
          return `• ${name} (${minutes} phút)`;
        })
        .join('\n')
    : '—';

  return [
    `**${i18n.requirements || 'Yêu cầu'}**`,
    i18n.requirements_intro || 'Người dùng phải hoàn thành một trong các yêu cầu sau:',
    tasksList,
  ].join('\n');
}

function buildRewardsText({ rewards, skuId, rewardName }) {
  const lines = [
    `**${i18n.rewards || 'Phần thưởng'}**`,
    `**${i18n.reward_type || 'Loại phần thưởng'}**: ${rewards.rewardType}`,
    `**${i18n.sku || 'ID SKU'}**: \`${skuId}\``,
    `**${i18n.reward_name || 'Tên'}**: ${rewardName}${rewards.extraReward || ''}`,
  ];
  if (rewards.expires) lines.push(rewards.expires);
  return lines.join('\n');
}

/* ── public API ───────────────────────────────────────────────────────────── */

/**
 * Build the message payload for a brand-new quest.
 * Returns { payload, attachments: [] } — attachments is always empty, images
 * are linked directly rather than uploaded.
 */
export async function buildNewQuestEmbed(content, quest, assets) {
  const config = quest?.config;
  if (!config) return null;

  const questId = quest.id || '';
  const questName = config.messages?.quest_name || i18n.error.new_quest;
  const questLink = `https://canary.discord.com/quests/${questId}`;
  const restartNote = i18n.note_restart_app || 'Nếu không thấy nhiệm vụ trong app, thử khởi động lại ứng dụng.';

  const { heroUrl, videoUrl, rewardUrl } = await resolveAssetUrls(config, assets, questId);

  const primaryReward = config.rewards_config?.rewards?.[0] || null;
  const rewardName = primaryReward?.messages?.name || i18n.error.reward;
  const skuId = primaryReward?.sku_id || '—';
  const rewards = getReward(primaryReward, rewardName);

  const headerLines = [];
  if (PING_ROLE_ID) headerLines.push(`<@&${PING_ROLE_ID}>`);
  else if (content) headerLines.push(content);
  headerLines.push(`# ${i18n.new_quest_header || 'Nhiệm vụ mới'} - ${questName}`);

  const children = [textDisplay(headerLines.join('\n'))];

  const heroGallery = mediaGallery(heroUrl && { url: heroUrl, description: questName });
  if (heroGallery) children.push(heroGallery);

  children.push(separator());
  children.push(textDisplay(`*${restartNote}*`));
  children.push(separator());
  children.push(textDisplay(buildInfoText(config)));
  children.push(separator());
  children.push(textDisplay(buildRequirementsText(config)));
  children.push(separator());
  children.push(sectionOrText(buildRewardsText({ rewards, skuId, rewardName }), rewardUrl));

  const videoGallery = mediaGallery(videoUrl && { url: videoUrl, description: `${questName} - video` });
  if (videoGallery) children.push(videoGallery);

  children.push(separator());
  children.push(textDisplay(`**${i18n.quest_id || 'ID Nhiệm vụ'}**: \`${questId}\``));
  children.push(separator());
  children.push(openQuestButtonRow(questLink));

  const payload = {
    flags: IS_COMPONENTS_V2,
    components: [{ type: 17, accent_color: 0x2f3136, components: children }],
  };

  return { payload, attachments: [] };
}

/**
 * Build the message payload for an updated quest.
 * Returns { payload, attachments: [] }.
 */
export async function buildUpdatedQuestEmbed(content, oldQuest, newQuest, assets, changes) {
  const config = newQuest?.config;
  if (!config) return null;

  const questId = newQuest.id || '';
  const questName = config.messages?.quest_name || i18n.error.new_quest;
  const questLink = `https://canary.discord.com/quests/${questId}`;
  const restartNote = i18n.note_restart_app || 'Nếu không thấy nhiệm vụ trong app, thử khởi động lại ứng dụng.';

  const { heroUrl, videoUrl } = await resolveAssetUrls(config, assets, questId);

  const changeDescription =
    buildChangeDescription(oldQuest, newQuest, changes) || (i18n.no_changes || 'Không có thay đổi');

  const headerLines = [];
  if (PING_ROLE_ID) headerLines.push(`<@&${PING_ROLE_ID}>`);
  else if (content) headerLines.push(content);
  headerLines.push(`# ${i18n.updated_quest_header || 'Nhiệm vụ được cập nhật'} - ${questName}`);

  const children = [textDisplay(headerLines.join('\n'))];

  const gallery = mediaGallery(
    heroUrl && { url: heroUrl, description: questName },
    videoUrl && { url: videoUrl, description: `${questName} - video` }
  );
  if (gallery) children.push(gallery);

  children.push(separator());
  children.push(textDisplay(`*${restartNote}*`));
  children.push(separator());
  children.push(textDisplay([`**${i18n.changes || 'Thay đổi'}**`, changeDescription].join('\n')));
  children.push(separator());
  children.push(textDisplay(`**${i18n.quest_id || 'ID Nhiệm vụ'}**: \`${questId}\``));
  children.push(separator());
  children.push(openQuestButtonRow(questLink));

  const payload = {
    flags: IS_COMPONENTS_V2,
    components: [{ type: 17, accent_color: 0xffcc00, components: children }],
  };

  return { payload, attachments: [] };
}
