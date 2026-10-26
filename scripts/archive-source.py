"""Create a small reproducible source archive, excluding private data and build caches."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import argparse

parser = argparse.ArgumentParser()
parser.add_argument('output', type=Path)
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
files = []
for folder in ('src', 'electron', 'workers', 'assets', 'scripts', 'docs', 'tests', 'public'):
    files.extend(p for p in (root / folder).rglob('*') if p.is_file() and '__pycache__' not in p.parts)
for name in ('package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.ts', 'vitest.config.ts', 'index.html', 'README.md', 'AGENTS.md', '.gitignore', 'Start-Nibble.cmd', 'Start-Nibble-Staging.cmd'):
    files.append(root / name)
args.output.parent.mkdir(parents=True, exist_ok=True)
with ZipFile(args.output, 'w', compression=ZIP_DEFLATED, compresslevel=9) as archive:
    for file in sorted(files):
        archive.write(file, Path('Nibble') / file.relative_to(root))
print(f'Archived {len(files)} source files ({args.output.stat().st_size:,} bytes).')
