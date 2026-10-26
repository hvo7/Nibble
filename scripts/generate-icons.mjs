import sharp from 'sharp';
import { readFile, writeFile } from 'node:fs/promises';

const source = await readFile('assets/icon.svg');
const sizes = [16, 32, 48, 64, 128, 256, 512];
const images = [];
for (const size of sizes) {
  const image = await sharp(source).resize(size, size).png().toBuffer();
  await writeFile(`assets/icon-${size}.png`, image);
  images.push(image);
}
const entries = sizes.slice(0, -1);
const header = Buffer.alloc(6 + entries.length * 16);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(entries.length, 4);
let offset = header.length;
entries.forEach((size, index) => {
  const at = 6 + index * 16;
  header[at] = header[at + 1] = size === 256 ? 0 : size;
  header.writeUInt16LE(1, at + 4);
  header.writeUInt16LE(32, at + 6);
  header.writeUInt32LE(images[index].length, at + 8);
  header.writeUInt32LE(offset, at + 12);
  offset += images[index].length;
});
await writeFile('assets/icon.ico', Buffer.concat([header, ...images.slice(0, -1)]));
console.log('Generated seven PNG sizes and a multi-resolution Windows icon.');
