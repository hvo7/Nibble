import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32 } from 'node:zlib';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const companionFiles = ['manifest.json', 'capture.js', 'photo-capture.js', 'popup.html', 'popup.css', 'popup.js', 'privacy.html', 'README.txt'];
export async function copyBrowserCompanion(target, { staging = false } = {}) {
  await mkdir(target, { recursive: true });
  for (const name of companionFiles) await copyFile(path.join(root, 'src/browser-companion', name), path.join(target, name));
  if (!staging) {
    const { version } = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
    const manifestFile = path.join(target, 'manifest.json'), manifest = JSON.parse(await readFile(manifestFile, 'utf8'));
    manifest.name = 'Nibble Recipe Companion'; manifest.version = version;
    await writeFile(manifestFile, JSON.stringify(manifest, null, 2) + '\n');
    for (const name of ['README.txt', 'privacy.html']) {
      const file = path.join(target, name);
      await writeFile(file, (await readFile(file, 'utf8')).replace(/Staging( companion)? \d+\.\d+\.\d+/g, (_, companion) => 'Production' + (companion ?? '') + ' ' + version));
    }
  }
  const { build } = await import('esbuild');
  await build({ entryPoints: [path.join(root, 'src/browser-companion/popup.js')], bundle: true, format: 'esm', platform: 'browser', target: 'chrome120', outfile: path.join(target, 'popup.js') });
}
/** Small uncompressed ZIP, no runtime dependency or network service needed. */
export async function zipBrowserCompanion(target, { staging = false } = {}) {
  const source = staging ? path.join(root, '.nibble-staging/companion-zip') : path.join(root, 'browser-companion');
  if (staging) await copyBrowserCompanion(source, { staging: true });
  const names = companionFiles;
  const files = [], directory = []; let offset = 0;
  for (const name of names) {
    const filename = Buffer.from(name), data = await readFile(path.join(source, name));
    const checksum = crc32(data), local = Buffer.alloc(30), central = Buffer.alloc(46);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x800, 6); local.writeUInt16LE(33, 12);
    local.writeUInt32LE(checksum, 14); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(filename.length, 26);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0x800, 8); central.writeUInt16LE(33, 14);
    central.writeUInt32LE(checksum, 16); central.writeUInt32LE(data.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(filename.length, 28); central.writeUInt32LE(offset, 42);
    files.push(local, filename, data); directory.push(central, filename); offset += local.length + filename.length + data.length;
  }
  const central = Buffer.concat(directory), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(names.length, 8); end.writeUInt16LE(names.length, 10); end.writeUInt32LE(central.length, 12); end.writeUInt32LE(offset, 16);
  await writeFile(target, Buffer.concat([...files, central, end]));
}
