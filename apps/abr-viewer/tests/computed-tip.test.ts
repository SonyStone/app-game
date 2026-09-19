import {
  computedRadialProfile,
  computedSecondaryTip,
  prepareComputedTip,
  rasterizeComputedTip
} from '@app-game/abr-brush/computedTip';
import { brushFormSchema, brushToFormValues } from '@app-game/abr-brush/form';
import { createMaskRoundingTable } from '@app-game/abr-brush/maskRounding';
import { preparePreviewResources } from '@app-game/abr-brush/resources';
import { createPreviewStroke, dualPreviewInput, type PreviewInput } from '@app-game/abr-brush/stroke';
import { percent, pixels } from '@app-game/abr-parser';
import { expect, test } from 'vitest';

test('computed source bakes stored angle and roundness into native-size bounds', () => {
  const flat = rasterizeComputedTip(prepareComputedTip(64, 100, 0, 25));
  const rotated = rasterizeComputedTip(prepareComputedTip(64, 100, 90, 25));
  expect(flat.width).toBeGreaterThan(flat.height * 2);
  expect(rotated.width).toBe(flat.height);
  expect(rotated.height).toBe(flat.width);
  expect(flat.left).toBe(-Math.floor(flat.width / 2));
  expect(flat.top).toBe(-Math.floor(flat.height / 2));
  expect(flat.data.some((value) => value > 0)).toBe(true);
});

test('secondary source caching follows size and hardness without mutating previous masks', () => {
  const settings = { hardness: 50, angle: 14, roundness: 50 };
  const first = computedSecondaryTip(32, settings),
    saved = first.data.slice();
  expect(computedSecondaryTip(32, settings)).toBe(first);
  const larger = computedSecondaryTip(64, settings);
  expect(larger.key).not.toBe(first.key);
  expect(larger.width).toBeGreaterThan(first.width);
  expect(computedSecondaryTip(64, { ...settings, hardness: 100 }).key).not.toBe(larger.key);
  expect(first.data).toEqual(saved);
});

test('preview resize regenerates computed secondary pixels and placement uses unit scale', () => {
  const input = fixture();
  const decoded = { dualTip: { width: 1, height: 1, depth: 8 as const, data: new Uint8Array([255]) } };
  const first = preparePreviewResources(input, decoded);
  const second = preparePreviewResources({ ...input, dpr: 2 }, decoded);
  expect(second.dualKey).not.toBe(first.dualKey);
  expect(second.dualTip!.width).toBeGreaterThan(first.dualTip!.width);
  expect(decoded.dualTip.width).toBe(1);
  const secondary = dualPreviewInput(input);
  const stroke = createPreviewStroke(secondary, first.dualTip!);
  expect(stroke.sampledTips![0]!.scale).toBe(1);
  const withoutStoredAngle = createPreviewStroke(
    { ...secondary, values: { ...secondary.values, angle: 0, roundness: 100 } },
    first.dualTip!
  );
  // Stored angle and roundness must not be applied for a second time during stamping.
  expect(stroke.sampledTips).toEqual(withoutStoredAngle.sampledTips);
});

test('old saved brush settings default secondary hardness without losing other fields', () => {
  const values = fixture().values;
  const { hardness: _, ...dualBrush } = values.dualBrush;
  expect(brushFormSchema.parse({ ...values, dualBrush }).dualBrush.hardness).toBe(100);
  expect(() => prepareComputedTip(NaN, 50, 0, 100)).toThrow(RangeError);
});

test('computed row execution validates stride/capacity and preserves scalar output with one group', () => {
  const tip = prepareComputedTip(48, 25, 14, 70);
  const context = { profile: computedRadialProfile(), rounding: createMaskRoundingTable(), address: 0xfffffff0 };
  const scalar = rasterizeComputedTip(tip, [2, 2], context);
  const execution = { maximumThreads: 1, rowStride: scalar.width + 16 };
  expect(rasterizeComputedTip(tip, [2, 2], { ...context, execution }).data).toEqual(scalar.data);
  for (const maximumThreads of [0, 1025, NaN, 1.5])
    expect(() =>
      rasterizeComputedTip(tip, [2, 2], { ...context, execution: { ...execution, maximumThreads } })
    ).toThrow(RangeError);
  for (const rowStride of [scalar.width - 1, 0x80000000, NaN, 64.5])
    expect(() => rasterizeComputedTip(tip, [2, 2], { ...context, execution: { ...execution, rowStride } })).toThrow(
      RangeError
    );
  // Crossing the unsigned address boundary remains deterministic and cannot affect earlier pixels.
  const partitioned = rasterizeComputedTip(tip, [2, 2], { ...context, execution: { ...execution, maximumThreads: 8 } });
  expect(partitioned.data.slice(0, scalar.width * 4)).toEqual(scalar.data.slice(0, scalar.width * 4));
  expect(partitioned.data).not.toEqual(scalar.data);
});

function fixture(): PreviewInput {
  const values = brushToFormValues({
    id: 'computed',
    name: 'Computed',
    preset: {
      kind: 'brush',
      sourceId: 'fixture',
      ...{},
      tip: { kind: 'computed', diameter: pixels(64), spacing: percent(25) }
    },
    resources: [],
    source: { format: 'photoshop-abr/v1' as const, bytes: new Uint8Array() }
  });
  values.useDualBrush = true;
  Object.assign(values.dualBrush, { diameter: 32, hardness: 50, angle: 14, roundness: 50, count: 1 });
  return {
    values,
    width: 256,
    height: 128,
    dpr: 1,
    color: '#000000',
    background: '#ffffff',
    flow: 1,
    opacity: 1,
    path: [{ x: 0.5, y: 0.5, time: 0, pressure: 1, tiltX: 0, tiltY: 0, rotation: 0 }]
  };
}
