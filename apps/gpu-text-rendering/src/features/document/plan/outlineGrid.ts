/**
 * Packs 32×32 cells into two bits each: empty, full, or boundary.
 * Monotone endpoint bounds conservatively mark boundaries; winding is exact in all remaining cells.
 */
export function outlineGrid(curves: Float32Array, first: number, count: number, rule: number) {
  const boundary = new Uint8Array(32 * 32);
  const winding = new Int32Array(32 * 33);

  for (let i = first; i < first + count; i++) {
    let x = curves[i * 8]!;
    let y = curves[i * 8 + 1]!;

    // Subdivision only tightens conservative monotone bounds; it never replaces rendered cubics.
    for (let part = 1; part <= 32; part++) {
      const t = part / 32;
      const nextX = coordinate(curves, i * 8, t);
      const nextY = coordinate(curves, i * 8 + 1, t);
      addBoundary(x, y, nextX, nextY);
      x = nextX;
      y = nextY;
    }
  }

  const packed = new Uint32Array(64);

  for (let y = 0; y < 32; y++) {
    let value = 0;

    for (let x = 0; x < 32; x++) {
      value += winding[y * 33 + x]!;
      const cell = y * 32 + x;
      const inside = rule === 1 ? Math.abs(value) % 2 !== 0 : value !== 0;
      const state = boundary[cell] ? 2 : Number(inside);
      packed[cell >>> 4]! |= state << ((cell & 15) * 2);
    }
  }

  return packed;

  function addBoundary(x0: number, y0: number, x1: number, y1: number) {
    const lowX = Math.max(0, Math.min(31, Math.floor((Math.min(x0, x1) - 1e-6) * 32)));
    const highX = Math.max(0, Math.min(31, Math.floor((Math.max(x0, x1) + 1e-6) * 32)));
    const lowY = Math.max(0, Math.min(31, Math.floor((Math.min(y0, y1) - 1e-6) * 32)));
    const highY = Math.max(0, Math.min(31, Math.floor((Math.max(y0, y1) + 1e-6) * 32)));

    for (let row = lowY; row <= highY; row++) {
      boundary.fill(1, row * 32 + lowX, row * 32 + highX + 1);
      const y = (row + 0.5) / 32;

      if (y >= Math.min(y0, y1) && y < Math.max(y0, y1)) {
        const firstRightCell = Math.max(0, Math.min(32, Math.ceil(Math.max(x0, x1) * 32 - 0.5)));
        winding[row * 33 + firstRightCell]! += y1 > y0 ? 1 : -1;
      }
    }
  }
}

function coordinate(curves: Float32Array, offset: number, t: number) {
  const s = 1 - t;
  return (
    s * s * s * curves[offset]! +
    3 * s * s * t * curves[offset + 2]! +
    3 * s * t * t * curves[offset + 4]! +
    t * t * t * curves[offset + 6]!
  );
}
