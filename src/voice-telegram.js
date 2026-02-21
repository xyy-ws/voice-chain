import { createVoiceEnvelope } from './voice-pipeline.js';

function pickString(value, fallback = '') {
  if (value === undefined || value === null) return fallback;
  const text = String(value).trim();
  return text || fallback;
}

export function createTelegramVoicePayload(item = {}, settings = {}) {
  const envelope = createVoiceEnvelope(item, {
    channel: 'telegram',
    ttsProvider: settings?.tts?.provider,
    voice: settings?.tts?.voice,
    intro: settings?.intro
  });

  return {
    chatId: pickString(settings?.channels?.telegram?.chatId, ''),
    text: envelope.tts.script,
    parseMode: 'HTML',
    envelope
  };
}

export async function sendTelegramVoice(item = {}, settings = {}, deps = {}) {
  const payload = createTelegramVoicePayload(item, settings);
  if (!payload.chatId) {
    return { ok: false, error: 'telegram_chat_id_required', payload };
  }

  const endpoint = pickString(settings?.channels?.telegram?.webhook, '');
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
    return { ok: false, error: 'telegram_send_failed', status: response?.status || 500, payload };
  }

  return { ok: true, status: response.status, payload };
}
