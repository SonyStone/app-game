import { d } from 'typegpu';
import type { createMaskRoundingTable } from './maskRounding';

/**
 * Updates a destination rectangle using Photoshop's antialiased Paintbrush mask path
 * without Color Dynamics. Source and destination must not overlap. Values are normalized
 * float32 flow/dynamic opacity, excluding global opacity. Address keys are explicit because
 * Photoshop includes pointer bits in rounding; browser allocation keys are not yet mapped.
 * The source stride is retained for the scaled scratch plane's address alignment.
 */
export function accumulatePaintbrushMask(input: {
  source: MaskRegion;
  destination: MaskRegion;
  /** Address of the first scaled source pixel in Photoshop's scratch plane. */
  scaledSourceAddress: number;
  /** Coordinates relative to the original source cache, before cropping to this rectangle. */
  row: number;
  column: number;
  width: number;
  height: number;
  flow: number;
  opacity: number;
  rounding: ReturnType<typeof createMaskRoundingTable>;
}): void {
  const flow = Math.fround(input.flow), opacity = Math.fround(input.opacity);
  if (flow === 0 || input.width <= 0 || input.height <= 0) return;
  const flowByte = strengthByte(flow), opacityByte = strengthByte(opacity);
  const { width, height, destination, rounding } = input;
  let source = input.source;
  // Dispatch uses float equality before strength-byte conversion in 0x103e3cbf8.
  const scaleSource = flow !== 1 && opacity !== 1;
  if (scaleSource) {
    const bytes = new Uint8Array(source.stride * height);
    let cursor = maskRoundingOffset(source.address, input.row, input.column, rounding.period);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const value = source.bytes[source.offset + y * source.stride + x]!;
        bytes[y * source.stride + x] = value === 0 ? 0 :
          scalePaintbrushMaskByte(value, flowByte, rounding.bytes[cursor++]!);
      }
      if (cursor >= rounding.period) cursor -= rounding.period;
    }
    source = { bytes, offset: 0, stride: source.stride, address: input.scaledSourceAddress };
  }
  let cursor = maskRoundingOffset(destination.address, input.row, input.column, rounding.period);
  const twoStageFlow = flow !== 1 && !scaleSource;
  for (let y = 0; y < height; y++) {
    if (!twoStageFlow) cursor = (cursor & ~3) | ((source.address + y * source.stride) & 3);
    for (let x = 0; x < width; x++) {
      const value = source.bytes[source.offset + y * source.stride + x]!;
      const at = destination.offset + y * destination.stride + x;
      const previous = destination.bytes[at]!;
      if (value === 0) continue;
      if (twoStageFlow) {
        const delta = scalePaintbrushMaskByte(value, 255 - previous, rounding.bytes[cursor++]!);
        destination.bytes[at] = previous + scalePaintbrushMaskByte(delta, flowByte, rounding.bytes[cursor++]!);
      } else if (previous < opacityByte) {
        destination.bytes[at] = previous + scalePaintbrushMaskByte(value, opacityByte - previous, rounding.bytes[cursor + x]!);
      }
    }
    if (!twoStageFlow) cursor += width + 4;
    if (cursor >= rounding.period) cursor -= rounding.period;
  }
}

/** A rectangle's byte storage and the address of its first pixel, not the array's base. */
export type MaskRegion = {
  bytes: Uint8Array;
  offset: number;
  stride: number;
  /** Low 32 address bits used by Photoshop's rounding hash and source alignment. */
  address: number;
};

/** Photoshop's address/rectangle rounding hash, with unsigned 32-bit overflow at each step. */
export function maskRoundingOffset(address: number, row: number, column: number, period: number): number {
  const step = (value: number) => ((Math.imul(value, 0x41c64e6d) + 0x3039) >>> 0) >>> 3;
  return step(address ^ step(row ^ step(column))) % period;
}

/** Float32 fused multiply-add followed by truncation and byte saturation. */
function strengthByte(value: number): number {
  return Math.max(0, Math.min(255, Math.trunc(Math.fround(value * 255 + 0.5))));
}

/**
 * Photoshop's 8-bit, antialiased Paintbrush accumulation without color dynamics.
 * Inputs and output are bytes. Opacity is the per-dab dynamic factor, excluding
 * global tool opacity. Existing coverage above that factor remains untouched.
 * Noise bytes belong to Photoshop's rounding table, not brush grain or jitter.
 * This byte-only convenience function assumes exact byte-normalized controls. Use
 * accumulatePaintbrushMask for float dispatch, rectangle alignment and table consumption.
 */
export function accumulatePaintbrushMaskByte(
  previous: number,
  source: number,
  flow: number,
  opacity: number,
  scaleNoise: number,
  accumulationNoise: number
): number {
  'use gpu';
  const destination = d.u32(previous);
  let coverage = d.u32(source);
  if (flow === 0 || opacity === 0) return destination;
  if (opacity === 255 && flow < 255) {
    const delta = scalePaintbrushMaskByte(coverage, 255 - destination, scaleNoise);
    return destination + scalePaintbrushMaskByte(delta, flow, accumulationNoise);
  }
  if (flow < 255) coverage = scalePaintbrushMaskByte(coverage, flow, scaleNoise);
  if (destination >= opacity) return destination;
  return destination + scalePaintbrushMaskByte(coverage, opacity - destination, accumulationNoise);
}

/** Dithered byte multiplication from Photoshop's mask scaling/accumulation kernels. */
export function scalePaintbrushMaskByte(source: number, strength: number, noise: number): number {
  'use gpu';
  const product = d.u32(source) * d.u32(strength) * 257;
  const fractional = (product + (product >> 16) + 128) >> 8;
  return (fractional + d.u32(noise)) >> 8;
}
