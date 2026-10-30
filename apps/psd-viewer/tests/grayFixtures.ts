/** Covers every byte and all 65,536 16-bit gray codes without an embedded profile. */
export function grayRamp(depth: 8 | 16): Uint8Array {
  const width = depth === 8 ? 256 : 65536;
  const bytes = new Uint8Array(40 + (width * depth) / 8);
  const view = new DataView(bytes.buffer);
  bytes.set(new TextEncoder().encode('8BPS'));
  view.setUint16(4, 1);
  view.setUint16(12, 1);
  view.setUint32(14, 1);
  view.setUint32(18, width);
  view.setUint16(22, depth);
  view.setUint16(24, 1);
  for (let index = 0; index < width; index++) {
    if (depth === 8) {
      bytes[40 + index] = index;
    } else {
      view.setUint16(40 + index * 2, index);
    }
  }
  return bytes;
}
