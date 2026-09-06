import { BinaryReader } from './binary-reader';
import { readChannelPixels } from './sample-reader';
import type { BrushTipImage } from './types';

/** Compressed pattern resource. Indexing does not allocate decoded pixel buffers. */
export type PatternResource = {
  id: string;
  name: string;
  mode: number;
  width: number;
  height: number;
  data: Uint8Array;
};

/** Indexes length-delimited ABR pattern records while keeping their original bytes for export. */
export function readPatternIndex(data: Uint8Array): PatternResource[] {
  const reader = new BinaryReader(data);
  const patterns: PatternResource[] = [];
  while (!reader.isEof()) {
    const size = reader.readUInt32BE();
    const pattern = reader.subReader(size);
    if (pattern.readUInt32BE() !== 1) throw new Error('Unsupported pattern version');
    const mode = pattern.readUInt32BE();
    const height = pattern.readUInt16BE(),
      width = pattern.readUInt16BE();
    const name = pattern.readUnicodeString();
    const id = pattern.readString(pattern.readUInt8());
    if (mode === 2) pattern.skip(256 * 3 + 4);
    patterns.push({ id, name, mode, width, height, data: pattern.readBytes(pattern.remaining) });
    reader.skip((4 - (size % 4)) % 4);
  }
  return patterns;
}

/** Decodes grayscale/RGB pattern coverage on demand; unsupported color modes fail explicitly. */
export function decodePattern(pattern: PatternResource): BrushTipImage {
  if (pattern.mode !== 1 && pattern.mode !== 3)
    throw new Error(`Pattern ${pattern.name}: unsupported color mode ${pattern.mode}`);
  const reader = new BinaryReader(pattern.data);
  if (reader.readUInt32BE() !== 3) throw new Error('Unsupported pattern array version');
  const arrays = reader.subReader(reader.readUInt32BE());
  arrays.skip(16);
  const count = arrays.readUInt32BE();
  if (count + 2 > arrays.remaining / 4) throw new Error('Pattern channel count exceeds boundary');
  const channels: BrushTipImage[] = [];
  for (let i = 0; i < count + 2; i++) {
    const written = arrays.readUInt32BE();
    if (!written) continue;
    if (written !== 1) throw new Error('Invalid pattern channel flag');
    const size = arrays.readUInt32BE();
    if (!size) continue;
    const channel = arrays.subReader(size);
    if (i >= count) continue;
    const depth = channel.readUInt32BE();
    const pixels = readChannelPixels(channel);
    if (pixels.depth !== depth || !channel.isEof()) throw new Error('Invalid pattern channel data');
    channels.push(pixels);
  }
  const first = channels[0];
  if (!first || !arrays.isEof() || !reader.isEof()) throw new Error('Incomplete pattern array');
  if ((pattern.mode === 1 && channels.length !== 1) || (pattern.mode === 3 && channels.length !== 3))
    throw new Error('Unexpected pattern image channel count');
  if (channels.some((channel) => channel.width !== first.width || channel.height !== first.height))
    throw new Error('Pattern channel bounds differ');
  const pixels = new Uint8Array(first.data.length);
  for (let i = 0; i < pixels.length; i++)
    pixels[i] =
      channels.length === 1
        ? first.data[i]!
        : Math.round(channels[0]!.data[i]! * 0.299 + channels[1]!.data[i]! * 0.587 + channels[2]!.data[i]! * 0.114);
  return { width: first.width, height: first.height, depth: 8, data: pixels };
}
