import { describe, expect, it } from 'vitest';
import {
  boxCorners,
  clipPath,
  clipRing,
  enclosingBox,
  outlinePath,
  pointInPolygon,
  ringArea,
  signedArea,
  simplifyPath,
  simplifyRing
} from './geometry';

const square = [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 10, y: 10 },
  { x: 0, y: 10 }
];

describe('ringArea', () => {
  it('is positive whatever the winding', () => {
    expect(ringArea(square)).toBe(100);
    expect(ringArea([...square].reverse())).toBe(100);
    expect(signedArea(square)).toBe(-signedArea([...square].reverse()));
  });
});

describe('pointInPolygon', () => {
  it('leaves holes out', () => {
    const hole = [
      { x: 3, y: 3 },
      { x: 7, y: 3 },
      { x: 7, y: 7 },
      { x: 3, y: 7 }
    ];

    expect(pointInPolygon({ x: 1, y: 1 }, [square, hole])).toBe(true);
    expect(pointInPolygon({ x: 5, y: 5 }, [square, hole])).toBe(false);
    expect(pointInPolygon({ x: 11, y: 5 }, [square, hole])).toBe(false);
  });
});

describe('simplifyPath', () => {
  it('drops points within the tolerance and keeps the ends and corners', () => {
    const wobbly = [
      { x: 0, y: 0 },
      { x: 5, y: 0.2 },
      { x: 10, y: -0.1 },
      { x: 10, y: 10 }
    ];

    expect(simplifyPath(wobbly, 0.5)).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: -0.1 },
      { x: 10, y: 10 }
    ]);
  });

  it('keeps points farther than the tolerance', () => {
    const bump = [
      { x: 0, y: 0 },
      { x: 5, y: 2 },
      { x: 10, y: 0 }
    ];

    expect(simplifyPath(bump, 1)).toHaveLength(3);
    expect(simplifyPath(bump, 3)).toHaveLength(2);
  });
});

describe('simplifyRing', () => {
  it('removes points on straight edges and a repeated closing point', () => {
    const ring = [
      { x: 0, y: 0 },
      { x: 5, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 5 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
      { x: 0, y: 0 }
    ];

    const simplified = simplifyRing(ring, 0.1);

    expect(simplified).toHaveLength(4);
    expect(ringArea(simplified)).toBe(100);
  });

  it('collapses a sliver to nothing', () => {
    expect(
      simplifyRing(
        [
          { x: 0, y: 0 },
          { x: 10, y: 0.1 },
          { x: 20, y: 0 }
        ],
        1
      )
    ).toEqual([]);
  });
});

describe('clipRing', () => {
  it('cuts a polygon to the rectangle', () => {
    const clipped = clipRing(square, { x: 5, y: -5, width: 20, height: 10 });

    expect(ringArea(clipped)).toBe(25);
  });

  it('drops a polygon outside the rectangle', () => {
    expect(clipRing(square, { x: 20, y: 20, width: 5, height: 5 })).toEqual([]);
  });
});

describe('clipPath', () => {
  it('splits a line that leaves and comes back', () => {
    const pieces = clipPath(
      [
        { x: 1, y: 5 },
        { x: 20, y: 5 },
        { x: 20, y: 8 },
        { x: 1, y: 8 }
      ],
      { x: 0, y: 0, width: 10, height: 10 }
    );

    expect(pieces).toEqual([
      [
        { x: 1, y: 5 },
        { x: 10, y: 5 }
      ],
      [
        { x: 10, y: 8 },
        { x: 1, y: 8 }
      ]
    ]);
  });
});

describe('outlinePath', () => {
  it('turns a straight line into a band of its width', () => {
    const band = outlinePath(
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 }
      ],
      4
    );

    expect(ringArea(band)).toBeCloseTo(40);
  });

  it('mitres corners', () => {
    const band = outlinePath(
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 }
      ],
      2
    );

    expect(band).toHaveLength(6);
    expect(ringArea(band)).toBeCloseTo(40);
  });
});

describe('enclosingBox', () => {
  it('recovers a turned box from its corners', () => {
    const corners = boxCorners({ x: 30, y: -20 }, { x: 8, y: 20 }, 0.6);
    const box = enclosingBox(corners);
    const area = box.size.x * box.size.y;

    expect(area).toBeCloseTo(160);
    expect(box.center.x).toBeCloseTo(30);
    expect(box.center.y).toBeCloseTo(-20);
    expect(ringArea(boxCorners(box.center, box.size, box.rotation))).toBeCloseTo(160);
  });
});
