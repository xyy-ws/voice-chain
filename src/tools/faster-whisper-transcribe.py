#!/usr/bin/env python3
import argparse
import json
import sys


def main() -> int:
    parser = argparse.ArgumentParser(description="Transcribe local audio with faster-whisper")
    parser.add_argument("--audio", required=True, help="Path to local audio file")
    parser.add_argument("--model", default="small", help="faster-whisper model name")
    parser.add_argument("--device", default="cpu", help="cpu|cuda|auto")
    parser.add_argument("--compute-type", default="int8", help="float16|int8|int8_float16|... ")
    parser.add_argument("--beam-size", type=int, default=5)
    parser.add_argument("--language", default=None)
    parser.add_argument("--initial-prompt", default=None)
    parser.add_argument("--vad-filter", action="store_true")
    parser.add_argument("--text-only", action="store_true", help="Print transcript text only")
    args = parser.parse_args()

    try:
        from faster_whisper import WhisperModel
    except Exception as err:
        print(json.dumps({"error": "missing_dependency", "detail": str(err)}), file=sys.stderr)
        return 2

    try:
        model = WhisperModel(args.model, device=args.device, compute_type=args.compute_type)
        segments, info = model.transcribe(
            args.audio,
            beam_size=max(1, int(args.beam_size)),
            language=args.language or None,
            initial_prompt=args.initial_prompt or None,
            vad_filter=bool(args.vad_filter),
        )

        out_segments = []
        text_parts = []
        for seg in segments:
            seg_text = (seg.text or "").strip()
            if seg_text:
                text_parts.append(seg_text)
            out_segments.append(
                {
                    "start": float(seg.start),
                    "end": float(seg.end),
                    "text": seg_text,
                }
            )

        text_out = " ".join(text_parts).strip()
        if args.text_only:
            print(text_out)
            return 0

        payload = {
            "ok": True,
            "language": getattr(info, "language", None),
            "duration": getattr(info, "duration", None),
            "text": text_out,
            "segments": out_segments,
        }
        print(json.dumps(payload, ensure_ascii=False))
        return 0
    except Exception as err:
        print(json.dumps({"error": "transcribe_failed", "detail": str(err)}), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
