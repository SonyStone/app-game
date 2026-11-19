import { Zip, ZipPassThrough } from 'fflate';
import { crc32, inflate, join } from './binary';

export const MiB = 1024 * 1024;

/** Writes regular files with UTF-8 names. PNG payloads are already compressed. */
export function writeZip(files: ReadonlyMap<string, Uint8Array>) {
  const chunks: Uint8Array[] = [];
  const zip = new Zip((error, bytes) => {
    if (error) {
      throw error;
    }
    chunks.push(bytes);
  });
  for (const [name, bytes] of files) {
    const entry = new ZipPassThrough(name);
    zip.add(entry);
    entry.push(bytes, true);
  }
  zip.end();
  return join(chunks);
}

/** Preflights the central directory and local records before expanding any entry. */
export async function readZip(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u16 = (i: number) => view.getUint16(i, true);
  const u32 = (i: number) => view.getUint32(i, true);
  let end = bytes.length - 22;
  while (end >= Math.max(0, bytes.length - 65557)) {
    if (u32(end) === 0x06054b50 && end + 22 + u16(end + 20) === bytes.length) {
      break;
    }
    end--;
  }
  if (end < Math.max(0, bytes.length - 65557) || u32(end + 4) || u16(end + 8) !== u16(end + 10)) {
    throw new Error('Missing ZIP directory or multi-disk ZIP');
  }
  const count = u16(end + 10);
  const directory = u32(end + 16);
  if (count > 8192 || directory + u32(end + 12) !== end) {
    throw new Error('Invalid ZIP directory size or entry count');
  }
  const records = new Map<
    string,
    { start: number; offset: number; stop: number; length: number; recordEnd: number; method: number; crc: number }
  >();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let at = directory;
  let assets = 0;
  let json = 0;
  for (let i = 0; i < count; i++) {
    if (u32(at) !== 0x02014b50 || u16(at + 34)) {
      throw new Error('Invalid or multi-disk ZIP entry');
    }
    const flags = u16(at + 8);
    const method = u16(at + 10);
    if (flags & ~0x80e || (method !== 0 && method !== 8)) {
      throw new Error('Encrypted or unsupported ZIP entry');
    }
    const size = u32(at + 20);
    const length = u32(at + 24);
    const nameSize = u16(at + 28);
    const name = decoder.decode(bytes.subarray(at + 46, at + 46 + nameSize));
    if (
      /^[A-Za-z]:|[\\\x00-\x1f]/.test(name) ||
      name
        .replace(/\/$/, '')
        .split('/')
        .some((part) => !part || part === '.' || part === '..') ||
      records.has(name)
    ) {
      throw new Error('Unsafe or duplicate ZIP path: ' + name);
    }
    if (name === 'manifest.json' || /^brushes\/[^/]+\.json$/.test(name)) {
      json += length;
      if (length > MiB || json > 1025 * MiB) {
        throw new Error('Brush JSON exceeds size limit: ' + name);
      }
    } else {
      assets += length;
      if (assets > 256 * MiB) {
        throw new Error('Expanded assets exceed archive limit');
      }
    }
    const start = u32(at + 42);
    const offset = start + 30 + u16(start + 26) + u16(start + 28);
    const crc = u32(at + 16);
    if (
      u32(start) !== 0x04034b50 ||
      u16(start + 6) !== flags ||
      u16(start + 8) !== method ||
      decoder.decode(bytes.subarray(start + 30, start + 30 + u16(start + 26))) !== name ||
      (!(flags & 8) && (u32(start + 14) !== crc || u32(start + 18) !== size || u32(start + 22) !== length)) ||
      offset + size > directory ||
      (method === 0 && size !== length)
    ) {
      throw new Error('Invalid ZIP local entry: ' + name);
    }
    let recordEnd = offset + size;
    if (flags & 8) {
      if (u32(recordEnd) === 0x08074b50) {
        recordEnd += 4;
      }
      if (u32(recordEnd) !== crc || u32(recordEnd + 4) !== size || u32(recordEnd + 8) !== length) {
        throw new Error('Invalid ZIP data descriptor: ' + name);
      }
      recordEnd += 12;
    }
    records.set(name, { start, offset, stop: offset + size, length, recordEnd, method, crc });
    at += 46 + nameSize + u16(at + 30) + u16(at + 32);
  }
  if (at !== end) {
    throw new Error('Invalid ZIP directory length');
  }
  let previous = 0;
  for (const record of [...records.values()].sort((a, b) => a.start - b.start)) {
    if (record.start !== previous) {
      throw new Error('Unlisted or overlapping ZIP entries');
    }
    previous = record.recordEnd;
  }
  if (previous !== directory) {
    throw new Error('Unlisted data before ZIP directory');
  }
  const files = new Map<string, Uint8Array>();
  for (const [name, entry] of records) {
    const packed = bytes.subarray(entry.offset, entry.stop);
    const data = entry.method === 0 ? packed.slice() : await inflate(packed, entry.length, 'deflate-raw');
    if (crc32(data) !== entry.crc) {
      throw new Error('Incorrect ZIP CRC: ' + name);
    }
    files.set(name, data);
  }
  return files;
}
