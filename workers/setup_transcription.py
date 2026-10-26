"""Explicit opt-in download of the free, local Whisper model; no paid service is used."""
import argparse
from faster_whisper import WhisperModel

parser = argparse.ArgumentParser()
parser.add_argument('--model', choices=('tiny', 'base', 'small'), default='tiny')
args = parser.parse_args()
WhisperModel(args.model, device='cpu', compute_type='int8')
print(f'{args.model} is ready for offline transcription.')
