import test from 'node:test';
import assert from 'node:assert/strict';
import { createTelegramVoicePayload, sendTelegramVoice } from '../src/voice-telegram.js';

test('createTelegramVoicePayload: includes chatId and script', () => {
  const payload = createTelegramVoicePayload(
    { title: 'AI News' },
    { channels: { telegram: { chatId: '123' } }, tts: { voice: 'nova' } }
  );

  assert.equal(payload.chatId, '123');
  assert.match(payload.text, /AI News/);
  assert.equal(payload.envelope.channel, 'telegram');
});

test('sendTelegramVoice: dry-run when webhook is missing', async () => {
  const result = await sendTelegramVoice(
    { title: 'AI' },
    { channels: { telegram: { chatId: '123' } } }
  );

  assert.equal(result.ok, true);
  assert.equal(result.dryRun, true);
});

test('sendTelegramVoice: fail when chatId missing', async () => {
  const result = await sendTelegramVoice({ title: 'AI' }, { channels: { telegram: {} } });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'telegram_chat_id_required');
});
