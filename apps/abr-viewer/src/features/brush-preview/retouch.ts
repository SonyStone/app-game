import {
  decodePremultiplied,
  encodePremultiplied,
  fingerPaintCompositeInSpace,
  retouchColor,
  retouchCompositeInSpace
} from '@app-game/abr-brush/effects';
import { paintModes } from '@app-game/abr-brush/paintBlend';
import { d, std } from 'typegpu';
import { renderMixerPixels } from './mixer';
import { retouchBounds, retouchFixture } from './retouch-image';
import { smudgePickup, smudgeSourceBounds, smudgeStep } from './smudge';
import { stampStride, type PreviewInput, type PreviewStroke } from './stroke';

/** Resource swatches bypass image retouching even when the owning preset is a retouch tool. */
export function isRetouch(input: PreviewInput) {
  return !input.resourcePreview && ['BlTl', 'ShTl', 'SmTl', 'MixB'].includes(input.values.tool.type);
}

/** Replays actual stamp order over a two-layer fixture; masks are supplied by the ordinary CPU rasterizer. */
export function renderRetouchPixels(
  input: PreviewInput,
  stroke: PreviewStroke,
  mask: (stamp: PreviewStroke) => (pixel: number) => number
) {
  if (input.values.tool.type === 'MixB') return renderMixerPixels(input, stroke, mask);
  const linear = input.colorMixing === 'linear';
  const { layer, below } = retouchFixture(input.width, input.height, input.dpr);
  const snapshot = new Uint8Array(layer.length);
  const mode = Math.max(
    0,
    paintModes.findIndex((mode) => mode === input.values.tool.mode)
  );
  for (let stamp = 0; stamp < stroke.count; stamp++) {
    const bounds = retouchBounds(input, stroke, stamp);
    if (!bounds || input.values.tool.strength === 0) continue;
    const smudge = input.values.tool.type === 'SmTl';
    if (smudge && stamp === 0 && !input.values.tool.fingerPainting) continue;
    const coverage = mask({ count: 1, data: stroke.data.subarray(stamp * stampStride, (stamp + 1) * stampStride) });
    const left = Math.max(0, bounds.x - 1),
      right = Math.min(input.width, bounds.x + bounds.width + 1);
    for (let y = Math.max(0, bounds.y - 1); y < Math.min(input.height, bounds.y + bounds.height + 1); y++) {
      const start = (y * input.width + left) * 4;
      snapshot.set(layer.subarray(start, (y * input.width + right) * 4), start);
    }
    const step = smudge ? smudgeStep(stroke, stamp) : undefined;
    const sourceBounds = step && smudgeSourceBounds(input, step);
    if (sourceBounds)
      for (let y = sourceBounds.y; y < sourceBounds.y + sourceBounds.height; y++) {
        const start = (y * input.width + sourceBounds.x) * 4;
        snapshot.set(layer.subarray(start, start + sourceBounds.width * 4), start);
      }
    const source = (pixels: Uint8Array) => (x: number, y: number) =>
      x < 0 || y < 0 || x >= input.width || y >= input.height
        ? d.vec4f(0)
        : readPixel(pixels, (y * input.width + x) * 4);
    const pickup = step && smudgePickup(input, step, source(snapshot), source(below));
    const read = (x: number, y: number) => {
      const i =
        (Math.max(0, Math.min(input.height - 1, y)) * input.width + Math.max(0, Math.min(input.width - 1, x))) * 4;
      const pixel = readPixel(snapshot, i);
      return input.values.tool.sharpenAllLayers
        ? quantize(std.add(pixel, std.mul(readPixel(below, i), 1 - pixel.a)))
        : pixel;
    };
    for (let y = bounds.y; y < bounds.y + bounds.height; y++) {
      for (let x = bounds.x; x < bounds.x + bounds.width; x++) {
        const i = y * input.width + x;
        const amount = (coverage(i) * input.values.tool.strength) / 100;
        if (amount === 0) continue;
        if (pickup) {
          const base = readPixel(snapshot, i * 4);
          const colorOffset = stamp * stampStride + 12;
          const result =
            stamp === 0
              ? fingerPaintCompositeInSpace(
                  base,
                  d.vec3f(stroke.data[colorOffset]!, stroke.data[colorOffset + 1]!, stroke.data[colorOffset + 2]!),
                  amount,
                  mode,
                  linear
                )
              : retouchCompositeInSpace(base, pickup(x, y), amount, mode, linear);
          for (let c = 0; c < 4; c++) layer[i * 4 + c] = Math.round(result[c]! * 255);
          continue;
        }
        let blurred = d.vec4f(0),
          low = d.vec3f(1),
          high = d.vec3f(0);
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const sample = read(x + dx, y + dy);
            const pixel = linear ? decodePremultiplied(sample) : sample;
            blurred = std.add(blurred, std.mul(pixel, ((dx === 0 ? 2 : 1) * (dy === 0 ? 2 : 1)) / 16));
            const rgb = std.div(pixel.rgb, Math.max(0.00001, pixel.a));
            low = std.min(low, rgb);
            high = std.max(high, rgb);
          }
        // Paint stores the filtered patch in RGBA8 before blending it onto the active layer.
        const filtered = retouchColor(
          linear ? decodePremultiplied(read(x, y)) : read(x, y),
          blurred,
          low,
          high,
          input.values.tool.type === 'ShTl',
          input.values.tool.protectDetail
        );
        const picked = quantize(linear ? encodePremultiplied(filtered) : filtered);
        const result = retouchCompositeInSpace(readPixel(snapshot, i * 4), picked, amount, mode, linear);
        for (let c = 0; c < 4; c++) layer[i * 4 + c] = Math.round(result[c]! * 255);
      }
    }
  }
  const output = new Uint8ClampedArray(layer.length);
  for (let i = 0; i < layer.length; i += 4) {
    const alpha = layer[i + 3]! / 255;
    for (let c = 0; c < 3; c++) output[i + c] = layer[i + c]! + below[i + c]! * (1 - alpha);
    output[i + 3] = 255;
  }
  return output;
}

function readPixel(pixels: Uint8Array, offset: number) {
  return d.vec4f(
    pixels[offset]! / 255,
    pixels[offset + 1]! / 255,
    pixels[offset + 2]! / 255,
    pixels[offset + 3]! / 255
  );
}

/** RGBA8 intermediate storage, matching the texture used by Paint. */
function quantize(pixel: d.v4f) {
  return d.vec4f(
    Math.round(pixel.x * 255) / 255,
    Math.round(pixel.y * 255) / 255,
    Math.round(pixel.z * 255) / 255,
    Math.round(pixel.w * 255) / 255
  );
}
