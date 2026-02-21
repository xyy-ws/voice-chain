import test from 'node:test';
import assert from 'node:assert/strict';
import {
  findVoiceAttachment,
  pickPreviousVoiceMessage,
  transcribeAudioUrl,
  transcribePreviousDiscordVoice,
  transcribePreviousTelegramVoice,
  transcribeTelegramVoiceMessage
} from '../src/voice-asr.js';

test('findVoiceAttachment: picks audio attachment', () => {
  const message = {
    attachments: [
      { id: 'a1', content_type: 'image/png' },
      { id: 'a2', content_type: 'audio/ogg', url: 'https://cdn.discordapp.com/voice.ogg' }
    ]
  };

  const attachment = findVoiceAttachment(message);
  assert.equal(attachment?.id, 'a2');
});

test('pickPreviousVoiceMessage: skips current and returns older voice message', () => {
  const result = pickPreviousVoiceMessage([
    { id: '3', attachments: [] },
    { id: '2', attachments: [{ id: 'v-2', content_type: 'audio/ogg', url: 'https://a/2.ogg' }] },
    { id: '1', attachments: [{ id: 'v-1', content_type: 'audio/ogg', url: 'https://a/1.ogg' }] }
  ], '3');

  assert.equal(result?.message?.id, '2');
  assert.equal(result?.attachment?.id, 'v-2');
});

test('transcribeAudioUrl: mock provider returns placeholder transcript', async () => {
  const result = await transcribeAudioUrl('https://cdn.discordapp.com/voice-message.ogg', { provider: 'mock' });
  assert.equal(result.ok, true);
  assert.equal(result.mock, true);
  assert.match(result.text, /voice-message\.ogg/);
});

test('transcribeAudioUrl: local_whisper provider succeeds via python bridge', async () => {
  const fetchImpl = async () => ({
    ok: true,
    headers: { get: () => 'audio/ogg' },
    arrayBuffer: async () => new TextEncoder().encode('fake-audio').buffer
  });
  const execFileImpl = async () => ({
    error: null,
    stdout: JSON.stringify({ text: 'hello from whisper', segments: [{ start: 0, end: 1, text: 'hello' }] }),
    stderr: ''
  });

  const result = await transcribeAudioUrl('https://cdn.discordapp.com/voice-message.ogg', {
    provider: 'local_whisper'
  }, { fetchImpl, execFileImpl });

  assert.equal(result.ok, true);
  assert.equal(result.text, 'hello from whisper');
});

test('transcribeAudioUrl: local_whisper gracefully falls back to mock', async () => {
  const fetchImpl = async () => ({
    ok: true,
    headers: { get: () => 'audio/ogg' },
    arrayBuffer: async () => new TextEncoder().encode('fake-audio').buffer
  });
  const execFileImpl = async () => ({
    error: new Error('python missing'),
    stdout: '',
    stderr: 'python3: command not found'
  });

  const result = await transcribeAudioUrl('https://cdn.discordapp.com/voice-message.ogg', {
    provider: 'local_whisper',
    fallbackToMock: true
  }, { fetchImpl, execFileImpl });

  assert.equal(result.ok, true);
  assert.equal(result.mock, true);
  assert.equal(result.fallback, true);
  assert.equal(result.fallbackError, 'asr_local_whisper_failed');
});

test('transcribePreviousDiscordVoice: fetches channel messages and transcribes previous voice', async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(String(url));
    return {
      ok: true,
      json: async () => ([
        { id: '99', attachments: [] },
        { id: '88', attachments: [{ id: 'att-1', content_type: 'audio/ogg', url: 'https://cdn.discordapp.com/a88.ogg' }] }
      ])
    };
  };

  const result = await transcribePreviousDiscordVoice({
    channelId: 'c-1',
    currentMessageId: '99',
    botToken: 'token-1',
    asr: { provider: 'mock' }
  }, { fetchImpl });

  assert.equal(result.ok, true);
  assert.equal(result.source.messageId, '88');
  assert.equal(calls.length, 1);
  assert.match(calls[0], /\/channels\/c-1\/messages/);
});

test('transcribePreviousDiscordVoice: returns error when bot token missing', async () => {
  const result = await transcribePreviousDiscordVoice({ channelId: 'c-1', asr: { provider: 'mock' } });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'discord_bot_token_required');
});

test('transcribePreviousTelegramVoice: fetches updates and transcribes previous voice', async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    const value = String(url);
    calls.push(value);

    if (value.includes('/getUpdates')) {
      return {
        ok: true,
        json: async () => ({
          ok: true,
          result: [
            { update_id: 1, message: { message_id: 100, chat: { id: 42 }, text: 'latest' } },
            { update_id: 2, message: { message_id: 99, chat: { id: 42 }, voice: { file_id: 'voice-file-1' } } }
          ]
        })
      };
    }

    if (value.includes('/getFile')) {
      return {
        ok: true,
        json: async () => ({ ok: true, result: { file_path: 'voice/file.ogg' } })
      };
    }

    throw new Error(`unexpected url: ${value}`);
  };

  const result = await transcribePreviousTelegramVoice({
    chatId: '42',
    currentMessageId: '100',
    botToken: 'tg-token',
    asr: { provider: 'mock' }
  }, { fetchImpl });

  assert.equal(result.ok, true);
  assert.equal(result.source.messageId, '99');
  assert.equal(calls.length, 2);
  assert.match(calls[0], /getUpdates/);
  assert.match(calls[1], /getFile/);
});

test('transcribeTelegramVoiceMessage: transcribes direct file id and replies in chat', async () => {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const value = String(url);
    calls.push({ url: value, method: init?.method || 'GET', body: init?.body || null });

    if (value.includes('/getFile')) {
      return {
        ok: true,
        json: async () => ({ ok: true, result: { file_path: 'voice/file.ogg' } })
      };
    }

    if (value.includes('/file/bot')) {
      return {
        ok: true,
        headers: { get: () => 'audio/ogg' },
        arrayBuffer: async () => new TextEncoder().encode('fake-audio').buffer
      };
    }

    if (value.includes('/sendMessage')) {
      return {
        ok: true,
        json: async () => ({ ok: true, result: { message_id: 101 } })
      };
    }

    throw new Error(`unexpected url: ${value}`);
  };

  const result = await transcribeTelegramVoiceMessage({
    chatId: '42',
    messageId: '100',
    fileId: 'voice-file-direct',
    botToken: 'tg-token',
    reply: true,
    asr: { provider: 'mock' }
  }, { fetchImpl });

  assert.equal(result.ok, true);
  assert.equal(result.source.fileId, 'voice-file-direct');
  assert.equal(result.reply?.message_id, 101);
  const sendCall = calls.find((item) => item.url.includes('/sendMessage'));
  assert.equal(Boolean(sendCall), true);
  assert.match(String(sendCall?.body || ''), /语音转写/);
});

test('transcribePreviousTelegramVoice: returns error when bot token missing', async () => {
  const result = await transcribePreviousTelegramVoice({ chatId: '42', asr: { provider: 'mock' } });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'telegram_bot_token_required');
});

test('transcribePreviousTelegramVoice: returns error when no voice found', async () => {
  const fetchImpl = async () => ({
    ok: true,
    json: async () => ({
      ok: true,
      result: [
        { update_id: 1, message: { message_id: 100, chat: { id: 42 }, text: 'only text' } }
      ]
    })
  });

  const result = await transcribePreviousTelegramVoice({
    chatId: '42',
    botToken: 'tg-token',
    asr: { provider: 'mock' }
  }, { fetchImpl });

  assert.equal(result.ok, false);
  assert.equal(result.error, 'telegram_voice_message_not_found');
});
