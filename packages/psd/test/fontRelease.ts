/**
 * Copies a standalone sfnt with every version name replaced by Xs, preserving its identity, outlines and table sizes.
 * Tests can diagnose a different release without copying or changing the installed font file.
 * Throws when the font has no version name to replace.
 */
export function withDifferentFontVersion(bytes: ArrayBuffer): ArrayBuffer {
  const patched = bytes.slice(0);
  const view = new DataView(patched);
  let changed = false;
  for (let table = 0; table < view.getUint16(4); table++) {
    const record = 12 + table * 16;
    if (view.getUint32(record) !== 0x6e616d65) {
      continue;
    }

    const offset = view.getUint32(record + 8);
    const strings = offset + view.getUint16(offset + 4);
    for (let name = 0; name < view.getUint16(offset + 2); name++) {
      const entry = offset + 6 + name * 12;
      if (view.getUint16(entry + 6) !== 5) {
        continue;
      }

      const platform = view.getUint16(entry);
      const stride = platform === 0 || platform === 3 ? 2 : 1;
      const start = strings + view.getUint16(entry + 10);
      const length = view.getUint16(entry + 8);
      for (let index = 0; index < length; index += stride) {
        if (stride === 2) {
          view.setUint16(start + index, 0x0058);
        } else {
          view.setUint8(start + index, 0x58);
        }
      }

      changed = true;
    }
  }

  if (!changed) {
    throw new Error('font has no version name');
  }

  return patched;
}
