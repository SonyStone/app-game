import { divideMaskBytes } from './effects';
import { maskRoundingOffset, scalePaintbrushMaskByte, type MaskRegion } from './maskAccumulation';
import type { createMaskRoundingTable } from './maskRounding';

/**
 * Photoshop's antialiased Paintbrush Color Dynamics mask and RGB stages for 8-bit documents.
 * Color channels contain straight byte values, not premultiplied color. Source, ratio, alpha
 * and color planes must not overlap. Flow/dynamic opacity exclude final tool opacity.
 * Explicit address keys select the executable's allocation-dependent rounding phases.
 */
export function accumulateColorPaintbrush(input: {
  source: MaskRegion;
  alpha: MaskRegion;
  ratio: MaskRegion;
  channels: readonly [MaskRegion, MaskRegion, MaskRegion];
  color: readonly [number, number, number];
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
  const { source, alpha, ratio, width, height, rounding } = input;
  const strength = (value: number) => Math.max(0, Math.min(255, Math.trunc(Math.fround(value * 255 + 0.5))));
  const flowByte = strength(flow), opacityByte = strength(opacity);
  let scaleCursor = maskRoundingOffset(source.address, input.row, input.column, rounding.period);
  let cursor = maskRoundingOffset(alpha.address, input.row, input.column, rounding.period);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let coverage = source.bytes[source.offset + y * source.stride + x]!;
      if (flow !== 1 && coverage !== 0)
        coverage = scalePaintbrushMaskByte(coverage, flowByte, rounding.bytes[scaleCursor++]!);
      const ratioAt = ratio.offset + y * ratio.stride + x;
      if (coverage === 0) {
        ratio.bytes[ratioAt] = 0;
        continue;
      }
      const at = alpha.offset + y * alpha.stride + x;
      const previous = alpha.bytes[at]!;
      const noise = rounding.bytes[cursor++]!;
      const result = colorPaintbrushAlpha(previous, coverage, opacityByte, noise, opacity === 1);
      alpha.bytes[at] = result;
      // Both calculations use the same rounding byte; ratio is also needed when alpha does not grow.
      const numerator = opacity === 1 ? coverage : scalePaintbrushMaskByte(coverage, opacityByte, noise);
      ratio.bytes[ratioAt] = divideMaskBytes(numerator, result);
    }
    if (scaleCursor >= rounding.period) scaleCursor -= rounding.period;
    if (cursor >= rounding.period) cursor -= rounding.period;
  }
  for (let c = 0; c < 3; c++) {
    const channel = input.channels[c]!;
    let cursor = maskRoundingOffset(channel.address, input.row, input.column, rounding.period);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const coverage = ratio.bytes[ratio.offset + y * ratio.stride + x]!;
        if (coverage === 0) continue;
        const at = channel.offset + y * channel.stride + x;
        channel.bytes[at] = mixPaintbrushColorByte(channel.bytes[at]!, input.color[c]!, coverage, rounding.bytes[cursor++]!);
      }
      if (cursor >= rounding.period) cursor -= rounding.period;
    }
  }
}

/** Full opacity uses complemented multiplication; partial opacity preserves any higher accumulated alpha. */
export function colorPaintbrushAlpha(previous: number, source: number, opacity: number, noise: number, fullOpacity: boolean): number {
  'use gpu';
  if (fullOpacity) return 255 - scalePaintbrushMaskByte(255 - source, 255 - previous, noise);
  if (previous >= opacity) return previous;
  return previous + scalePaintbrushMaskByte(source, opacity - previous, noise);
}

/** The RGB leaf moves a straight byte toward the incoming color using a separately rounded signed delta. */
export function mixPaintbrushColorByte(previous: number, color: number, ratio: number, noise: number): number {
  'use gpu';
  if (color >= previous) return previous + scalePaintbrushMaskByte(ratio, color - previous, noise);
  return previous - scalePaintbrushMaskByte(ratio, previous - color, noise);
}
