import { describe, expect, it } from 'vitest';
import {
  adjustAxis,
  adjustedOpacity,
  adjustedSize,
  inZone,
  itemRadius,
  linePoints,
  ringItemAt,
  ringLayout,
  zonePaths,
  zoneShape
} from './geometry';

const view = { left: 0, top: 0, width: 1280, height: 800 };
const ids = ['brush', 'eraser', 'eyedropper', 'lasso', 'line', 'transform', 'zoom', 'pan'] as const;

describe('zoneShape', () => {
  it('stands on the free hand edge, about a fifth of the width wide', () => {
    const right = zoneShape(view, 'right');
    expect(right.width).toBe(282);
    expect(inZone(right, { x: 1270, y: 440 })).toBe(true);
    expect(inZone(right, { x: 1000, y: 440 })).toBe(true);
    expect(inZone(right, { x: 990, y: 440 })).toBe(false);
    expect(inZone(right, { x: 10, y: 440 })).toBe(false);
  });

  it('tapers toward the corners', () => {
    const right = zoneShape(view, 'right');
    expect(inZone(right, { x: 1100, y: 440 })).toBe(true);
    expect(inZone(right, { x: 1100, y: 10 })).toBe(false);
  });

  it('mirrors for the left hand', () => {
    const left = zoneShape(view, 'left');
    expect(inZone(left, { x: 10, y: 440 })).toBe(true);
    expect(inZone(left, { x: 1270, y: 440 })).toBe(false);
  });

  it('keeps between 180 and 300 pixels wide', () => {
    expect(zoneShape({ width: 600, height: 900 }, 'right').width).toBe(180);
    expect(zoneShape({ width: 2560, height: 1440 }, 'right').width).toBe(300);
  });

  it('draws its arc through the side away from the edge', () => {
    expect(zonePaths(zoneShape(view, 'right')).arc).toMatch(/ 0 0 0 282 /);
    expect(zonePaths(zoneShape(view, 'left')).arc).toMatch(/ 0 0 1 0 /);
  });
});

describe('ringLayout', () => {
  it('fans away from the edge, starting at the top', () => {
    const layout = ringLayout({ x: 1180, y: 440 }, ids, view);
    expect(layout.items.map((item) => item.id)).toEqual(ids);
    expect(layout.items[0]!.y).toBeLessThan(layout.items.at(-1)!.y);
    const middle = layout.items[Math.floor(ids.length / 2)]!;
    expect(middle.x).toBeLessThan(1180);
  });

  it('keeps neighbours apart', () => {
    const layout = ringLayout({ x: 1180, y: 440 }, ids, view);
    for (let index = 1; index < layout.items.length; index++) {
      const a = layout.items[index - 1]!;
      const b = layout.items[index]!;
      expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(2 * itemRadius + 8);
    }
  });

  it('moves inside the view near a corner, keeping its origin', () => {
    const origin = { x: 1260, y: 20 };
    const layout = ringLayout(origin, ids, view);
    expect(layout.origin).toEqual(origin);
    for (const item of layout.items) {
      expect(item.x + itemRadius).toBeLessThanOrEqual(1280);
      expect(item.y - itemRadius).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('ringItemAt', () => {
  const layout = ringLayout({ x: 1180, y: 440 }, ids, view);

  it('chooses nothing near the origin', () => {
    expect(ringItemAt(layout, { x: 1170, y: 445 })).toBeUndefined();
  });

  it('chooses by direction, at the item and beyond it', () => {
    for (const item of layout.items) {
      expect(ringItemAt(layout, item)).toBe(item.id);
      const beyond = { x: 1180 + (item.x - 1180) * 1.5, y: 440 + (item.y - 440) * 1.5 };
      expect(ringItemAt(layout, beyond)).toBe(item.id);
    }
  });

  it('chooses by direction from the origin when the ring moved', () => {
    const moved = ringLayout({ x: 1260, y: 20 }, ids, view);
    for (const item of moved.items) {
      const halfway = { x: (item.x + 1260) / 2, y: (item.y + 20) / 2 };
      if (Math.hypot(halfway.x - 1260, halfway.y - 20) > 30) {
        expect(ringItemAt(moved, halfway)).toBe(item.id);
      }
    }
  });
});

describe('two-finger adjustment', () => {
  it('locks to the dominant direction once the fingers moved', () => {
    expect(adjustAxis({ x: 4, y: 5 })).toBeUndefined();
    expect(adjustAxis({ x: 3, y: -20 })).toBe('size');
    expect(adjustAxis({ x: 20, y: 6 })).toBe('opacity');
  });

  it('doubles the size every 110 px up and keeps it in range', () => {
    expect(adjustedSize(20, -110, 512)).toBe(40);
    expect(adjustedSize(20, 110, 512)).toBe(10);
    expect(adjustedSize(4, 500, 512)).toBe(1);
    expect(adjustedSize(400, -500, 512)).toBe(512);
    expect(adjustedSize(4, -10, 512)).toBe(4.3);
  });

  it('raises the opacity to the right and keeps it in range', () => {
    expect(adjustedOpacity(0.5, 30)).toBe(0.6);
    expect(adjustedOpacity(0.5, -300)).toBe(0.01);
    expect(adjustedOpacity(0.9, 300)).toBe(1);
  });
});

describe('linePoints', () => {
  it('spaces points evenly and includes both ends', () => {
    const points = linePoints({ x: 0, y: 0 }, { x: 10, y: 0 }, 2);
    expect(points).toHaveLength(6);
    expect(points[0]).toEqual({ x: 0, y: 0 });
    expect(points.at(-1)).toEqual({ x: 10, y: 0 });
  });

  it('gives one point for a line without length', () => {
    expect(linePoints({ x: 3, y: 4 }, { x: 3, y: 4 }, 2)).toEqual([{ x: 3, y: 4 }]);
  });
});
