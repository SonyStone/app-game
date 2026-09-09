import { mixPremultiplied, planCanvasPickup, smudgeCarry } from '@app-game/abr-brush/effects';
import { d, std } from 'typegpu';
import { stampStride, type PreviewInput, type PreviewStroke } from './stroke';

/** The same bounding-circle capture and allocation buckets used by Paint's canvas pickup. */
export function smudgeStep(stroke: PreviewStroke, index: number, source: 'current' | 'previous' = 'current') {
  const offset = index * stampStride,
    previous = Math.max(0, index - 1) * stampStride;
  const x = stroke.data[offset]!,
    y = stroke.data[offset + 1]!;
  const radius = Math.max(1, Math.hypot(stroke.data[offset + 2]!, stroke.data[offset + 3]!));
  const sourceX = source === 'previous' ? stroke.data[previous]! : x,
    sourceY = source === 'previous' ? stroke.data[previous + 1]! : y;
  const region = { x: sourceX - radius, y: sourceY - radius, width: radius * 2, height: radius * 2 };
  return { x, y, radius, sourceX, sourceY, region, size: planCanvasPickup(region, 1024).width };
}

/** Carries the previous pickup in brush-local coordinates. Each update captures before any ink is deposited. */
export function createSmudgePickup() {
  let banks = [new Uint8Array(0), new Uint8Array(0)];
  let front = 0;
  let previous: ReturnType<typeof smudgeStep> | undefined;
  return (
    input: PreviewInput,
    step: ReturnType<typeof smudgeStep>,
    active: (x: number, y: number) => d.v4f,
    below: (x: number, y: number) => d.v4f,
    foreground?: d.v3f
  ) => {
    const back = 1 - front;
    const length = step.size * step.size * 4;
    if (banks[back]!.length < length) banks[back] = new Uint8Array(length);
    const output = banks[back]!;
    const linear = input.colorMixing === 'linear';
    const old = previous;
    const readOld = (x: number, y: number) => readBank(banks[front]!, old!.size, x, y);
    for (let y = 0; y < step.size; y++)
      for (let x = 0; x < step.size; x++) {
        const px = step.region.x + ((x + 0.5) / step.size) * step.region.width;
        const py = step.region.y + ((y + 0.5) / step.size) * step.region.height;
        let pixel = quantize(sampleBilinear(active, px, py, linear));
        if (input.values.tool.smudgeAllLayers)
          pixel = quantize(std.add(pixel, std.mul(quantize(sampleBilinear(below, px, py, linear)), 1 - pixel.a)));
        if (!old && foreground)
          pixel = smudgeCarry(pixel, d.vec4f(foreground, 1), input.values.tool.strength / 100, linear);
        if (old) {
          const u = ((x + 0.5) / step.size - 0.5) * (step.radius / old.radius) + 0.5;
          const v = ((y + 0.5) / step.size - 0.5) * (step.radius / old.radius) + 0.5;
          // Fresh pixels outside the old footprint do not inherit its clamped edge color.
          if (u >= 0 && v >= 0 && u < 1 && v < 1)
            pixel = smudgeCarry(
              pixel,
              sampleBilinear(readOld, u * old.size, v * old.size, linear),
              input.values.tool.strength / 100,
              linear
            );
        }
        const i = (y * step.size + x) * 4;
        for (let c = 0; c < 4; c++) output[i + c] = Math.round(pixel[c]! * 255);
      }
    front = back;
    previous = step;
    return (x: number, y: number) =>
      sampleBilinear(
        (px, py) => readBank(output, step.size, px, py),
        ((x + 0.5 - step.x + step.radius) / (step.radius * 2)) * step.size,
        ((y + 0.5 - step.y + step.radius) / (step.radius * 2)) * step.size,
        linear
      );
  };
}

function readBank(pixels: Uint8Array, size: number, x: number, y: number) {
  const i = (Math.max(0, Math.min(size - 1, y)) * size + Math.max(0, Math.min(size - 1, x))) * 4;
  return d.vec4f(pixels[i]! / 255, pixels[i + 1]! / 255, pixels[i + 2]! / 255, pixels[i + 3]! / 255);
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
