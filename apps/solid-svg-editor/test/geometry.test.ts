import { describe, expect, it } from 'vitest';

import {
  invertMatrix,
  multiplyMatrices,
  parseTransformList,
  transformPoint
} from '../src/editor/geometry';

function expectClose(actual: number, expected: number): void {
  expect(actual).toBeCloseTo(expected, 6);
}

describe('geometry transforms', () => {
  it('parses composed SVG transforms in order', () => {
    const transform = parseTransformList('translate(10 20) scale(2) rotate(90)');
    const point = transformPoint(transform, { x: 1, y: 0 });

    expectClose(point.x, 10);
    expectClose(point.y, 22);
  });

  it('inverts affine matrices', () => {
    const transform = parseTransformList('translate(12 -5) scale(3 2)');
    const inverse = invertMatrix(transform);

    expect(inverse).toBeDefined();

    if (!inverse) {
      return;
    }

    const identity = multiplyMatrices(transform, inverse);

    expectClose(identity.a, 1);
    expectClose(identity.b, 0);
    expectClose(identity.c, 0);
    expectClose(identity.d, 1);
    expectClose(identity.e, 0);
    expectClose(identity.f, 0);
  });
});
