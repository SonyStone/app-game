import { triangleCorners } from './triangleGeometry';

/**
 * Paints the triangle into the canvas with its hue corner toward `angle` on the ring and the pure color of RGB hue
 * `hue` there: each pixel mixes the hue, white and black by its barycentric weights, in encoded sRGB as HSV defines
 * it; edges are antialiased over one canvas pixel.
 */
export function paintTriangle(canvas: HTMLCanvasElement, angle: number, hue = angle) {
  const context = canvas.getContext('2d');
  if (!context) {
    return;
  }

  const pixels = canvas.width;
  let image = images.get(canvas);
  if (!image || image.width !== pixels) {
    image = context.createImageData(pixels, pixels);
    images.set(canvas, image);
  }

  image.data.fill(0);
  const scale = size / pixels;
  const [hr, hg, hb] = [5, 3, 1].map((n) => {
    const k = (n + hue / 60) % 6;
    return 255 * (1 - Math.max(0, Math.min(k, 4 - k, 1)));
  }) as [number, number, number];
  const { hue: p, white: q, black: r } = triangleCorners(angle, triangleRadius);
  const area = (q.x - p.x) * (r.y - p.y) - (r.x - p.x) * (q.y - p.y);
  const height = 1.5 * triangleRadius;
  // A rotated triangle covers only a fraction of the square canvas. Scan its bounding rectangle and
  // advance the barycentric weights along the row instead of dividing twice for every canvas pixel.
  const left = Math.max(0, Math.floor((Math.min(p.x, q.x, r.x) + size / 2) / scale - 1));
  const right = Math.min(pixels, Math.ceil((Math.max(p.x, q.x, r.x) + size / 2) / scale + 1));
  const top = Math.max(0, Math.floor((Math.min(p.y, q.y, r.y) + size / 2) / scale - 1));
  const bottom = Math.min(pixels, Math.ceil((Math.max(p.y, q.y, r.y) + size / 2) / scale + 1));
  const stepA = ((q.y - r.y) * scale) / area;
  const stepB = ((r.y - p.y) * scale) / area;
  const px = (left + 0.5) * scale - size / 2;
  for (let y = top; y < bottom; y++) {
    const py = (y + 0.5) * scale - size / 2;
    let wa = ((q.x - px) * (r.y - py) - (r.x - px) * (q.y - py)) / area;
    let wb = ((r.x - px) * (p.y - py) - (p.x - px) * (r.y - py)) / area;
    for (let x = left; x < right; x++, wa += stepA, wb += stepB) {
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

const size = 220;
const triangleRadius = 84;
const images = new WeakMap<HTMLCanvasElement, ImageData>();
