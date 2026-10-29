/** Builds metadata-only sfnt/TTC bytes for parser and host-call tests, with no third-party font data. */
export function fontMetadata(names: string[], collection = false): Uint8Array {
  const header = collection ? 12 + names.length * 4 : 0;
  const faceSize = 256;
  const bytes = new Uint8Array(header + faceSize * names.length);
  const view = new DataView(bytes.buffer);
  if (collection) {
    view.setUint32(0, 0x74746366);
    view.setUint32(4, 0x00010000);
    view.setUint32(8, names.length);
  }

  names.forEach((name, index) => {
    const offset = header + index * faceSize;
    if (collection) {
      view.setUint32(12 + index * 4, offset);
    }

    view.setUint32(offset, 0x00010000);
    view.setUint16(offset + 4, 1);
    view.setUint32(offset + 12, 0x6e616d65);
    const table = offset + 28;
    view.setUint32(offset + 20, table);
    view.setUint32(offset + 24, 18 + name.length * 2);
    view.setUint16(table + 2, 1);
    view.setUint16(table + 4, 18);
    view.setUint16(table + 6, 3);
    view.setUint16(table + 8, 1);
    view.setUint16(table + 10, 0x0409);
    view.setUint16(table + 12, 6);
    view.setUint16(table + 14, name.length * 2);
    [...name].forEach((character, unit) => view.setUint16(table + 18 + unit * 2, character.charCodeAt(0)));
  });
  return bytes;
}
