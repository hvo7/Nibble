"""Offline video transcription. Install models separately; this worker never downloads one.

Run setup_transcription.py explicitly to obtain the selected Whisper model first.
JSON is the only stdout output; diagnostics go to stderr.
"""
import argparse
import json
import sys


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--file', required=True)
    parser.add_argument('--model', choices=('tiny', 'base', 'small'), default='tiny')
    args = parser.parse_args()
    from faster_whisper import WhisperModel
    model = WhisperModel(args.model, device='cpu', compute_type='int8', local_files_only=True)
    segments, info = model.transcribe(args.file, beam_size=3, vad_filter=True)
    if info.duration > 600:
        raise ValueError('Use a video no longer than 10 minutes.')
    result = [{'start': s.start, 'end': s.end, 'text': s.text.strip()} for s in segments]
    print(json.dumps(result, ensure_ascii=False))


if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        print(f'Whisper could not run: {exc}. See docs/SETUP.md.', file=sys.stderr)
        sys.exit(1)
