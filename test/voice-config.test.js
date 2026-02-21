import test from 'node:test';
import assert from 'node:assert/strict';
import { applyVoicePreferences, buildVoiceFeatureFlags, buildVoiceSettings } from '../src/voice-config.js';

test('buildVoiceSettings: disabled by default', () => {
  const settings = buildVoiceSettings({});
  assert.equal(settings.enabled, false);
  assert.equal(settings.channels.telegram.enabled, false);
  assert.equal(settings.channels.telegram.webhook, '');
  assert.equal(settings.channels.telegram.botToken, '');
  assert.equal(settings.channels.discord.enabled, false);
  assert.equal(settings.channels.discord.webhook, '');
  assert.equal(settings.channels.discord.botToken, '');
  assert.equal(settings.tts.provider, 'system');
  assert.equal(settings.tts.voice, 'default');
  assert.equal(settings.asr.provider, 'mock');
  assert.equal(settings.asr.localCommand, 'python3');
  assert.equal(settings.asr.localModel, 'small');
  assert.equal(settings.asr.fallbackToMock, 'true');
});

test('buildVoiceFeatureFlags: channel flags require global MVP flag', () => {
  const flags = buildVoiceFeatureFlags({
    VOICE_MVP_ENABLED: 'false',
    VOICE_TELEGRAM_ENABLED: 'true',
    VOICE_DISCORD_ENABLED: 'true'
  });

  assert.deepEqual(flags, {
    voiceMvp: false,
    voiceTelegram: false,
    voiceDiscord: false
  });
});

test('applyVoicePreferences: preserve custom fields while injecting voice defaults', () => {
  const merged = applyVoicePreferences(
    {
      topics: ['ai'],
      voice: { tts: { voice: 'alloy' } },
      featureFlags: { customBeta: true }
    },
    {
      VOICE_MVP_ENABLED: 'true',
      VOICE_TELEGRAM_ENABLED: 'true',
      VOICE_TELEGRAM_CHAT_ID: '12345',
      VOICE_TELEGRAM_BOT_TOKEN: 'tg-token'
    }
  );

  assert.equal(merged.voice.enabled, true);
  assert.equal(merged.voice.channels.telegram.enabled, true);
  assert.equal(merged.voice.channels.telegram.chatId, '12345');
  assert.equal(merged.voice.channels.telegram.botToken, 'tg-token');
  assert.equal(merged.voice.tts.voice, 'alloy');
  assert.equal(merged.featureFlags.voiceMvp, true);
  assert.equal(merged.featureFlags.voiceTelegram, true);
  assert.equal(merged.featureFlags.voiceDiscord, false);
  assert.equal(merged.featureFlags.customBeta, true);
});
