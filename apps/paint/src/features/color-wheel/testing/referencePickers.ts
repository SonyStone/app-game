// Frozen pre-optimization pixel oracle. Keep independent of the optimized renderers.
import { discColor } from '../../../shared/ui/colorDisc';
import { triangleCorners } from '../../hue-triangle/triangleGeometry';
import { maxChroma, oklchToRgb } from '../oklch';
const size = 220;
const triangleRadius = 84;
export function referenceDisk(canvas: HTMLCanvasElement, l: number) {
  const context = canvas.getContext('2d');
  if (!context) {
    return;
  }

  const size = canvas.width;
  const image = context.createImageData(size, size);
  const most = Array.from({ length: 361 }, (_, hue) => maxChroma(l, hue));
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = ((x + 0.5) / size) * 2 - 1,
        dy = ((y + 0.5) / size) * 2 - 1;
      const radius = Math.hypot(dx, dy);
      const coverage = Math.min(1, Math.max(0, (1 - radius) * (size / 2) + 0.5));
      if (coverage <= 0) {
        continue;
      }

      const hue = ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360;
      const [r, g, b] = oklchToRgb(l, Math.min(1, radius) * most[Math.round(hue)]!, hue);
      const index = (y * size + x) * 4;
      image.data[index] = r * 255;
      image.data[index + 1] = g * 255;
      image.data[index + 2] = b * 255;
      image.data[index + 3] = coverage * 255;
    }
  }

  context.putImageData(image, 0, 0);
}

export function referenceTriangle(canvas: HTMLCanvasElement, angle: number, hue: number) {
  const context = canvas.getContext('2d');
  if (!context) {
    return;
  }

  const pixels = canvas.width;
  const image = context.createImageData(pixels, pixels);
  const scale = size / pixels;
  const [hr, hg, hb] = [5, 3, 1].map((n) => {
    const k = (n + hue / 60) % 6;
    return 255 * (1 - Math.max(0, Math.min(k, 4 - k, 1)));
  }) as [number, number, number];
  const { hue: p, white: q, black: r } = triangleCorners(angle, triangleRadius);
  const area = (q.x - p.x) * (r.y - p.y) - (r.x - p.x) * (q.y - p.y);
  const height = 1.5 * triangleRadius;
  for (let y = 0; y < pixels; y++) {
    const py = (y + 0.5) * scale - size / 2;
    for (let x = 0; x < pixels; x++) {
      const px = (x + 0.5) * scale - size / 2;
      const wa = ((q.x - px) * (r.y - py) - (r.x - px) * (q.y - py)) / area;
      const wb = ((r.x - px) * (p.y - py) - (p.x - px) * (r.y - py)) / area;
      const inside = Math.min(wa, wb, 1 - wa - wb) * height;
      const alpha = Math.min(1, Math.max(0, inside / scale + 0.5));
      if (!alpha) {
        continue;
      }

      const a = Math.max(0, wa),
        b = Math.max(0, wb);
      const index = (y * pixels + x) * 4;
      image.data[index] = a * hr + b * 255;
      image.data[index + 1] = a * hg + b * 255;
      image.data[index + 2] = a * hb + b * 255;
      image.data[index + 3] = alpha * 255;
    }
  }

  context.putImageData(image, 0, 0);
}
export function referenceDisc(canvas: HTMLCanvasElement, hue: number, size: number) {
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d')!;
  const image = context.createImageData(size, size);
  const half = size / 2;
  for (let row = 0; row < size; row++) {
    for (let column = 0; column < size; column++) {
      const { saturation, value } = discColor((column + 0.5 - half) / half, (row + 0.5 - half) / half);
      const at = (row * size + column) * 4;
      hsvChannels(hue, saturation, value, image.data, at);
      image.data[at + 3] = 255;
    }
  }

  context.putImageData(image, 0, 0);
}

/** Writes the 8-bit RGB of an HSV color into `target` at `at`. */
function hsvChannels(hue: number, saturation: number, value: number, target: Uint8ClampedArray, at: number) {
  const channel = (n: number) => {
    const k = (n + hue / 60) % 6;
    return (value - value * saturation * Math.max(0, Math.min(k, 4 - k, 1))) * 255;
  };
  target[at] = channel(5);
  target[at + 1] = channel(3);
  target[at + 2] = channel(1);
}
