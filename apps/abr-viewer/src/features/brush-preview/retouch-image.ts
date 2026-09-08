import { stampStride, type PreviewInput, type PreviewStroke } from './stroke';

/** Pixel ramps expose blur/sharpen ringing; the translucent middle band exposes Sample All Layers. */
export function retouchFixture(width: number, height: number, dpr: number) {
  const layer = new Uint8Array(width * height * 4),
    below = new Uint8Array(layer.length);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const gray = 50 + (Math.floor(x / dpr) % 32) * 4;
      const alpha = y > height * 0.35 && y < height * 0.65 ? 128 : 255;
      const value = Math.round((gray * alpha) / 255);
      layer[i] = value;
      layer[i + 1] = value;
      layer[i + 2] = value;
      layer[i + 3] = alpha;
      const stripe = Math.floor(y / (8 * dpr)) % 2;
      below[i] = stripe ? 55 : 170;
      below[i + 1] = stripe ? 100 : 115;
      below[i + 2] = stripe ? 145 : 60;
      below[i + 3] = 255;
    }
  return { layer, below };
}

/** Includes every stamp pixel; callers add a one-pixel source halo before modifying the destination. */
export function retouchBounds(input: Pick<PreviewInput, 'width' | 'height'>, stroke: PreviewStroke, index: number) {
  const offset = index * stampStride,
    data = stroke.data;
  const rx = data[offset + 2]!,
    ry = data[offset + 3]!,
    cos = data[offset + 4]!,
    sin = data[offset + 5]!;
  const ex = Math.abs(cos * rx) + Math.abs(sin * ry),
    ey = Math.abs(sin * rx) + Math.abs(cos * ry);
  const x = Math.max(0, Math.floor(data[offset]! - ex)),
    y = Math.max(0, Math.floor(data[offset + 1]! - ey));
  const width = Math.min(input.width, Math.ceil(data[offset]! + ex)) - x;
  const height = Math.min(input.height, Math.ceil(data[offset + 1]! + ey)) - y;
  return width > 0 && height > 0 ? { x, y, width, height } : undefined;
}
