import { expect, it } from 'vitest';
import { compactGlyphs } from './compactGlyphs';

it('reconstructs every original vertex byte, including skew, signed extrema and alpha', () => {
  const source = new ArrayBuffer(2 * 72);
  const data = new DataView(source);
  const corners = [
    [-32768, 32767],
    [170, -231],
    [-907, 317],
    [32767, -32768]
  ];
  const order = [0, 1, 2, 3, 2, 1];
  for (let glyph = 0; glyph < 2; glyph++) {
    order.forEach((corner, vertex) => {
      const at = glyph * 72 + vertex * 12;
      data.setInt16(at, corners[corner]![0]!, true);
      data.setInt16(at + 2, corners[corner]![1]!, true);
      data.setUint16(at + 4, 65532 + (corner & 1), true);
      data.setUint16(at + 6, 32766 + (corner >> 1), true);
      data.setUint32(at + 8, 0x7f123456 + glyph, true);
    });
  }
  const packed = new DataView(
    compactGlyphs(source, [
      { beginVertex: 0, endVertex: 6 },
      { beginVertex: 6, endVertex: 12 }
    ])
  );
  expect(packed.byteLength).toBe(56);
  for (let glyph = 0; glyph < 2; glyph++) {
    expect(packed.getUint32(glyph * 28 + 24, true)).toBe(glyph);
    order.forEach((corner, vertex) => {
      const at = glyph * 72 + vertex * 12;
      expect(packed.getUint32(glyph * 28 + corner * 4, true)).toBe(data.getUint32(at, true));
      expect(packed.getUint16(glyph * 28 + 16, true) + (corner & 1)).toBe(data.getUint16(at + 4, true));
      expect(packed.getUint16(glyph * 28 + 18, true) + (corner >> 1)).toBe(data.getUint16(at + 6, true));
      expect(packed.getUint32(glyph * 28 + 20, true)).toBe(data.getUint32(at + 8, true));
    });
  }
});
