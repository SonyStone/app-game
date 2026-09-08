import { mixPremultiplied, planCanvasPickup } from '@app-game/abr-brush/effects';
import { d, std } from 'typegpu';
import { stampStride, type PreviewInput, type PreviewStroke } from './stroke';

/** The same bounding-circle capture and allocation buckets used by Paint's canvas pickup. */
export function smudgeStep(stroke: PreviewStroke, index: number) {
  const offset = index * stampStride,
    previous = Math.max(0, index - 1) * stampStride;
  const x = stroke.data[offset]!,
    y = stroke.data[offset + 1]!;
  const radius = Math.max(1, Math.hypot(stroke.data[offset + 2]!, stroke.data[offset + 3]!));
  const sourceX = stroke.data[previous]!,
    sourceY = stroke.data[previous + 1]!;
  const region = { x: sourceX - radius, y: sourceY - radius, width: radius * 2, height: radius * 2 };
  return { x, y, radius, sourceX, sourceY, region, size: planCanvasPickup(region, 1024).width };
}

/** Captured texels are RGBA8, then sampled linearly during transfer to the destination stamp. */
export function smudgePickup(
  input: PreviewInput,
  step: ReturnType<typeof smudgeStep>,
  active: (x: number, y: number) => d.v4f,
  below: (x: number, y: number) => d.v4f
) {
  const capture = (x: number, y: number) => {
    const px = step.region.x + ((Math.max(0, Math.min(step.size - 1, x)) + 0.5) / step.size) * step.region.width;
    const py = step.region.y + ((Math.max(0, Math.min(step.size - 1, y)) + 0.5) / step.size) * step.region.height;
    const pixel = quantize(sampleBilinear(active, px, py, input.colorMixing === 'linear'));
    if (!input.values.tool.smudgeAllLayers) return pixel;
    return quantize(
      std.add(pixel, std.mul(quantize(sampleBilinear(below, px, py, input.colorMixing === 'linear')), 1 - pixel.a))
    );
  };
  return (x: number, y: number) =>
    sampleBilinear(
      capture,
      ((x + 0.5 - step.x + step.radius) / (step.radius * 2)) * step.size,
      ((y + 0.5 - step.y + step.radius) / (step.radius * 2)) * step.size,
      input.colorMixing === 'linear'
    );
}

/** Source coordinates outside the finite preview image are transparent, rather than repeated edge pixels. */
export function smudgeSourceBounds(input: Pick<PreviewInput, 'width' | 'height'>, step: ReturnType<typeof smudgeStep>) {
  const x = Math.max(0, Math.floor(step.region.x) - 1),
    y = Math.max(0, Math.floor(step.region.y) - 1);
  const width = Math.min(input.width, Math.ceil(step.region.x + step.region.width) + 1) - x;
  const height = Math.min(input.height, Math.ceil(step.region.y + step.region.height) + 1) - y;
  return width > 0 && height > 0 ? { x, y, width, height } : undefined;
}

/** Linear sampling in pixel-center coordinates, with boundary behavior supplied by the reader. */
export function sampleBilinear(read: (x: number, y: number) => d.v4f, x: number, y: number, linear = false) {
  const left = Math.floor(x - 0.5),
    top = Math.floor(y - 0.5),
    fx = x - 0.5 - left,
    fy = y - 0.5 - top;
  return mixPremultiplied(
    mixPremultiplied(read(left, top), read(left + 1, top), fx, linear),
    mixPremultiplied(read(left, top + 1), read(left + 1, top + 1), fx, linear),
    fy,
    linear
  );
}

function quantize(pixel: d.v4f) {
  return d.vec4f(
    Math.round(pixel.x * 255) / 255,
    Math.round(pixel.y * 255) / 255,
    Math.round(pixel.z * 255) / 255,
    Math.round(pixel.w * 255) / 255
  );
}
