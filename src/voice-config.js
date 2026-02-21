function toBool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function pickString(value, fallback = '') {
  if (value === undefined || value === null) return fallback;
  const text = String(value).trim();
  return text || fallback;
}

export function buildVoiceSettings(env = process.env) {
  const enabled = toBool(env.VOICE_MVP_ENABLED, false);
  const telegramEnabled = enabled && toBool(env.VOICE_TELEGRAM_ENABLED, false);
  const discordEnabled = enabled && toBool(env.VOICE_DISCORD_ENABLED, false);

  return {
    enabled,
    tts: {
      provider: pickString(env.VOICE_TTS_PROVIDER, 'system'),
      voice: pickString(env.VOICE_TTS_VOICE, 'default')
    },
    asr: {
      provider: pickString(env.VOICE_ASR_PROVIDER, 'mock'),
      model: pickString(env.VOICE_ASR_MODEL, 'gpt-4o-mini-transcribe'),
      language: pickString(env.VOICE_ASR_LANGUAGE, ''),
      prompt: pickString(env.VOICE_ASR_PROMPT, '以下是中文口语，请尽量按原话转写，不要脑补。'),
      apiKey: pickString(env.VOICE_ASR_API_KEY, ''),
      baseUrl: pickString(env.VOICE_ASR_OPENAI_BASE_URL, 'https://api.openai.com/v1'),
      localCommand: pickString(env.VOICE_ASR_LOCAL_COMMAND, 'python3'),
      localScript: pickString(env.VOICE_ASR_LOCAL_SCRIPT, ''),
      localModel: pickString(env.VOICE_ASR_LOCAL_MODEL, 'small'),
      localDevice: pickString(env.VOICE_ASR_LOCAL_DEVICE, 'cpu'),
      localComputeType: pickString(env.VOICE_ASR_LOCAL_COMPUTE_TYPE, 'int8'),
      localBeamSize: pickString(env.VOICE_ASR_LOCAL_BEAM_SIZE, '5'),
      localTimeoutMs: pickString(env.VOICE_ASR_LOCAL_TIMEOUT_MS, '180000'),
      localVadFilter: pickString(env.VOICE_ASR_LOCAL_VAD_FILTER, 'true'),
      fallbackToMock: pickString(env.VOICE_ASR_FALLBACK_TO_MOCK, 'true')
    },
    channels: {
      telegram: {
        enabled: telegramEnabled,
        chatId: pickString(env.VOICE_TELEGRAM_CHAT_ID, ''),
        webhook: pickString(env.VOICE_TELEGRAM_WEBHOOK, ''),
        botToken: pickString(env.VOICE_TELEGRAM_BOT_TOKEN, '')
      },
      discord: {
        enabled: discordEnabled,
        channelId: pickString(env.VOICE_DISCORD_CHANNEL_ID, ''),
        webhook: pickString(env.VOICE_DISCORD_WEBHOOK, ''),
        botToken: pickString(env.VOICE_DISCORD_BOT_TOKEN, '')
      }
    }
  };
}

export function buildVoiceFeatureFlags(env = process.env) {
  const voice = buildVoiceSettings(env);
  return {
    voiceMvp: voice.enabled,
    voiceTelegram: voice.channels.telegram.enabled,
    voiceDiscord: voice.channels.discord.enabled
  };
}

export function applyVoicePreferences(base = {}, env = process.env) {
  return {
    ...base,
    voice: {
      ...buildVoiceSettings(env),
      ...(base.voice && typeof base.voice === 'object' ? base.voice : {})
    },
    featureFlags: {
      ...buildVoiceFeatureFlags(env),
      ...(base.featureFlags && typeof base.featureFlags === 'object' ? base.featureFlags : {})
    }
  };
}
