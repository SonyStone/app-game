import { describe, expect, it } from 'vitest';
import { addDrillMark, biteAt, drillDepth, type DrillMark } from './bite';

describe("a shell's bite", () => {
  it('fades toward the end of its range', () => {
    const spec = { range: 400, fade: 0.5 };

    expect(biteAt(spec, 0)).toEqual({ hole: 1, depth: 1 });
    expect(biteAt(spec, 200).depth).toBeCloseTo(0.75);
    expect(biteAt(spec, 400).hole).toBeCloseTo(0.5);
    expect(biteAt(spec, 900).depth).toBeCloseTo(0.5);
  });

  it('tears deeper at point blank, falling off evenly to its own bite at the point-blank range', () => {
    const spec = { range: 300, pointBlank: { range: 200, depth: 4, hole: 1.2 } };

    expect(biteAt(spec, 0)).toEqual({ hole: 1.2, depth: 4 });
    expect(biteAt(spec, 100).depth).toBeCloseTo(2.5);
    expect(biteAt(spec, 100).hole).toBeCloseTo(1.1);
    expect(biteAt(spec, 200)).toEqual({ hole: 1, depth: 1 });
    expect(biteAt(spec, 250)).toEqual({ hole: 1, depth: 1 });
  });

  it('multiplies point blank and fade', () => {
    expect(biteAt({ range: 300, fade: 0.5, pointBlank: { range: 300, depth: 3 } }, 150).depth).toBeCloseTo(0.75 * 2);
  });
});

describe("a gatling's stream", () => {
  const spec = { radius: 6, gain: 0.8, most: 4, memory: 0.5 };
  const shooter = {};

  it("digs deeper where its earlier rounds hit near, up to a most, but not for another stream's rounds", () => {
    const marks: DrillMark[] = [];

    expect(drillDepth(marks, { x: 0, y: 0 }, shooter, 0, spec)).toBe(0);

    for (let round = 0; round < 3; round++) {
      addDrillMark(marks, { x: round, y: 0 }, shooter, round * 0.1, spec.memory);
    }

    expect(drillDepth(marks, { x: 1, y: 1 }, shooter, 0.3, spec)).toBeCloseTo(2.4);
    expect(drillDepth(marks, { x: 1, y: 1 }, {}, 0.3, spec)).toBe(0);

    for (let round = 3; round < 9; round++) {
      addDrillMark(marks, { x: 0, y: 0 }, shooter, 0.3 + round * 0.01, spec.memory);
    }

    expect(drillDepth(marks, { x: 0, y: 0 }, shooter, 0.4, spec)).toBe(4);
  });

  it('does not drill where its rounds scatter wide, nor with rounds older than its memory', () => {
    const marks: DrillMark[] = [];
    addDrillMark(marks, { x: -10, y: 0 }, shooter, 0, spec.memory);
    addDrillMark(marks, { x: 10, y: 0 }, shooter, 0, spec.memory);

    expect(drillDepth(marks, { x: 0, y: 0 }, shooter, 0.1, spec)).toBe(0);
    expect(drillDepth(marks, { x: 10, y: 1 }, shooter, 0.6, spec)).toBe(0);

    addDrillMark(marks, { x: 0, y: 0 }, shooter, 0.7, spec.memory);

    expect(marks).toHaveLength(1);
  });
});
