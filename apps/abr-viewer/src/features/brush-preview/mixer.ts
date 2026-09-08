import { mixerComposite, mixerDose, mixerPickupChannel, mixerReservoirChannel } from '@app-game/abr-brush/effects';
import { d } from 'typegpu';
import { retouchBounds, retouchFixture } from './retouch-image';
import { sampleBilinear, smudgeStep } from './smudge';
import { previewColor, stampStride, type PreviewInput, type PreviewStroke } from './stroke';

/** Per-stamp dynamics and capacity are evaluated once, independently of preview packet boundaries. */
export function mixerSteps(input: PreviewInput, stroke: PreviewStroke) {
  let remaining = input.values.tool.load / 100;
  return Array.from({ length: stroke.count }, (_, index) => {
    const step = smudgeStep(stroke, index);
    const dose = mixerDose(
      remaining,
      stroke.data[index * stampStride + 8]!,
      Math.hypot(step.x - step.sourceX, step.y - step.sourceY) / (step.radius * 2)
    );
    remaining = dose.remaining;
    return {
      ...step,
      sourceX: step.x,
      sourceY: step.y,
      region: { ...step.region, x: step.x - step.radius, y: step.y - step.radius },
      wet: stroke.mixing?.[index * 2] ?? input.values.tool.wetness / 100,
      mix: stroke.mixing?.[index * 2 + 1] ?? input.values.tool.mix / 100,
      flow: stroke.data[index * stampStride + 8]!,
      ...dose
    };
  });
}

/** Fresh, foreground-loaded wells and a two-layer sample for each independent preview gesture. */
export function renderMixerPixels(
  input: PreviewInput,
  stroke: PreviewStroke,
  mask: (stamp: PreviewStroke) => (pixel: number) => number
) {
  const { layer, below } = retouchFixture(input.width, input.height, input.dpr);
  const reservoir = new Float32Array(256 * 256 * 4),
    pickup = new Float32Array(reservoir.length),
    output = new Float32Array(reservoir.length);
  const color = previewColor(input.color);
  for (let i = 0; i < reservoir.length; i += 4) writeHalf(reservoir, i, d.vec4f(...color, 1));
  const canvas = new Float64Array(4),
    picked = new Float64Array(4),
    underlying = new Float64Array(4);
  let captured = new Uint8Array(0);
  for (const [index, step] of mixerSteps(input, stroke).entries()) {
    // Capture once, then sample the stored RGBA8 patch into the fixed-size wells.
    if (captured.length < step.size * step.size * 4) captured = new Uint8Array(step.size * step.size * 4);
    for (let y = 0; y < step.size; y++)
      for (let x = 0; x < step.size; x++) {
        const px = step.region.x + ((x + 0.5) / step.size) * step.region.width;
        const py = step.region.y + ((y + 0.5) / step.size) * step.region.height;
        sample(layer, input.width, input.height, px, py, canvas, false);
        for (let c = 0; c < 4; c++) canvas[c] = Math.round(canvas[c]!) / 255;
        if (input.values.tool.sampleAllLayers) {
          sample(below, input.width, input.height, px, py, underlying, false);
          const alpha = canvas[3]!;
          for (let c = 0; c < 4; c++) canvas[c] = canvas[c]! + (Math.round(underlying[c]!) / 255) * (1 - alpha);
        }
        for (let c = 0; c < 4; c++) captured[(y * step.size + x) * 4 + c] = Math.round(canvas[c]! * 255);
      }
    const uptake = step.wet * step.exchange,
      retention = 1 - step.flow * step.exchange * (1 - step.wet);
    const mix = step.wet > 0 ? step.mix : 0;
    for (let y = 0; y < 256; y++)
      for (let x = 0; x < 256; x++) {
        const i = (y * 256 + x) * 4;
        sample(
          captured,
          step.size,
          step.size,
          ((x + 0.5) / 256) * step.size,
          ((y + 0.5) / 256) * step.size,
          canvas,
          true
        );
        for (let c = 0; c < 4; c++)
          picked[c] = mixerPickupChannel(pickup[i + c]!, canvas[c]! / 255, canvas[3]! / 255, uptake, retention);
        const alpha = reservoir[i + 3]!;
        for (let c = 0; c < 3; c++)
          reservoir[i + c] = half(mixerReservoirChannel(reservoir[i + c]!, alpha, picked[c]!, picked[3]!, uptake));
        reservoir[i + 3] = half(alpha + (1 - alpha) * uptake * picked[3]!);
        for (let c = 0; c < 4; c++) {
          pickup[i + c] = half(picked[c]!);
          output[i + c] = half(reservoir[i + c]! * step.available * (1 - mix) + pickup[i + c]! * mix);
        }
      }
    const bounds = retouchBounds(input, stroke, index);
    if (!bounds) continue;
    const coverage = mask({ count: 1, data: stroke.data.subarray(index * stampStride, (index + 1) * stampStride) });
    const wellPixel = (x: number, y: number) =>
      pixel(output, (Math.max(0, Math.min(255, y)) * 256 + Math.max(0, Math.min(255, x))) * 4);
    for (let y = bounds.y; y < bounds.y + bounds.height; y++)
      for (let x = bounds.x; x < bounds.x + bounds.width; x++) {
        const i = y * input.width + x,
          amount = coverage(i);
        if (!amount) continue;
        const picked = sampleBilinear(
          wellPixel,
          ((x + 0.5 - step.region.x) / step.region.width) * 256,
          ((y + 0.5 - step.region.y) / step.region.height) * 256
        );
        const result = mixerComposite(pixel(layer, i * 4, 255), picked, amount);
        for (let c = 0; c < 4; c++) layer[i * 4 + c] = Math.round(result[c]! * 255);
      }
  }
  const result = new Uint8ClampedArray(layer.length);
  for (let i = 0; i < layer.length; i += 4) {
    for (let c = 0; c < 3; c++) result[i + c] = layer[i + c]! + below[i + c]! * (1 - layer[i + 3]! / 255);
    result[i + 3] = 255;
  }
  return result;
}

function pixel(pixels: Uint8Array | Float32Array, i: number, scale = 1) {
  return d.vec4f(pixels[i]! / scale, pixels[i + 1]! / scale, pixels[i + 2]! / scale, pixels[i + 3]! / scale);
}

/** Matches round-to-nearest-even RGBA16F well storage for finite values in [0,1]. */
function half(value: number) {
  float[0] = value;
  const bits = integer[0]!;
  const exponent = ((bits >>> 23) & 255) - 127;
  if (exponent < -25) return 0;
  const shift = Math.max(13, -exponent - 1);
  const mantissa = (bits & 0x7fffff) | 0x800000;
  const scale = 2 ** shift;
  const floor = Math.floor(mantissa / scale),
    fraction = mantissa / scale - floor;
  return (fraction === 0.5 ? floor + (floor % 2) : Math.round(mantissa / scale)) * 2 ** Math.max(-24, exponent - 10);
}
function writeHalf(pixels: Float32Array, i: number, value: d.v4f) {
  for (let c = 0; c < 4; c++) pixels[i + c] = half(value[c]!);
}
const float = new Float32Array(1),
  integer = new Uint32Array(float.buffer);

/** Allocation-free bilinear sampling. Captures use transparent borders; well sampling clamps to the patch. */
function sample(
  pixels: Uint8Array,
  width: number,
  height: number,
  x: number,
  y: number,
  out: Float64Array,
  clamp: boolean
) {
  const left = Math.floor(x - 0.5),
    top = Math.floor(y - 0.5),
    fx = x - 0.5 - left,
    fy = y - 0.5 - top;
  out.fill(0);
  for (let dy = 0; dy < 2; dy++)
    for (let dx = 0; dx < 2; dx++) {
      let px = left + dx,
        py = top + dy;
      if (clamp) {
        px = Math.max(0, Math.min(width - 1, px));
        py = Math.max(0, Math.min(height - 1, py));
      } else if (px < 0 || py < 0 || px >= width || py >= height) continue;
      const weight = (dx ? fx : 1 - fx) * (dy ? fy : 1 - fy),
        i = (py * width + px) * 4;
      for (let c = 0; c < 4; c++) out[c] = out[c]! + pixels[i + c]! * weight;
    }
}
