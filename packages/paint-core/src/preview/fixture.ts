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
