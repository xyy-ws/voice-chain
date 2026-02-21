import { sendTelegramVoice } from './voice-telegram.js';
import { sendDiscordVoice } from './voice-discord.js';

const metrics = {
  total: 0,
  success: 0,
  failed: 0,
  fallback: 0,
  blocked: 0,
  byChannel: {
    telegram: { total: 0, success: 0, failed: 0 },
    discord: { total: 0, success: 0, failed: 0 }
  },
  updatedAt: null
};

function nowIso() {
  return new Date().toISOString();
}

function isBlocked(item = {}) {
  const text = `${item?.title || ''} ${item?.summary || ''}`.toLowerCase();
  if (text.includes('nsfw') || text.includes('adult')) return 'unsafe_content';
  if (!String(item?.url || '').startsWith('http')) return 'invalid_url';
  return '';
}

function mark(channel, ok) {
  metrics.total += 1;
  metrics.byChannel[channel].total += 1;
  if (ok) {
    metrics.success += 1;
    metrics.byChannel[channel].success += 1;
  } else {
    metrics.failed += 1;
    metrics.byChannel[channel].failed += 1;
  }
  metrics.updatedAt = nowIso();
}

export function getVoiceMetrics() {
  return JSON.parse(JSON.stringify(metrics));
}

export async function dispatchVoice(item = {}, settings = {}) {
  const blocked = isBlocked(item);
  if (blocked) {
    metrics.blocked += 1;
    metrics.updatedAt = nowIso();
    return { ok: false, error: 'voice_guardrail_blocked', detail: blocked };
  }

  const channels = [];
  if (settings?.channels?.telegram?.enabled) channels.push('telegram');
  if (settings?.channels?.discord?.enabled) channels.push('discord');
  if (!channels.length) return { ok: false, error: 'voice_channel_not_enabled' };

  const results = [];
  for (const channel of channels) {
    const result = channel === 'telegram'
      ? await sendTelegramVoice(item, settings)
      : await sendDiscordVoice(item, settings);

    mark(channel, result.ok);
    if (result.dryRun) metrics.fallback += 1;
    results.push({ channel, ...result });
  }

  const ok = results.some((x) => x.ok);
  return { ok, results, metrics: getVoiceMetrics() };
}
