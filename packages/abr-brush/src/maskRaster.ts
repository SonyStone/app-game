import type { BrushFormValues } from './form';
import { maskRoundingOffset } from './maskAccumulation';

/** Selects the sampled/computed Paintbrush method with no active Color Dynamics controls. */
export function usesPaintbrushMask(values: BrushFormValues, secondary = false): boolean {
  return paintbrushMaskMode(values, secondary) === 1;
}

/** 0: another tool method; 1: fixed-color mask; 2: Color Dynamics with straight RGB byte storage. */
export function paintbrushMaskMode(values: BrushFormValues, secondary = false): 0 | 1 | 2 {
  if (secondary || values.tool.type !== 'PbTl' ||
      (values.tipKind !== 'sampledBrush' && values.tipKind !== 'computedBrush')) return 0;
  const c = values.colorDynamics;
  return values.useColorDynamics && [c.control, c.foregroundBackgroundJitter, c.hueJitter,
    c.saturationJitter, c.brightnessJitter, c.purity].some(value => value !== 0) ? 2 : 1;
}

/** A source/destination rectangle within a render surface, with per-dab transfer controls. */
export type MaskRasterRect = {
  x: number; y: number; width: number; height: number;
  flow: number; opacity: number;
  color: readonly [number, number, number];
};

/** Quantizes the caller's normalized per-dab color once before byte-channel accumulation. */
export function maskRasterColorBytes(color: MaskRasterRect['color']): [number, number, number] {
  const byte = (value: number) => Math.max(0, Math.min(255, Math.round(value * 255)));
  return [byte(color[0]), byte(color[1]), byte(color[2])];
}

/** Clips a transformed tip's bounding box and divides it into GPU-supported mask rectangles. */
export function maskRasterRects(data: ArrayLike<number>, offset: number, width: number, height: number,
  bounds?: { left: number; top: number; right: number; bottom: number }
): MaskRasterRect[] {
  const x = data[offset]!, y = data[offset + 1]!;
  const rx = data[offset + 2]!, ry = data[offset + 3]!;
  const cos = data[offset + 4]!, sin = data[offset + 5]!;
  const ex = Math.abs(cos * rx) + Math.abs(sin * ry), ey = Math.abs(sin * rx) + Math.abs(cos * ry);
  const left = Math.max(0, bounds?.left ?? Math.floor(x - ex)), top = Math.max(0, bounds?.top ?? Math.floor(y - ey));
  const right = Math.min(width, bounds?.right ?? Math.ceil(x + ex)), bottom = Math.min(height, bounds?.bottom ?? Math.ceil(y + ey));
  const rectangles: MaskRasterRect[] = [];
  for (let y = top; y < bottom; y += 256)
    for (let x = left; x < right; x += 2048) rectangles.push({
      x, y, width: Math.min(2048, right - x), height: Math.min(256, bottom - y),
      flow: data[offset + 8]!, opacity: data[offset + 9]!,
      color: [data[offset + 12]!, data[offset + 13]!, data[offset + 14]!]
    });
  return rectangles;
}

/**
 * Logical byte allocations replace process pointers in the browser. They preserve Photoshop's
 * alignment/hash algorithm and remain stable across input batches and disposable previews.
 * Their random phase is not claimed to match a particular Photoshop process allocation.
 */
export function maskRasterAddresses(rect: MaskRasterRect, surfaceWidth: number, period: number) {
  return {
    ...maskRasterMaskAddresses(rect, surfaceWidth, period),
    colorAddresses: [0x21000000, 0x22000000, 0x23000000].map(base =>
      (base + rect.y * surfaceWidth + rect.x) >>> 0)
  };
}

/** Mask-only addresses avoid allocating unused RGB channel addresses per stamp. */
export function maskRasterMaskAddresses(rect: MaskRasterRect, surfaceWidth: number, period: number) {
  const stride = Math.ceil(rect.width / 64) * 64;
  const sourceAddress = (0x10000000 + rect.y * stride + rect.x) >>> 0;
  const scaledSourceAddress = (0x18000000 + rect.y * stride + rect.x) >>> 0;
  const destinationAddress = (0x20000000 + rect.y * surfaceWidth + rect.x) >>> 0;
  return {
    stride, sourceAddress, scaledSourceAddress, destinationAddress,
    sourceStart: maskRoundingOffset(sourceAddress, rect.y, rect.x, period),
    destinationStart: maskRoundingOffset(destinationAddress, rect.y, rect.x, period)
  };
}
