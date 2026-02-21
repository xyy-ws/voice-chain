# Info Push API - Voice MVP

## Voice MVP env flags

- `VOICE_MVP_ENABLED=true`
- `VOICE_TTS_PROVIDER=system`
- `VOICE_TTS_VOICE=default`
- `VOICE_TELEGRAM_ENABLED=true`
- `VOICE_TELEGRAM_CHAT_ID=<chat-id>`
- `VOICE_TELEGRAM_WEBHOOK=<optional webhook url>`
- `VOICE_TELEGRAM_BOT_TOKEN=<bot token for reading updates/getFile>`
- `VOICE_DISCORD_ENABLED=true`
- `VOICE_DISCORD_CHANNEL_ID=<channel-id>`
- `VOICE_DISCORD_WEBHOOK=<optional webhook url>`
- `VOICE_DISCORD_BOT_TOKEN=<bot token for reading channel messages>`
- `VOICE_ASR_PROVIDER=mock|openai|local_whisper`
- `VOICE_ASR_MODEL=gpt-4o-mini-transcribe`
- `VOICE_ASR_API_KEY=<required when provider=openai>`
- `VOICE_ASR_OPENAI_BASE_URL=https://api.openai.com/v1`
- `VOICE_ASR_LOCAL_COMMAND=python3`
- `VOICE_ASR_LOCAL_SCRIPT=<optional absolute path to faster-whisper-transcribe.py>`
- `VOICE_ASR_LOCAL_MODEL=small`
- `VOICE_ASR_LOCAL_DEVICE=cpu`
- `VOICE_ASR_LOCAL_COMPUTE_TYPE=int8`
- `VOICE_ASR_LOCAL_BEAM_SIZE=1`
- `VOICE_ASR_LOCAL_TIMEOUT_MS=180000`
- `VOICE_ASR_LOCAL_VAD_FILTER=true`
- `VOICE_ASR_FALLBACK_TO_MOCK=true`

## Voice endpoints

- `GET /v1/voice/candidates?limit=3`
- `POST /v1/voice/envelope`
- `POST /v1/voice/telegram/send`
- `POST /v1/voice/discord/send`
- `POST /v1/voice/discord/transcribe-last`
- `POST /v1/voice/telegram/transcribe-last` (supports direct `{ message | update | fileId }`, auto-replies transcript by default)
- `POST /v1/voice/dispatch`
- `GET /v1/voice/metrics`

## Notes

- If webhook is not configured, send endpoints return `dryRun: true` as fallback.
- Dispatch has basic guardrails: invalid URL and unsafe keywords are blocked.
- Local ASR (`local_whisper`) uses `src/tools/faster-whisper-transcribe.py` and requires Python deps:
  - `python3 -m pip install faster-whisper`
  - For ffmpeg decoding support, ensure system ffmpeg is installed (`ffmpeg -version`).
