# voice-chain v0.1.0

## Highlights
- Telegram/Discord voice transcription + reply pipeline
- Local faster-whisper ASR support
- A-tier latency defaults (`base`, `beam=1`, `zh`)
- OpenClaw config/env examples
- `install.sh` quick-start installer

## Install
```bash
git clone https://github.com/xyy-ws/voice-chain.git
cd voice-chain
bash ./install.sh
```

## Runtime dependencies
- Python 3
- ffmpeg
- `pip install faster-whisper`

## Notes
- Update token/path values in copied config files before enabling in production.
