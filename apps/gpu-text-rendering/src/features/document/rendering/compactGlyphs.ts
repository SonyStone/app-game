/**
 * Packs six legacy vertices into one 28-byte instance without requantizing coordinates.
 * Four original corners preserve skew, signed-normalized endpoints and i16 wrapping exactly.
 * Page ranges retain their legacy vertex units.
 */
export function compactGlyphs(vertices: ArrayBuffer, pages: readonly { beginVertex: number; endVertex: number }[]) {
  if (vertices.byteLength % 72 !== 0) throw new Error('Invalid glyph vertex length');
  const source = new Uint32Array(vertices);
  const packed = new Uint32Array((vertices.byteLength / 72) * 7);
  for (const [pageIndex, page] of pages.entries()) {
    for (let glyph = page.beginVertex / 6; glyph < page.endVertex / 6; glyph++) {
      const from = glyph * 18;
      const to = glyph * 7;
      packed[to] = source[from]!;
      packed[to + 1] = source[from + 3]!;
      packed[to + 2] = source[from + 6]!;
      packed[to + 3] = source[from + 9]!;
      packed[to + 4] = source[from + 1]!;
      packed[to + 5] = source[from + 2]!;
      packed[to + 6] = pageIndex;
    }
  }
  return packed.buffer;
}
