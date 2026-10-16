import { describe, expect, it } from 'vitest';
import { createDial } from './dial';
import { colorRing, fanLayout, historyRing, placeSheet, sheetOffset, toolRing } from './fanLayout';
import {
  dodgePlacement,
  inwardAngle,
  mirrorPlacement,
  parsePlacement,
  pebbleInset,
  pebbleRadius,
  placementAt,
  placementPoint,
  type Placement
} from './placement';
import { scrubAxis, scrubValue } from './scrub';
import { fanColors } from './tools';

const landscape = { width: 1280, height: 800 };
const portrait = { width: 800, height: 1280 };

describe('placement', () => {
  it('rests the pebble anywhere on a track at the inset from the screen edges', () => {
    expect(placementPoint({ x: 1, y: 0.5 }, landscape)).toEqual({ x: 1280 - pebbleInset, y: 400 });
    expect(placementPoint({ x: 0, y: 0 }, landscape)).toEqual({ x: pebbleInset, y: pebbleInset });
    expect(placementPoint({ x: 1, y: 1 }, landscape)).toEqual({ x: 1280 - pebbleInset, y: 800 - pebbleInset });
    expect(placementPoint({ x: 0.5, y: 0.5 }, landscape)).toEqual({ x: 640, y: 400 });
  });

  it('lands a carried pebble where it is let go, as near as keeps all of it on screen', () => {
    for (const point of [
      { x: 640, y: 400 },
      { x: 211, y: 517 },
      { x: pebbleInset, y: 800 - pebbleInset }
    ]) {
      const landed = placementPoint(placementAt(point, landscape), landscape);
      expect(landed.x).toBeCloseTo(point.x);
      expect(landed.y).toBeCloseTo(point.y);
    }

    expect(placementAt({ x: 1300, y: -20 }, landscape)).toEqual({ x: 1, y: 0 });
    const edge = placementPoint(placementAt({ x: 1279, y: 799 }, landscape), landscape);
    expect(edge.x + pebbleRadius).toBeLessThanOrEqual(1280);
    expect(edge.y + pebbleRadius).toBeLessThanOrEqual(800);
  });

  it('keeps a place across a rotated screen, as fractions of the track', () => {
    const place: Placement = { x: 0, y: 0.25 };
    expect(placementPoint(place, portrait)).toEqual({
      x: pebbleInset,
      y: pebbleInset + (1280 - 2 * pebbleInset) * 0.25
    });
    const open = placementAt({ x: 320, y: 600 }, landscape);
    expect(placementAt(placementPoint(open, portrait), portrait).x).toBeCloseTo(open.x);
    expect(placementAt(placementPoint(open, portrait), portrait).y).toBeCloseTo(open.y);
  });

  it('loads places stored as an edge and a fraction along it as the same spot, and nothing malformed', () => {
    expect(parsePlacement({ edge: 'right', t: 0.25 })).toEqual({ x: 1, y: 0.25 });
    expect(parsePlacement({ edge: 'left', t: 0.35 })).toEqual({ x: 0, y: 0.35 });
    expect(parsePlacement({ edge: 'top', t: 1 })).toEqual({ x: 1, y: 0 });
    expect(parsePlacement({ edge: 'bottom', t: 0 })).toEqual({ x: 0, y: 1 });
    expect(placementPoint(parsePlacement({ edge: 'right', t: 0.5 })!, landscape)).toEqual({
      x: 1280 - pebbleInset,
      y: 400
    });

    expect(parsePlacement({ x: 0.3, y: 0.6 })).toEqual({ x: 0.3, y: 0.6 });
    expect(parsePlacement({ x: 2, y: -1 })).toEqual({ x: 1, y: 0 });
    for (const malformed of [
      undefined,
      null,
      'right',
      { edge: 'middle', t: 0.5 },
      { x: '1', y: 0 },
      { x: NaN, y: 0 }
    ]) {
      expect(parsePlacement(malformed)).toBeUndefined();
    }
  });

  it('slides out of the pen’s way along an edge, away from the pen, or straight away in the open', () => {
    const home: Placement = { x: 1, y: 0.5 };
    const at = placementPoint(home, landscape);
    const below = placementPoint(dodgePlacement(home, landscape, { x: at.x - 30, y: at.y + 20 }, 100), landscape);
    expect(below.x).toBeCloseTo(at.x);
    expect(below.y).toBeCloseTo(at.y - 100);
    const above = placementPoint(dodgePlacement(home, landscape, { x: at.x - 30, y: at.y - 20 }, 100), landscape);
    expect(above.x).toBeCloseTo(at.x);
    expect(above.y).toBeCloseTo(at.y + 100);

    const corner: Placement = { x: 1, y: 0 };
    const pen = { x: 1280 - pebbleInset, y: pebbleInset + 40 };
    const moved = placementPoint(dodgePlacement(corner, landscape, pen, 100), landscape);
    expect(moved.x).toBeCloseTo(1280 - pebbleInset - 100);
    expect(moved.y).toBeCloseTo(pebbleInset);

    const middle = placementAt({ x: 640, y: 400 }, landscape);
    const away = placementPoint(dodgePlacement(middle, landscape, { x: 670, y: 400 }, 100), landscape);
    expect(away.x).toBeCloseTo(540);
    expect(away.y).toBeCloseTo(400);
  });

  it('mirrors for the other hand', () => {
    expect(mirrorPlacement({ x: 1, y: 0.3 })).toEqual({ x: 0, y: 0.3 });
    expect(mirrorPlacement({ x: 0.25, y: 0.6 })).toEqual({ x: 0.75, y: 0.6 });
  });

  it('opens away from an edge, diagonally out of a corner, and toward the middle in the open', () => {
    const at = (x: number, y: number) => inwardAngle(placementPoint({ x, y }, landscape), landscape);
    expect(at(1, 0.4)).toBeCloseTo(Math.PI);
    expect(at(1, 0.35)).toBeCloseTo(Math.PI);
    expect(at(0.4, 0)).toBeCloseTo(Math.PI / 2);
    expect(at(0, 1)).toBeCloseTo(-Math.PI / 4);
    expect(at(1, 0)).toBeCloseTo((3 * Math.PI) / 4);

    expect(inwardAngle({ x: 300, y: 400 }, landscape)).toBeCloseTo(0);
    expect(inwardAngle({ x: 640, y: 600 }, landscape)).toBeCloseTo(-Math.PI / 2);
    expect(inwardAngle({ x: 640, y: 400 }, landscape)).toBeCloseTo(-Math.PI / 2);
    // Near a corner, between the corner's diagonal and the nearer edge's normal.
    const nearCorner = inwardAngle({ x: 1280 - pebbleInset, y: pebbleInset + 80 }, landscape);
    expect(nearCorner).toBeGreaterThan((3 * Math.PI) / 4);
    expect(nearCorner).toBeLessThan(Math.PI);
  });
});

describe('fanLayout', () => {
  const rings = [historyRing, toolRing, colorRing];
  const spots = [0, 0.05, 0.25, 0.35, 0.5, 0.75, 0.95, 1];

  it.each([
    ['landscape', landscape],
    ['portrait', portrait]
  ])('keeps every item on the %s screen, apart and clear of the pebble, wherever the pebble rests', (_name, view) => {
    for (const x of spots) {
      for (const y of spots) {
        const center = placementPoint({ x, y }, view);
        const layout = fanLayout(center, inwardAngle(center, view), view, rings);
        const items = layout.flatMap((ring, index) =>
          ring.points.map((point) => ({ ...point, radius: rings[index]!.item / 2 }))
        );
        for (const item of items) {
          expect(item.x - item.radius).toBeGreaterThanOrEqual(0);
          expect(item.y - item.radius).toBeGreaterThanOrEqual(0);
          expect(item.x + item.radius).toBeLessThanOrEqual(view.width);
          expect(item.y + item.radius).toBeLessThanOrEqual(view.height);
          expect(Math.hypot(item.x - center.x, item.y - center.y)).toBeGreaterThan(pebbleRadius + item.radius);
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
    const center = placementPoint({ x: 1, y: 0.5 }, landscape);
    const radius = historyRing.minRadius;
    const [history] = fanLayout(center, Math.PI, landscape, rings);
    expect(history!.radius).toBe(radius);
    expect(history!.points[0]!.x).toBeCloseTo(center.x);
    expect(history!.points[0]!.y).toBeCloseTo(center.y + radius);
    expect(history!.points[1]!.x).toBeCloseTo(center.x - radius);
    expect(history!.points[2]!.y).toBeCloseTo(center.y - radius);
  });

  it('opens a pebble in the open toward the middle of the screen', () => {
    const center = { x: 300, y: 400 };
    const [history] = fanLayout(center, inwardAngle(center, landscape), landscape, rings);
    expect(history!.points[1]!.x).toBeCloseTo(center.x + historyRing.minRadius);
    expect(history!.points[1]!.y).toBeCloseTo(center.y);
  });

  it('widens the rings in a corner, where only a quarter circle is on screen', () => {
    const edgeCenter = placementPoint({ x: 1, y: 0.5 }, landscape);
    const edge = fanLayout(edgeCenter, inwardAngle(edgeCenter, landscape), landscape, rings);
    const cornerCenter = placementPoint({ x: 0, y: 1 }, landscape);
    const corner = fanLayout(cornerCenter, inwardAngle(cornerCenter, landscape), landscape, rings);
    expect(corner[1]!.radius).toBeGreaterThan(edge[1]!.radius);
  });
});

describe('placeSheet', () => {
  it('opens beside the pebble toward the page and stays on screen', () => {
    const center = placementPoint({ x: 1, y: 0.5 }, landscape);
    const at = placeSheet(center, Math.PI, { width: 200, height: 300 }, landscape, 100);
    expect(at).toEqual({ x: center.x - 100 - 200, y: center.y - 150 });
    const high = placeSheet({ x: center.x, y: 40 }, Math.PI, { width: 200, height: 300 }, landscape, 100);
    expect(high.y).toBe(12);
  });

  it('opens to the side when the view would push it back over the pebble', () => {
    const center = { x: 640, y: 300 };
    const size = { width: 252, height: 404 };
    const at = placeSheet(center, Math.PI / 2, size, landscape, sheetOffset);
    expect(at).toEqual({ x: center.x + sheetOffset, y: center.y - size.height / 2 });
    const room = placeSheet({ x: 640, y: 120 }, Math.PI / 2, size, landscape, sheetOffset);
    expect(room).toEqual({ x: 640 - size.width / 2, y: 120 + sheetOffset });
  });

  it('clears the fan’s nearest ring', () => {
    expect(sheetOffset).toBeGreaterThan(historyRing.minRadius + historyRing.item / 2);
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
