import { tmpdir } from 'node:os';
import { join, extname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { writeFile, unlink } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';

function pickString(value, fallback = '') {
  if (value === undefined || value === null) return fallback;
  const text = String(value).trim();
  return text || fallback;
}

function pickNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function toBool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function pickAudioExt(contentType = '', audioUrl = '') {
  const ct = pickString(contentType, '').toLowerCase();
  if (ct.includes('mpeg') || ct.includes('mp3')) return '.mp3';
  if (ct.includes('wav')) return '.wav';
  if (ct.includes('webm')) return '.webm';
  if (ct.includes('mp4') || ct.includes('m4a') || ct.includes('aac')) return '.m4a';
  if (ct.includes('flac')) return '.flac';
  const fromUrl = extname(audioUrl.split('?')[0] || '').toLowerCase();
  return fromUrl || '.ogg';
}

function runExecFile(command, args, options = {}) {
  return new Promise((resolve) => {
    execFile(command, args, options, (error, stdout, stderr) => {
      resolve({ error, stdout, stderr });
    });
  });
}

export function isDiscordVoiceAttachment(attachment = {}) {
  const contentType = pickString(attachment.content_type || attachment.contentType, '').toLowerCase();
  return contentType.startsWith('audio/') || Number.isFinite(attachment.duration_secs) || Number.isFinite(attachment.durationSecs);
}

export function findVoiceAttachment(message = {}) {
  const attachments = Array.isArray(message.attachments) ? message.attachments : [];
  return attachments.find((item) => isDiscordVoiceAttachment(item)) || null;
}

export async function fetchDiscordChannelMessages(options = {}, deps = {}) {
  const channelId = pickString(options.channelId, '');
  const botToken = pickString(options.botToken, '');
  const limit = Math.min(100, pickNumber(options.limit, 30));

  if (!channelId) return { ok: false, error: 'discord_channel_id_required' };
  if (!botToken) return { ok: false, error: 'discord_bot_token_required' };

  const fetchImpl = deps.fetchImpl || globalThis.fetch;
  const endpoint = `https://discord.com/api/v10/channels/${encodeURIComponent(channelId)}/messages?limit=${limit}`;
  const response = await fetchImpl(endpoint, {
    method: 'GET',
    headers: {
      Authorization: `Bot ${botToken}`
    }
  });

  if (!response?.ok) {
    return {
      ok: false,
      error: 'discord_fetch_messages_failed',
      status: response?.status || 500
    };
  }

  const items = await response.json();
  return {
    ok: true,
    items: Array.isArray(items) ? items : []
  };
}

export function extractTelegramMessages(updates = [], chatId = '') {
  const targetChatId = pickString(chatId, '');
  const items = Array.isArray(updates) ? updates : [];
  const messages = [];

  for (const update of items) {
    const message = update?.message || update?.channel_post || null;
    if (!message) continue;
    const messageChatId = pickString(message?.chat?.id, '');
    if (targetChatId && messageChatId !== targetChatId) continue;
    messages.push(message);
  }

  return messages.sort((a, b) => Number(b?.message_id || 0) - Number(a?.message_id || 0));
}

export function findTelegramVoiceMessage(messages = [], currentMessageId = '') {
  const list = Array.isArray(messages) ? messages : [];
  if (!list.length) return null;

  const currentId = pickString(currentMessageId, '');
  let startIndex = 0;
  if (currentId) {
    const idx = list.findIndex((item) => pickString(item?.message_id, '') === currentId);
    if (idx >= 0) startIndex = idx + 1;
  }

  for (let i = startIndex; i < list.length; i += 1) {
    const message = list[i];
    const voice = message?.voice;
    if (voice?.file_id) {
      return {
        message,
        voice
      };
    }
  }

  return null;
}

export async function fetchTelegramUpdates(options = {}, deps = {}) {
  const botToken = pickString(options.botToken, '');
  const limit = Math.min(100, pickNumber(options.limit, 30));
  const apiBase = pickString(options.apiBase, 'https://api.telegram.org');

  if (!botToken) return { ok: false, error: 'telegram_bot_token_required' };

  const fetchImpl = deps.fetchImpl || globalThis.fetch;
  const endpoint = `${apiBase.replace(/\/$/, '')}/bot${encodeURIComponent(botToken)}/getUpdates?limit=${limit}`;
  const response = await fetchImpl(endpoint, { method: 'GET' });

  if (!response?.ok) {
    return {
      ok: false,
      error: 'telegram_fetch_updates_failed',
      status: response?.status || 500
    };
  }

  const data = await response.json().catch(() => ({}));
  const results = Array.isArray(data?.result) ? data.result : [];
  return {
    ok: true,
    updates: results,
    messages: extractTelegramMessages(results, options.chatId)
  };
}

export async function resolveTelegramFileDownloadUrl(fileId, options = {}, deps = {}) {
  const targetFileId = pickString(fileId, '');
  const botToken = pickString(options.botToken, '');
  const apiBase = pickString(options.apiBase, 'https://api.telegram.org');
  if (!botToken) return { ok: false, error: 'telegram_bot_token_required' };
  if (!targetFileId) return { ok: false, error: 'telegram_file_id_required' };

  const fetchImpl = deps.fetchImpl || globalThis.fetch;
  const endpoint = `${apiBase.replace(/\/$/, '')}/bot${encodeURIComponent(botToken)}/getFile?file_id=${encodeURIComponent(targetFileId)}`;
  const response = await fetchImpl(endpoint, { method: 'GET' });
  if (!response?.ok) {
    return {
      ok: false,
      error: 'telegram_get_file_failed',
      status: response?.status || 500
    };
  }

  const data = await response.json().catch(() => ({}));
  const filePath = pickString(data?.result?.file_path, '');
  if (!filePath) return { ok: false, error: 'telegram_file_path_missing' };

  return {
    ok: true,
    filePath,
    fileUrl: `${apiBase.replace(/\/$/, '')}/file/bot${encodeURIComponent(botToken)}/${filePath}`
  };
}

export async function sendTelegramReply(text, options = {}, deps = {}) {
  const botToken = pickString(options.botToken, '');
  const chatId = pickString(options.chatId, '');
  const apiBase = pickString(options.apiBase, 'https://api.telegram.org');
  const messageText = pickString(text, '');
  const replyToMessageId = pickString(options.replyToMessageId || options.messageId, '');

  if (!botToken) return { ok: false, error: 'telegram_bot_token_required' };
  if (!chatId) return { ok: false, error: 'telegram_chat_id_required' };
  if (!messageText) return { ok: false, error: 'telegram_reply_text_required' };

  const fetchImpl = deps.fetchImpl || globalThis.fetch;
  const endpoint = `${apiBase.replace(/\/$/, '')}/bot${encodeURIComponent(botToken)}/sendMessage`;
  const payload = {
    chat_id: chatId,
    text: messageText
  };
  if (replyToMessageId) payload.reply_to_message_id = Number(replyToMessageId) || replyToMessageId;

  const response = await fetchImpl(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!response?.ok) {
    return {
      ok: false,
      error: 'telegram_send_message_failed',
      status: response?.status || 500
    };
  }

  const data = await response.json().catch(() => ({}));
  return {
    ok: true,
    result: data?.result || null
  };
}

export function pickPreviousVoiceMessage(messages = [], currentMessageId = '') {
  const list = Array.isArray(messages) ? messages : [];
  if (!list.length) return null;

  const currentId = pickString(currentMessageId, '');
  let startIndex = 0;
  if (currentId) {
    const idx = list.findIndex((item) => String(item?.id || '') === currentId);
    if (idx >= 0) startIndex = idx + 1;
  }

  for (let i = startIndex; i < list.length; i += 1) {
    const message = list[i];
    const attachment = findVoiceAttachment(message);
    if (attachment) {
      return {
        message,
        attachment
      };
    }
  }

  return null;
}

async function transcribeViaOpenAI(audioUrl, asr = {}, deps = {}) {
  const fetchImpl = deps.fetchImpl || globalThis.fetch;
  const apiKey = pickString(asr.apiKey, '');
  if (!apiKey) return { ok: false, error: 'asr_openai_api_key_required' };

  const audioResponse = await fetchImpl(audioUrl, { method: 'GET' });
  if (!audioResponse?.ok) {
    return { ok: false, error: 'asr_audio_fetch_failed', status: audioResponse?.status || 500 };
  }

  const audioBuffer = await audioResponse.arrayBuffer();
  const contentType = pickString(audioResponse.headers?.get?.('content-type'), 'audio/ogg');
  const fileExt = contentType.includes('mpeg') ? 'mp3' : 'ogg';
  const file = new Blob([audioBuffer], { type: contentType });
  const form = new FormData();
  form.append('model', pickString(asr.model, 'gpt-4o-mini-transcribe'));
  if (pickString(asr.language, '')) form.append('language', pickString(asr.language, ''));
  if (pickString(asr.prompt, '')) form.append('prompt', pickString(asr.prompt, ''));
  form.append('file', file, `discord-voice.${fileExt}`);

  const baseUrl = pickString(asr.baseUrl, 'https://api.openai.com/v1');
  const endpoint = `${baseUrl.replace(/\/$/, '')}/audio/transcriptions`;
  const response = await fetchImpl(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`
    },
    body: form
  });

  const data = await response.json().catch(() => ({}));
  if (!response?.ok) {
    return {
      ok: false,
      error: 'asr_openai_failed',
      status: response?.status || 500,
      detail: data?.error?.message || null
    };
  }

  return {
    ok: true,
    text: pickString(data?.text, '')
  };
}

async function transcribeViaLocalWhisper(audioUrl, asr = {}, deps = {}) {
  const fetchImpl = deps.fetchImpl || globalThis.fetch;
  const execFileImpl = deps.execFileImpl || runExecFile;

  const audioResponse = await fetchImpl(audioUrl, { method: 'GET' });
  if (!audioResponse?.ok) {
    return { ok: false, error: 'asr_audio_fetch_failed', status: audioResponse?.status || 500 };
  }

  const audioBuffer = Buffer.from(await audioResponse.arrayBuffer());
  const contentType = pickString(audioResponse.headers?.get?.('content-type'), 'audio/ogg');
  const fileExt = pickAudioExt(contentType, audioUrl);
  const tmpAudioPath = join(tmpdir(), `voice-asr-${randomUUID()}${fileExt}`);

  const pythonCommand = pickString(asr.localCommand, 'python3');
  const localScriptPath = pickString(
    asr.localScript,
    join(fileURLToPath(new URL('.', import.meta.url)), 'tools', 'faster-whisper-transcribe.py')
  );

  const args = [
    localScriptPath,
    '--audio',
    tmpAudioPath,
    '--model',
    pickString(asr.localModel, 'small'),
    '--device',
    pickString(asr.localDevice, 'cpu'),
    '--compute-type',
    pickString(asr.localComputeType, 'int8'),
    '--beam-size',
    String(pickNumber(asr.localBeamSize, 1))
  ];

  if (pickString(asr.language, '')) args.push('--language', pickString(asr.language, ''));
  if (pickString(asr.prompt, '')) args.push('--initial-prompt', pickString(asr.prompt, ''));
  if (toBool(asr.localVadFilter, true)) args.push('--vad-filter');

  await writeFile(tmpAudioPath, audioBuffer);
  try {
    const { error, stdout, stderr } = await execFileImpl(pythonCommand, args, {
      timeout: pickNumber(asr.localTimeoutMs, 180000),
      maxBuffer: 10 * 1024 * 1024
    });

    if (error) {
      return {
        ok: false,
        error: 'asr_local_whisper_failed',
        detail: pickString(stderr, error.message || 'local_whisper_exec_failed')
      };
    }

    const payload = JSON.parse(pickString(stdout, '{}'));
    const text = pickString(payload?.text, '');
    if (!text) {
      return {
        ok: false,
        error: 'asr_local_whisper_empty',
        detail: 'empty_transcript'
      };
    }

    return {
      ok: true,
      text,
      segments: Array.isArray(payload?.segments) ? payload.segments : undefined
    };
  } catch (error) {
    return {
      ok: false,
      error: 'asr_local_whisper_parse_failed',
      detail: error instanceof Error ? error.message : String(error)
    };
  } finally {
    await unlink(tmpAudioPath).catch(() => {});
  }
}

function mockTranscript(audioUrl) {
  const normalized = audioUrl.split('?')[0].split('/').pop() || 'voice-message';
  return {
    ok: true,
    text: `[mock-asr] 已识别语音：${normalized}`,
    mock: true
  };
}

export async function transcribeAudioUrl(audioUrl, asr = {}, deps = {}) {
  const provider = pickString(asr.provider, 'mock').toLowerCase();
  if (!audioUrl) return { ok: false, error: 'audio_url_required' };

  if (provider === 'openai') {
    return transcribeViaOpenAI(audioUrl, asr, deps);
  }

  if (provider === 'local_whisper' || provider === 'faster_whisper') {
    const result = await transcribeViaLocalWhisper(audioUrl, asr, deps);
    if (result.ok) return result;

    if (toBool(asr.fallbackToMock, true)) {
      return {
        ...mockTranscript(audioUrl),
        fallback: true,
        fallbackError: result.error,
        detail: result.detail || null
      };
    }
    return result;
  }

  return mockTranscript(audioUrl);
}

export async function transcribePreviousDiscordVoice(options = {}, deps = {}) {
  const lookup = await fetchDiscordChannelMessages(options, deps);
  if (!lookup.ok) return lookup;

  const target = pickPreviousVoiceMessage(lookup.items, options.currentMessageId || options.messageId);
  if (!target) return { ok: false, error: 'discord_voice_message_not_found' };

  const audioUrl = pickString(target.attachment?.url, '');
  if (!audioUrl) return { ok: false, error: 'discord_voice_attachment_url_missing' };

  const asrResult = await transcribeAudioUrl(audioUrl, options.asr || {}, deps);
  if (!asrResult.ok) return asrResult;

  return {
    ok: true,
    transcript: asrResult.text,
    provider: pickString(options?.asr?.provider, 'mock'),
    source: {
      channelId: pickString(options.channelId, ''),
      messageId: pickString(target.message?.id, ''),
      attachmentId: pickString(target.attachment?.id, ''),
      attachmentUrl: audioUrl
    },
    mock: asrResult.mock === true,
    fallback: asrResult.fallback === true,
    fallbackError: asrResult.fallbackError || null
  };
}

export async function transcribeTelegramVoiceMessage(options = {}, deps = {}) {
  const chatId = pickString(options.chatId, '');
  const messageId = pickString(options.messageId || options.currentMessageId, '');
  const fileId = pickString(options.fileId, '');
  if (!fileId) return { ok: false, error: 'telegram_file_id_required' };

  const download = await resolveTelegramFileDownloadUrl(fileId, options, deps);
  if (!download.ok) return download;

  const asrResult = await transcribeAudioUrl(download.fileUrl, options.asr || {}, deps);
  if (!asrResult.ok) return asrResult;

  const response = {
    ok: true,
    transcript: asrResult.text,
    provider: pickString(options?.asr?.provider, 'mock'),
    source: {
      chatId,
      messageId,
      fileId,
      filePath: download.filePath,
      attachmentUrl: download.fileUrl
    },
    mock: asrResult.mock === true,
    fallback: asrResult.fallback === true,
    fallbackError: asrResult.fallbackError || null
  };

  if (toBool(options.reply, false)) {
    const replyText = pickString(options.replyPrefix, '📝 语音转写：') + response.transcript;
    const reply = await sendTelegramReply(replyText, {
      botToken: options.botToken,
      chatId,
      messageId,
      apiBase: options.apiBase
    }, deps);

    if (!reply.ok) return { ...reply, transcript: response.transcript, source: response.source };
    response.reply = reply.result;
  }

  return response;
}

export async function transcribePreviousTelegramVoice(options = {}, deps = {}) {
  const lookup = await fetchTelegramUpdates(options, deps);
  if (!lookup.ok) return lookup;

  const target = findTelegramVoiceMessage(lookup.messages, options.currentMessageId || options.messageId);
  if (!target) return { ok: false, error: 'telegram_voice_message_not_found' };

  return transcribeTelegramVoiceMessage({
    ...options,
    chatId: pickString(options.chatId, target.message?.chat?.id || ''),
    messageId: pickString(target.message?.message_id, ''),
    fileId: pickString(target.voice?.file_id, '')
  }, deps);
}
