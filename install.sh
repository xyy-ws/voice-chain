#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET_DIR="${1:-$HOME/voice-chain}"

mkdir -p "$TARGET_DIR"
cp -f "$ROOT_DIR/docs/openclaw-config.example.json" "$TARGET_DIR/openclaw-config.example.json"
cp -f "$ROOT_DIR/docs/voice-env.example" "$TARGET_DIR/voice-env.example"

cat <<EOF
voice-chain quick install complete.

Copied files:
- $TARGET_DIR/openclaw-config.example.json
- $TARGET_DIR/voice-env.example

Next:
1) Edit the two files with your real token/path values.
2) In openclaw.json, merge tools.media.audio and channels config.
3) Ensure dependencies exist:
   - python3
   - ffmpeg
   - pip install faster-whisper
4) Reload gateway.
EOF
