import { BinaryReader } from './binary-reader';
import type { BrushTipImage } from './types';

/** Decode one bounded sample record. PackBits operates on bytes, including at 16-bit depth.
 * maxDecodedBytes limits the normalized coverage allocation; source record copies are not included.
 */
export function readSample(
  data: Uint8Array,
  subVersion: number,
  maxDecodedBytes = Number.MAX_SAFE_INTEGER
): { uuid: string; tip: BrushTipImage } {
  const reader = new BinaryReader(data);
  const idLength = reader.readUInt8();
  if (idLength !== 36) throw new Error(`Unsupported sample identifier length ${idLength}`);
  const uuid = reader.readString(idLength).toLowerCase();
  if (reader.readUInt8() !== 0) throw new Error('Missing sample identifier terminator');
  let tip: BrushTipImage;
  if (subVersion === 1) {
    reader.skip(10);
    tip = readChannelPixels(reader, maxDecodedBytes);
  } else if (subVersion === 2) {
    reader.skip(3); // Sample prefix: observed 01 00 00; semantics not fully established.
    const version = reader.readUInt32BE();
    if (version !== 3) throw new Error(`Unsupported sample array version ${version}`);
    const arrays = reader.subReader(reader.readUInt32BE());
    arrays.skip(16); // Outer rectangle; each channel supplies its own bounds.
    const count = arrays.readUInt32BE();
    if (count + 2 > arrays.remaining / 4) throw new Error('Sample channel count exceeds record boundary');
    let decoded: BrushTipImage | undefined;
    for (let i = 0; i < count + 2; i++) {
      const written = arrays.readUInt32BE();
      if (written === 0) continue;
      if (written !== 1) throw new Error(`Invalid sample channel written flag ${written}`);
      const length = arrays.readUInt32BE();
      if (length === 0) continue;
      const channel = arrays.subReader(length);
      if (i >= count) continue; // Preserve mask payloads in the original record.
      if (decoded) throw new Error('Multiple written sample image channels are not supported');
      const depth = channel.readUInt32BE();
      decoded = readChannelPixels(channel, maxDecodedBytes);
      if (depth !== decoded.depth) throw new Error('Sample channel depth fields disagree');
      if (!channel.isEof()) throw new Error('Unexpected bytes after sample channel pixels');
    }
    if (!arrays.isEof() || !reader.isEof()) throw new Error('Unexpected bytes after sample array list');
    if (!decoded) throw new Error('Sample has no written image channel');
    tip = decoded;
  } else {
    throw new Error(`Unsupported sample subversion ${subVersion}`);
  }
  return { uuid, tip: { ...tip, sourceSample: { data: new Uint8Array(data), subVersion } } };
}

/** Decode one channel within its own byte boundary, normalizing preview data to 8 bits. */
export function readChannelPixels(reader: BinaryReader, maxDecodedBytes = Number.MAX_SAFE_INTEGER): BrushTipImage {
  const top = reader.readInt32BE();
  const left = reader.readInt32BE();
  const bottom = reader.readInt32BE();
  const right = reader.readInt32BE();
  const width = right - left;
  const height = bottom - top;
  if (width <= 0 || height <= 0 || width > 10000 || height > 10000) {
    throw new Error(`Unsupported sample bounds ${left},${top},${right},${bottom}`);
  }
  if (width * height > maxDecodedBytes) throw new Error('Decoded brush samples exceed the byte budget');
  const depth = reader.readUInt16BE();
  const compression = reader.readUInt8();
  if (depth !== 8 && depth !== 16) throw new Error(`Unsupported sample depth ${depth}`);
  if (compression !== 0 && compression !== 1) throw new Error(`Unsupported sample compression ${compression}`);
  const rowSize = width * (depth / 8);
  const rowCounts: number[] = [];
  if (compression === 1) {
    for (let y = 0; y < height; y++) rowCounts.push(reader.readUInt16BE());
    if (rowCounts.reduce((sum, n) => sum + n, 0) > reader.remaining) {
      throw new Error('Compressed rows exceed sample boundary');
    }
  } else if (rowSize * height > reader.remaining) {
    throw new Error('Raw pixels exceed sample boundary');
  }
  const pixels = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    const row = compression === 0 ? reader.readBytes(rowSize) : unpackRow(reader.subReader(rowCounts[y]!), rowSize);
    for (let x = 0; x < width; x++) pixels[y * width + x] = row[x * (depth / 8)]!;
  }
  return { width, height, depth, data: pixels };
}

/** Require each row to consume its declared input and produce exactly its expected size. */
function unpackRow(reader: BinaryReader, size: number): Uint8Array {
  const row = new Uint8Array(size);
  let offset = 0;
  while (!reader.isEof()) {
    const count = reader.readInt8();
    if (count === -128) continue;
    const length = count >= 0 ? count + 1 : 1 - count;
    if (offset + length > size) throw new Error('PackBits run exceeds row width');
    if (count >= 0) row.set(reader.readBytes(length), offset);
    else row.fill(reader.readUInt8(), offset, offset + length);
    offset += length;
  }
  if (offset !== size) throw new Error(`Incomplete PackBits row: decoded ${offset} of ${size} bytes`);
  return row;
}
