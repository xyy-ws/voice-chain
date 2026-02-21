# voice-chain

独立仓库：Telegram/Discord 语音链路（转写与回复）。

## 范围
- `src/voice-*.js`
- `src/tools/faster-whisper-transcribe.py`
- 语音相关测试（`test/voice-*.test.js`）
- `src/server.js`（语音入口集成）

## OpenClaw 端必需配置

已提供示例文件：
- `docs/openclaw-config.example.json`
- `docs/voice-env.example`

### 1) OpenClaw 配置（openclaw.json）

关键是开启：
- `channels.telegram` / `channels.discord`
- `tools.media.audio.enabled=true`
- `tools.media.audio.models[0]` 使用本地 CLI（faster-whisper）

直接参考：`docs/openclaw-config.example.json`

### 2) 环境变量

语音链路依赖 token 与 ASR 参数：
- `VOICE_TELEGRAM_BOT_TOKEN`
- `VOICE_DISCORD_BOT_TOKEN`
- `VOICE_ASR_*`

直接参考：`docs/voice-env.example`

### 3) 延迟优化 A 档（默认推荐）

- whisper model: `base`
- beam size: `1`
- language: `zh`

这套在中文短语音里能兼顾速度与可用性。
