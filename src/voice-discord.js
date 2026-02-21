import { createVoiceEnvelope } from './voice-pipeline.js';

function pickString(value, fallback = '') {
  if (value === undefined || value === null) return fallback;
  const text = String(value).trim();
  return text || fallback;
}

export function createDiscordVoicePayload(item = {}, settings = {}) {
  const envelope = createVoiceEnvelope(item, {
    channel: 'discord',
    ttsProvider: settings?.tts?.provider,
    voice: settings?.tts?.voice,
    intro: settings?.intro
  });

  return {
    channelId: pickString(settings?.channels?.discord?.channelId, ''),
    content: `🔊 ${envelope.tts.script}`,
    envelope
  };
}

export async function sendDiscordVoice(item = {}, settings = {}, deps = {}) {
  const payload = createDiscordVoicePayload(item, settings);
  if (!payload.channelId) {
    return { ok: false, error: 'discord_channel_id_required', payload };
  }

  const endpoint = pickString(settings?.channels?.discord?.webhook, '');
  if (!endpoint) {
    return { ok: true, dryRun: true, payload };
  }

  const fetchImpl = deps.fetchImpl || globalThis.fetch;
  const response = await fetchImpl(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!response?.ok) {
    return { ok: false, error: 'discord_send_failed', status: response?.status || 500, payload };
  }

  return { ok: true, status: response.status, payload };
}
