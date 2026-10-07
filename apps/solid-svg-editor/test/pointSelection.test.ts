import { describe, expect, it } from 'vitest';

import { deletePoints, insertPointsAfter, pointSelectionActions, reversePoints, setPointsOrigin } from '../src/editor/point-selection';

const points = [
  [1, 1],
  [2, 2],
  [3, 3]
] as const;

describe('point selection', () => {
  it("offers GodSVG's point actions", () => {
    expect(pointSelectionActions('polygon', 3, [1])).toEqual({ insertAfter: true, setOrigin: true, setOriginEnabled: true, reverse: false });
    expect(pointSelectionActions('polygon', 3, [0]).setOriginEnabled).toBe(false);
    expect(pointSelectionActions('polyline', 3, [0, 1, 2])).toMatchObject({ insertAfter: false, setOrigin: false, reverse: true });
    expect(pointSelectionActions('polyline', 3, [0, 1]).reverse).toBe(false);
  });

  it('edits points and returns the new selection', () => {
    expect(insertPointsAfter(points, 0, 2)).toEqual({ points: [[1, 1], [0, 0], [0, 0], [2, 2], [3, 3]], indices: [2] });
    expect(setPointsOrigin(points, 1)).toEqual({ points: [[2, 2], [3, 3], [1, 1]], indices: [0] });
    expect(reversePoints(points)).toEqual({ points: [[3, 3], [2, 2], [1, 1]], indices: [0, 1, 2] });
    expect(deletePoints(points, [0, 2])).toEqual({ points: [[2, 2]], indices: [] });
  });
});
