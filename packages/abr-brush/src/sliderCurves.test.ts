import { expect, it } from 'vitest';
import { brushSizeCurve, brushSpacingCurve, curvePosition, curveValue } from './sliderCurves';

it("matches Photoshop's Size and Spacing sliders at the positions recovered from its binary", () => {
  // positions.csv of photoshop-analysis, evidence/2026-10-05-brush-sliders.
  const size = brushSizeCurve(5000);
  expect([0, 0.1, 0.25, 0.5, 0.75, 1].map((t) => Math.round(curveValue(size, t)))).toEqual([1, 21, 51, 101, 200, 5000]);
  expect([0.1, 0.25, 0.5, 0.75, 1].map((t) => Math.round(curveValue(brushSpacingCurve, t)))).toEqual([
    21, 51, 101, 200, 1000
  ]);
  expect(Math.round(curveValue(brushSpacingCurve, 0.95))).toBe(975);
  // Another largest size moves only the last segment, as Photoshop's range setter does.
  expect(Math.round(curveValue(brushSizeCurve(2500), 0.95))).toBe(1500);
});

it('finds the slider position of a value, and clamps both ways', () => {
  const size = brushSizeCurve(512);
  for (const value of [1, 21, 102, 200, 500, 512])
    expect(curveValue(size, curvePosition(size, value))).toBeCloseTo(value, 9);
  expect(curvePosition(size, 0)).toBe(0);
  expect(curvePosition(size, 9000)).toBe(1);
  expect(curveValue(size, -1)).toBe(1);
  expect(curveValue(size, 2)).toBe(512);
});
