import test from 'node:test';
import assert from 'node:assert/strict';
import { createDiscordVoicePayload, sendDiscordVoice } from '../src/voice-discord.js';

test('createDiscordVoicePayload: includes channel and script', () => {
  const payload = createDiscordVoicePayload(
    { title: 'AI News' },
    { channels: { discord: { channelId: 'c-1' } }, tts: { voice: 'nova' } }
  );

  assert.equal(payload.channelId, 'c-1');
  assert.match(payload.content, /AI News/);
  assert.equal(payload.envelope.channel, 'discord');
});

test('sendDiscordVoice: dry-run when webhook is missing', async () => {
  const result = await sendDiscordVoice(
    { title: 'AI' },
    { channels: { discord: { channelId: 'c-1' } } }
  );

  assert.equal(result.ok, true);
  assert.equal(result.dryRun, true);
});

test('sendDiscordVoice: fail when channelId missing', async () => {
  const result = await sendDiscordVoice({ title: 'AI' }, { channels: { discord: {} } });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'discord_channel_id_required');
});
