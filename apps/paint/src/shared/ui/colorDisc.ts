/**
 * The geometry of the color Disc's inner circle: a saturation × brightness square (saturation left to right,
 * brightness bottom to top) stretched onto a disc with the elliptical grid mapping, so that white, the pure hue and
 * black all lie on the rim (white at the upper left, the hue at the upper right, black along the bottom). Square
 * and disc coordinates both run −1…1, y down.
 */

/** The disc point of a saturation (0–1) and a brightness (0–1). */
export function discPoint(saturation: number, value: number) {
  const x = saturation * 2 - 1;
  const y = 1 - value * 2;
  return { u: x * Math.sqrt(1 - (y * y) / 2), v: y * Math.sqrt(1 - (x * x) / 2) };
}

/** The saturation and brightness at a disc point; points outside the disc count as their nearest rim point. */
export function discColor(u: number, v: number) {
  const length = Math.hypot(u, v);
  if (length > 1) {
    u /= length;
    v /= length;
  }

  const { x, y } = squareOf(u, v);
  return { saturation: (x + 1) / 2, value: (1 - y) / 2 };
}

/**
 * Paints the inner circle for `hue` (degrees) into a square canvas of `size` device pixels. Corners outside the
 * circle repeat the rim, so that a CSS circle clip gets a clean edge.
 */
export function paintDisc(canvas: HTMLCanvasElement, hue: number, size: number) {
  if (canvas.width !== size || canvas.height !== size) {
    canvas.width = size;
    canvas.height = size;
  }

  const context = canvas.getContext('2d');
  if (!context || !size) {
    return;
  }

  let cache = discs.get(canvas);
  if (!cache || cache.image.width !== size) {
    cache = prepareDisc(context, size);
    discs.set(canvas, cache);
  }

  const { image, values, chromas } = cache;
  const channel = (n: number) => {
    const k = (n + hue / 60) % 6;
    return Math.max(0, Math.min(k, 4 - k, 1));
  };
  const r = channel(5);
  const g = channel(3);
  const b = channel(1);
  for (let i = 0; i < values.length; i++) {
    const at = i * 4;
    image.data[at] = values[i]! - chromas[i]! * r;
    image.data[at + 1] = values[i]! - chromas[i]! * g;
    image.data[at + 2] = values[i]! - chromas[i]! * b;
  }

  context.putImageData(image, 0, 0);
}

/** The inverse of the elliptical grid mapping: the square point of a disc point. */
function squareOf(u: number, v: number) {
  const root = (value: number) => Math.sqrt(Math.max(0, value));
  const twoRoot2 = 2 * Math.SQRT2;
  const uu = u * u;
  const vv = v * v;
  const x = 0.5 * root(2 + uu - vv + twoRoot2 * u) - 0.5 * root(2 + uu - vv - twoRoot2 * u);
  const y = 0.5 * root(2 - uu + vv + twoRoot2 * v) - 0.5 * root(2 - uu + vv - twoRoot2 * v);
  return { x: Math.min(1, Math.max(-1, x)), y: Math.min(1, Math.max(-1, y)) };
}

function prepareDisc(context: CanvasRenderingContext2D, size: number) {
  const image = context.createImageData(size, size);
  const values = new Float32Array(size * size);
  const chromas = new Float32Array(size * size);
  const half = size / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const { saturation, value } = discColor((x + 0.5 - half) / half, (y + 0.5 - half) / half);
      const i = y * size + x;
      values[i] = value * 255;
      chromas[i] = value * saturation * 255;
      image.data[i * 4 + 3] = 255;
    }
  }

  return { image, values, chromas };
}

const discs = new WeakMap<HTMLCanvasElement, ReturnType<typeof prepareDisc>>();
