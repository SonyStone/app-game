import { BinaryReader } from './src/binary-reader';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FILES_DIR = path.join(__dirname, 'files');
const KNOWN_KEYS = new Set(['samp', 'patt', 'desc', 'phry']);

const abrFiles = fs.readdirSync(FILES_DIR).filter(f => f.endsWith('.abr'));

for (const fileName of abrFiles) {
  const filePath = path.join(FILES_DIR, fileName);
  const data = fs.readFileSync(filePath);
  const reader = new BinaryReader(data);

  const ver = reader.readUInt16BE();
  const subVer = reader.readUInt16BE();

  const blocks: { key: string; offset: number; length: number }[] = [];
  let unknownBlocks: { key: string; offset: number; length: number }[] = [];

  while (!reader.isEof() && reader.remaining >= 12) {
    const pos = reader.position;
    const sig = reader.readString(4);
    if (sig !== '8BIM') {
      // Try next byte (padding)
      reader.seek(pos + 1);
      continue;
    }
    const key = reader.readString(4);
    const len = reader.readUInt32BE();

    blocks.push({ key, offset: pos, length: len });
    if (!KNOWN_KEYS.has(key)) {
      unknownBlocks.push({ key, offset: pos, length: len });
    }
    reader.skip(len);
  }

  const remaining = reader.remaining;
  const blockSummary = blocks.map(b => `${b.key}(${b.length})`).join(', ');

  if (unknownBlocks.length > 0 || remaining > 2) {
    console.log(`\n⚠️  ${fileName} [v${ver}.${subVer}]`);
    console.log(`   Blocks: ${blockSummary}`);
    console.log(`   Unknown blocks: ${unknownBlocks.map(b => `${b.key}(offset=${b.offset}, len=${b.length})`).join(', ') || 'none'}`);
    console.log(`   Remaining bytes: ${remaining}`);

    // Dump unknown block raw data (first 64 bytes)
    for (const ub of unknownBlocks) {
      console.log(`   --- Unknown block "${ub.key}" at offset ${ub.offset} ---`);
      const start = ub.offset + 12; // skip sig+key+length
      const dumpLen = Math.min(64, ub.length);
      const hexParts: string[] = [];
      const asciiParts: string[] = [];
      for (let i = 0; i < dumpLen; i++) {
        const b = data[start + i];
        hexParts.push(b.toString(16).padStart(2, '0'));
        asciiParts.push(b >= 32 && b < 127 ? String.fromCharCode(b) : '.');
      }
      console.log(`   Hex: ${hexParts.join(' ')}`);
      console.log(`   Ascii: ${asciiParts.join('')}`);
    }
  } else {
    console.log(`✅ ${fileName} [v${ver}.${subVer}] — Blocks: ${blockSummary} — Remaining: ${remaining}`);
  }
}
