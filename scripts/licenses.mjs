import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const rows = [];
async function visit(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    const root = path.join(directory, entry.name);
    if (entry.name.startsWith('@')) { await visit(root); continue; }
    try {
      const item = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
      rows.push({ name: item.name, version: item.version, license: item.license ?? item.licenses ?? 'CHECK UPSTREAM', path: root });
    } catch { /* Skip folders that are not package roots. */ }
    try { await visit(path.join(root, 'node_modules')); } catch { /* No nested dependency directory. */ }
  }
}
await visit('node_modules');
rows.sort((a, b) => a.name.localeCompare(b.name));
await writeFile('docs/dependency-licenses.json', JSON.stringify(rows, null, 2) + '\n');
console.log(`Recorded ${rows.length} package declarations in docs/dependency-licenses.json.`);
