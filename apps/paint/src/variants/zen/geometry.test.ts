import { describe, expect, it } from 'vitest';
import { createDial } from './dial';
import { fanLayout, placeSheet, type FanRing } from './fanLayout';
import {
  dodgePlacement,
  inwardAngle,
  mirrorPlacement,
  pebbleInset,
  placementPoint,
  snapPlacement,
  type Placement
} from './placement';
import { scrubAxis, scrubValue } from './scrub';
import { fanColors } from './tools';

const landscape = { width: 1280, height: 800 };
const portrait = { width: 800, height: 1280 };

describe('placement', () => {
  it('puts the pebble on a track at the inset from the screen edges', () => {
    expect(placementPoint({ edge: 'right', t: 0.5 }, landscape)).toEqual({ x: 1280 - pebbleInset, y: 400 });
    expect(placementPoint({ edge: 'top', t: 0 }, landscape)).toEqual({ x: pebbleInset, y: pebbleInset });
    expect(placementPoint({ edge: 'bottom', t: 1 }, landscape)).toEqual({
      x: 1280 - pebbleInset,
      y: 800 - pebbleInset
    });
  });

  it('keeps a place across a rotated screen, as a fraction along its edge', () => {
    const place: Placement = { edge: 'left', t: 0.25 };
    expect(placementPoint(place, portrait).y).toBeCloseTo(pebbleInset + (1280 - 2 * pebbleInset) * 0.25);
  });

  it('drops a carried pebble on the nearest edge, or in a corner near one', () => {
    expect(snapPlacement({ x: 1200, y: 300 }, landscape)).toEqual({
      edge: 'right',
      t: (300 - pebbleInset) / (800 - 2 * pebbleInset)
    });
    expect(snapPlacement({ x: 640, y: 790 }, landscape).edge).toBe('bottom');
    expect(snapPlacement({ x: 30, y: 780 }, landscape)).toEqual({ edge: 'bottom', t: 0 });
    expect(snapPlacement({ x: 1270, y: 10 }, landscape)).toEqual({ edge: 'top', t: 1 });
  });

  it('slides out of the pen’s way along the edge, away from the pen, and around corners', () => {
    const home: Placement = { edge: 'right', t: 0.5 };
    const at = placementPoint(home, landscape);
    const below = placementPoint(dodgePlacement(home, landscape, { x: at.x - 30, y: at.y + 20 }, 100), landscape);
    expect(below.x).toBeCloseTo(at.x);
    expect(below.y).toBeCloseTo(at.y - 100);
    const above = placementPoint(dodgePlacement(home, landscape, { x: at.x - 30, y: at.y - 20 }, 100), landscape);
    expect(above.x).toBeCloseTo(at.x);
    expect(above.y).toBeCloseTo(at.y + 100);

    const corner: Placement = { edge: 'top', t: 1 };
    const pen = { x: 1280 - pebbleInset, y: pebbleInset + 40 };
    const moved = placementPoint(dodgePlacement(corner, landscape, pen, 100), landscape);
    expect(moved.x).toBeCloseTo(1280 - pebbleInset - 100);
    expect(moved.y).toBeCloseTo(pebbleInset);
  });

  it('mirrors for the other hand', () => {
    expect(mirrorPlacement({ edge: 'right', t: 0.3 })).toEqual({ edge: 'left', t: 0.3 });
    expect(mirrorPlacement({ edge: 'top', t: 0.2 })).toEqual({ edge: 'top', t: 0.8 });
  });

  it('opens away from an edge, and diagonally out of a corner', () => {
    expect(inwardAngle({ edge: 'right', t: 0.4 })).toBeCloseTo(Math.PI);
    expect(inwardAngle({ edge: 'top', t: 0.4 })).toBeCloseTo(Math.PI / 2);
    expect(inwardAngle({ edge: 'bottom', t: 0 })).toBeCloseTo(-Math.PI / 4);
    expect(inwardAngle({ edge: 'right', t: 0 })).toBeCloseTo((3 * Math.PI) / 4);
  });
});

describe('fanLayout', () => {
  const rings: FanRing[] = [
    { count: 3, item: 44, spacing: 54, spread: 'full', minRadius: 70, gap: 0 },
    { count: 6, item: 52, spacing: 58, spread: 'compact', minRadius: 0, gap: 60 },
    { count: 7, item: 32, spacing: 40, spread: 'compact', minRadius: 0, gap: 54 }
  ];

  it.each([
    ['landscape', landscape],
    ['portrait', portrait]
  ])('keeps every item on the %s screen and apart, wherever the pebble rests', (_name, view) => {
    for (const edge of ['top', 'right', 'bottom', 'left'] as const) {
      for (const t of [0, 0.05, 0.35, 0.5, 0.95, 1]) {
        const placement = { edge, t };
        const center = placementPoint(placement, view);
        const layout = fanLayout(center, inwardAngle(placement), view, rings);
        const items = layout.flatMap((ring, index) =>
          ring.points.map((point) => ({ ...point, radius: rings[index]!.item / 2 }))
        );
        for (const item of items) {
          expect(item.x - item.radius).toBeGreaterThanOrEqual(0);
          expect(item.y - item.radius).toBeGreaterThanOrEqual(0);
          expect(item.x + item.radius).toBeLessThanOrEqual(view.width);
          expect(item.y + item.radius).toBeLessThanOrEqual(view.height);
        }

        for (const [index, item] of items.entries()) {
          for (const other of items.slice(index + 1)) {
            expect(Math.hypot(item.x - other.x, item.y - other.y)).toBeGreaterThan(item.radius + other.radius);
          }
        }
      }
    }
  });

  it('spreads the nearest arc over a half circle at an edge, ends along the edge', () => {
    const center = placementPoint({ edge: 'right', t: 0.5 }, landscape);
    const [history] = fanLayout(center, Math.PI, landscape, rings);
    expect(history!.radius).toBe(70);
    expect(history!.points[0]!.x).toBeCloseTo(center.x);
    expect(history!.points[0]!.y).toBeCloseTo(center.y + 70);
    expect(history!.points[1]!.x).toBeCloseTo(center.x - 70);
    expect(history!.points[2]!.y).toBeCloseTo(center.y - 70);
  });

  it('widens the rings in a corner, where only a quarter circle is on screen', () => {
    const edge = fanLayout(placementPoint({ edge: 'right', t: 0.5 }, landscape), Math.PI, landscape, rings);
    const corner = fanLayout(
      placementPoint({ edge: 'bottom', t: 0 }, landscape),
      inwardAngle({ edge: 'bottom', t: 0 }),
      landscape,
      rings
    );
    expect(corner[1]!.radius).toBeGreaterThan(edge[1]!.radius);
  });
});

describe('placeSheet', () => {
  it('opens beside the pebble toward the page and stays on screen', () => {
    const center = placementPoint({ edge: 'right', t: 0.5 }, landscape);
    const at = placeSheet(center, Math.PI, { width: 200, height: 300 }, landscape, 100);
    expect(at).toEqual({ x: center.x - 100 - 200, y: center.y - 150 });
    const high = placeSheet({ x: center.x, y: 40 }, Math.PI, { width: 200, height: 300 }, landscape, 100);
    expect(high.y).toBe(12);
  });
});

describe('scrubValue', () => {
  const size = { min: 1, max: 512, pixelsPerUnit: 90, scale: 'log' as const };

  it('doubles the size per step of travel when there is room', () => {
    expect(scrubValue({ ...size, start: 10, travel: 90, room: { more: 600, less: 600 } })).toBeCloseTo(20);
    expect(scrubValue({ ...size, start: 10, travel: -90, room: { more: 600, less: 600 } })).toBeCloseTo(5);
  });

  it('reaches the end of the range at the screen’s edge when there is little room', () => {
    expect(scrubValue({ ...size, start: 10, travel: 30, room: { more: 30, less: 600 } })).toBeCloseTo(512);
    const opacity = { min: 0.02, max: 1, pixelsPerUnit: 260, scale: 'linear' as const };
    expect(scrubValue({ ...opacity, start: 0.5, travel: 20, room: { more: 20, less: 900 } })).toBeCloseTo(1);
    expect(scrubValue({ ...opacity, start: 0.5, travel: -130, room: { more: 20, less: 900 } })).toBe(0.02);
  });

  it('decides the axis after a few pixels', () => {
    expect(scrubAxis({ x: 2, y: 3 })).toBeUndefined();
    expect(scrubAxis({ x: 3, y: -12 })).toBe('size');
    expect(scrubAxis({ x: -12, y: 5 })).toBe('opacity');
  });
});

describe('createDial', () => {
  const center = { x: 0, y: 0 };
  const at = (degrees: number, radius = 100) => ({
    x: Math.cos((degrees * Math.PI) / 180) * radius,
    y: Math.sin((degrees * Math.PI) / 180) * radius
  });
  const step = (24 * Math.PI) / 180;

  it('counts whole steps clockwise and back, across the ±180° seam', () => {
    const dial = createDial(center, at(170), step);
    expect(dial.move(at(190))).toBe(0);
    expect(dial.move(at(220))).toBe(2);
    expect(dial.move(at(170))).toBe(0);
    expect(dial.move(at(140))).toBe(-1);
  });

  it('skips moves through the middle', () => {
    const dial = createDial(center, at(0), step);
    expect(dial.move(at(180, 5))).toBe(0);
    expect(dial.move(at(30))).toBe(1);
  });

  it('forgets turning past a limit, so turning back acts at once', () => {
    const dial = createDial(center, at(0), step);
    dial.move(at(90));
    dial.move(at(180));
    dial.limit(1);
    expect(dial.move(at(160))).toBe(1);
    expect(dial.move(at(130))).toBe(0);
  });
});

describe('fanColors', () => {
  it('offers the current color first, then recent ones, then starter colors, without repeats', () => {
    expect(fanColors('#ABCDEF', ['#abcdef', '#112233'], 4)).toEqual(['#abcdef', '#112233', '#1d1d1f', '#5b5b60']);
  });
});
