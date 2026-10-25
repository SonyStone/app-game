import { maxChroma } from './oklch';

/** Paints the OKLCH disk, reusing geometry and ImageData until its backing width changes. */
export function paintDisk(canvas: HTMLCanvasElement, lightness: number) {
  const context = canvas.getContext('2d');
  if (!context || !canvas.width) {
    return;
  }

  let cache = disks.get(canvas);
  if (!cache || cache.image.width !== canvas.width) {
    cache = prepareDisk(context, canvas.width);
    disks.set(canvas, cache);
  }

  const { image, coefficients, hues, most } = cache;
  for (let h = 0; h <= 360; h++) {
    most[h] = maxChroma(lightness, h);
  }

  const data = image.data;
  for (let i = 0; i < hues.length; i++) {
    const at = i * 4;
    if (!data[at + 3]) {
      continue;
    }

    const chroma = most[hues[i]!]!;
    const a = lightness + coefficients[i * 3]! * chroma;
    const b = lightness + coefficients[i * 3 + 1]! * chroma;
    const c = lightness + coefficients[i * 3 + 2]! * chroma;
    const l = a * a * a;
    const m = b * b * b;
    const s = c * c * c;
    data[at] = encoded(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s);
    data[at + 1] = encoded(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s);
    data[at + 2] = encoded(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s);
  }

  context.putImageData(image, 0, 0);
}

function prepareDisk(context: CanvasRenderingContext2D, size: number) {
  const image = context.createImageData(size, size);
  const coefficients = new Float32Array(size * size * 3);
  const hues = new Uint16Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = ((x + 0.5) / size) * 2 - 1;
      const dy = ((y + 0.5) / size) * 2 - 1;
      const radius = Math.hypot(dx, dy);
      const i = y * size + x;
      image.data[i * 4 + 3] = Math.min(1, Math.max(0, (1 - radius) * (size / 2) + 0.5)) * 255;
      const hue = (Math.atan2(dx, -dy) + Math.PI * 2) % (Math.PI * 2);
      hues[i] = Math.round((hue * 180) / Math.PI);
      // Hue is measured clockwise from the top, hence cos(h) = -dy/r and sin(h) = dx/r.
      const factor = radius ? Math.min(1, radius) / radius : 0;
      const a = -dy * factor;
      const b = dx * factor;
      coefficients[i * 3] = 0.3963377774 * a + 0.2158037573 * b;
      coefficients[i * 3 + 1] = -0.1055613458 * a - 0.0638541728 * b;
      coefficients[i * 3 + 2] = -0.0894841775 * a - 1.291485548 * b;
    }
  }

  return { image, coefficients, hues, most: new Float64Array(361) };
}

const disks = new WeakMap<HTMLCanvasElement, ReturnType<typeof prepareDisk>>();

/** A 16-bit linear-light table limits encoded-channel error to less than 0.03 of an 8-bit step. */
const transfer = Float32Array.from({ length: 65537 }, (_, i) => {
  const v = i / 65536;
  return 255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055);
});

function encoded(linear: number) {
  return transfer[Math.min(65536, Math.max(0, Math.round(linear * 65536)))]!;
}
