/** A face in an original sfnt or TTC/OTC file, without extracting or rewriting its bytes. */
export type FontFileFace = {
  /** PostScript name from the face's name table, not a CSS family name. */
  name: string;
  /** Original zero-based face index, zero for standalone sfnt files. */
  faceIndex: number;
  /** Outline format indicated by the sfnt signature; outline support is checked by WASM. */
  format: 'TrueType' | 'CFF';
};

/**
 * Reads every face's PostScript identity and original collection index. Throws for malformed files, unsupported
 * sfnt signatures or faces without a readable PostScript name. This inspects metadata only, not font outlines.
 */
export function fontFileFaces(bytes: Uint8Array): FontFileFace[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const collection = view.getUint32(0) === 0x74746366;
  const count = collection ? view.getUint32(8) : 1;
  if (!count || (collection && count > Math.floor((bytes.length - 12) / 4))) {
    throw new Error('invalid font collection directory');
  }

  return Array.from({ length: count }, (_, faceIndex) => {
    const offset = collection ? view.getUint32(12 + faceIndex * 4) : 0;
    const signature = view.getUint32(offset);
    if (![0x00010000, 0x74727565, 0x4f54544f].includes(signature)) {
      throw new Error('expected a TrueType or OpenType font file');
    }

    const tableCount = view.getUint16(offset + 4);
    if (offset + 12 + tableCount * 16 > bytes.length) {
      throw new Error('invalid font table directory');
    }

    let name: string | undefined;
    let priority = -1;
    for (let table = 0; table < tableCount; table++) {
      const record = offset + 12 + table * 16;
      if (view.getUint32(record) !== 0x6e616d65) {
        continue;
      }

      const start = view.getUint32(record + 8);
      const length = view.getUint32(record + 12);
      if (start + length > bytes.length || length < 6) {
        throw new Error('invalid font name table');
      }

      const names = new DataView(bytes.buffer, bytes.byteOffset + start, length);
      const strings = names.getUint16(4);
      for (let entry = 0; entry < names.getUint16(2); entry++) {
        const position = 6 + entry * 12;
        const platform = names.getUint16(position);
        if (names.getUint16(position + 6) !== 6 || ![0, 1, 3].includes(platform)) {
          continue;
        }

        const size = names.getUint16(position + 8);
        const from = strings + names.getUint16(position + 10);
        if (from + size > length) {
          throw new Error('invalid PostScript name range');
        }

        const candidate = platform === 1 ? 1 : 2;
        if (candidate <= priority) {
          continue;
        }

        const data = bytes.subarray(start + from, start + from + size);
        const decoded = new TextDecoder(platform === 1 ? 'macintosh' : 'utf-16be').decode(data);
        if (decoded && /^[\x21-\x7e]+$/.test(decoded)) {
          name = decoded;
          priority = candidate;
        }
      }
    }

    if (!name) {
      throw new Error(`font face ${faceIndex} has no readable PostScript name`);
    }

    return { name, faceIndex, format: signature === 0x4f54544f ? 'CFF' : 'TrueType' };
  });
}
