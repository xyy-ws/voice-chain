import test from 'node:test';
import assert from 'node:assert/strict';
import { dispatchVoice, getVoiceMetrics } from '../src/voice-runtime.js';

test('dispatchVoice: block unsafe payload by guardrail', async () => {
  const result = await dispatchVoice(
    { title: 'nsfw post', summary: 'adult', url: 'https://example.com' },
    { channels: { telegram: { enabled: true, chatId: '1' } } }
  );
  assert.equal(result.ok, false);
  assert.equal(result.error, 'voice_guardrail_blocked');
});

test('dispatchVoice: fallback dry-run when webhooks missing', async () => {
  const result = await dispatchVoice(
    { title: 'AI', summary: 'ok', url: 'https://example.com' },
    {
      channels: {
        telegram: { enabled: true, chatId: '1' },
        discord: { enabled: true, channelId: '2' }
      }
    }
  );

  assert.equal(result.ok, true);
  assert.equal(result.results.length, 2);
  assert.equal(result.results.every((x) => x.dryRun === true), true);

  const metrics = getVoiceMetrics();
  assert.equal(metrics.byChannel.telegram.total >= 1, true);
  assert.equal(metrics.byChannel.discord.total >= 1, true);
});
