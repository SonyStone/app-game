import { describe, expect, it } from 'vitest';
import { carve, dent, detachLoosePieces, isCoreExposed, raycastField, sampleField, shatter, solidBoxes, surfaceNormal } from './field';
import { createCrateField, createHullField, HULL_CORE } from './shapes';

describe('hull field', () => {
  it('is armor inside, empty outside, with the core under the armor', () => {
    const field = createHullField();

    expect(sampleField(field, 10, 0)[0]).toBeLessThan(0);
    expect(sampleField(field, 25, 0)[0]).toBeGreaterThan(0);
    expect(sampleField(field, HULL_CORE.x, HULL_CORE.y)[2]).toBeLessThan(0);
    expect(sampleField(field, HULL_CORE.x, HULL_CORE.y)[0]).toBeLessThan(0);
  });
});

describe('raycastField', () => {
  it('stops at the armor surface of an intact hull', () => {
    const hit = raycastField(createHullField(), { x: -40, y: 0 }, { x: 1, y: 0 }, 100);

    expect(hit?.part).toBe('armor');
    expect(hit?.distance).toBeCloseTo(20, 0);
  });

  it('reaches the core through a hole in the rear armor', () => {
    const field = createHullField();
    carve(field, { x: -19, y: 0 }, 4, 0, 1);
    carve(field, { x: -15, y: 0 }, 4, 0, 2);

    expect(raycastField(field, { x: -40, y: 0 }, { x: 1, y: 0 }, 100)?.part).toBe('core');
  });

  it('misses when the ray passes beside the field', () => {
    expect(raycastField(createHullField(), { x: -40, y: 30 }, { x: 1, y: 0 }, 100)).toBeUndefined();
  });
});

describe('carve', () => {
  it('removes armor within the radius and soots the rim', () => {
    const field = createHullField();
    carve(field, { x: 10, y: 12 }, 3, 0, 1);

    expect(sampleField(field, 10, 11)[0]).toBeGreaterThan(0);
    expect(sampleField(field, 10, 7)[0]).toBeLessThan(0);
    expect(sampleField(field, 10, 8)[3]).toBeGreaterThan(0);
  });
});

describe('dent', () => {
  it('caves the surface in along the push direction', () => {
    const field = createHullField();
    dent(field, { x: 0, y: 12.5 }, { x: 0, y: -1 }, 3, 8);

    expect(sampleField(field, 0, 11)[0]).toBeGreaterThan(0);
    expect(sampleField(field, 0, 8)[0]).toBeLessThan(0);
    expect(sampleField(field, 15, 11)[0]).toBeLessThan(0);
  });
});

describe('detachLoosePieces', () => {
  it('cuts off armor separated from the main body', () => {
    const field = createHullField();

    for (let y = -14; y <= 14; y += 1) {
      carve(field, { x: 12, y }, 1.5, 0, y);
    }

    const fragments = detachLoosePieces(field, 4);

    expect(fragments).toHaveLength(1);
    expect(fragments[0].centerX).toBeGreaterThan(12);
    expect(sampleField(field, 17, 0)[0]).toBeGreaterThan(0);
    expect(sampleField(fragments[0].field, 17, 0)[0]).toBeLessThan(0);
    expect(sampleField(field, 0, 0)[0]).toBeLessThan(0);
  });

  it('keeps the main body when it covers less of the field than the empty cells', () => {
    const field = createHullField();

    for (let x = 2; x <= 24; x += 2) {
      for (let y = -16; y <= 16; y += 2) {
        carve(field, { x, y }, 3, 0, x * 100 + y);
      }
    }

    expect(detachLoosePieces(field, 4)).toHaveLength(0);
    expect(sampleField(field, -15, 0)[0]).toBeLessThan(0);
  });
});

describe('shatter', () => {
  it('turns all armor into fragments', () => {
    const field = createCrateField();
    const fragments = shatter(field, 5, 1);

    expect(fragments.length).toBeGreaterThan(1);
    expect(sampleField(field, 0, 0)[0]).toBeGreaterThan(0);
  });
});

describe('solidBoxes', () => {
  it('covers an intact crate with few boxes of its full area', () => {
    const { boxes, area } = solidBoxes(createCrateField(), 2);
    const covered = boxes.reduce((sum, box) => sum + box.halfWidth * box.halfHeight * 4, 0);

    expect(boxes.length).toBeLessThan(12);
    expect(Math.abs(area - 42.5 * 92.5) / area).toBeLessThan(0.03);
    expect(Math.abs(covered - area) / area).toBeLessThan(0.08);
  });
});

describe('isCoreExposed', () => {
  it('hides the core of an intact hull and shows it through a hole', () => {
    const field = createHullField();

    expect(isCoreExposed(field)).toBe(false);

    carve(field, { x: -19, y: 0 }, 4, 0, 1);
    carve(field, { x: -15, y: 0 }, 4, 0, 2);

    expect(isCoreExposed(field)).toBe(true);
  });
});

describe('surfaceNormal', () => {
  it('points out of the nearest face', () => {
    const field = createHullField();
    const front = surfaceNormal(field, { x: 20, y: 0 });
    const side = surfaceNormal(field, { x: 0, y: 12.5 });

    expect(front?.x).toBeCloseTo(1, 1);
    expect(side?.y).toBeCloseTo(1, 1);
  });
});
