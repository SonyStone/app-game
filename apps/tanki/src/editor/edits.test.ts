import { describe, expect, it } from 'vitest';
import { createEmptyMap, type MapObject, type TankiMap } from '../map/format';
import { ringArea } from '../map/geometry';
import {
  addItem,
  BUILDING_HEIGHT,
  changeKind,
  deleteItems,
  duplicateItems,
  findItem,
  insertVertex,
  itemAt,
  itemsInside,
  moveItems,
  moveVertex,
  placeKingOfTheHill,
  removeVertex,
  rotateItems
} from './edits';

const building: MapObject = {
  id: 'b',
  kind: 'building',
  points: [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 50 },
    { x: 0, y: 50 }
  ],
  holes: [
    [
      { x: 40, y: 20 },
      { x: 60, y: 20 },
      { x: 50, y: 30 }
    ]
  ],
  height: 67.2
};

const road: MapObject = {
  id: 'r',
  kind: 'road',
  points: [
    { x: -50, y: 100 },
    { x: 150, y: 100 }
  ],
  width: 20
};

function sample(): TankiMap {
  return [building, road].reduce(
    addItem,
    addItem(createEmptyMap('Test', 400, 300), { id: 'k', x: 300, y: 200, radius: 30 })
  );
}

describe('itemAt', () => {
  const map = sample();

  it('finds the item under a point, topmost first', () => {
    expect(itemAt(map, { x: 10, y: 10 }, 1)).toBe('b');
    expect(itemAt(map, { x: 10, y: 105 }, 1)).toBe('r');
    expect(itemAt(map, { x: 300, y: 200 }, 1)).toBe('k');
  });

  it('sees through courtyards', () => {
    expect(itemAt(map, { x: 50, y: 24 }, 0)).toBeUndefined();
  });
});

describe('itemsInside', () => {
  it('selects only items entirely inside the box', () => {
    expect(itemsInside(sample(), { x: -1, y: -1, width: 102, height: 52 })).toEqual(['b']);
  });
});

describe('moving and turning', () => {
  it('moves every point and keeps other items shared', () => {
    const map = sample();
    const moved = moveItems(map, ['b'], { x: 10, y: -5 });
    const result = findItem(moved, 'b') as typeof building;

    expect(result.kind === 'building' && result.points[0]).toEqual({ x: 10, y: -5 });
    expect(result.kind === 'building' && result.holes[0][0]).toEqual({ x: 50, y: 15 });
    expect(moved.objects[1]).toBe(map.objects[1]);
  });

  it('turns a crate around a center, changing its rotation too', () => {
    const map = addItem(createEmptyMap('Test', 100, 100), {
      id: 'c',
      kind: 'crate',
      x: 10,
      y: 0,
      size: { x: 4, y: 8 },
      rotation: 0
    });
    const turned = findItem(rotateItems(map, ['c'], { x: 0, y: 0 }, Math.PI / 2), 'c');

    expect(turned).toMatchObject({ rotation: Math.PI / 2 });
    expect(turned && 'x' in turned && turned.x).toBeCloseTo(0);
    expect(turned && 'y' in turned && turned.y).toBeCloseTo(10);
  });
});

describe('vertices', () => {
  it('moves, inserts and removes corners', () => {
    let map = sample();
    map = moveVertex(map, { id: 'b', ring: 0, index: 2 }, { x: 120, y: 60 });
    map = insertVertex(map, { id: 'b', ring: 0, index: 1 }, { x: 50, y: -10 });

    const shape = findItem(map, 'b');
    expect(shape && 'points' in shape && shape.points).toEqual([
      { x: 0, y: 0 },
      { x: 50, y: -10 },
      { x: 100, y: 0 },
      { x: 120, y: 60 },
      { x: 0, y: 50 }
    ]);

    map = removeVertex(map, { id: 'b', ring: 0, index: 1 });
    expect(findItem(map, 'b')).toMatchObject({ points: { length: 4 } });
  });

  it('keeps three corners on an outline but drops a hole that falls below three', () => {
    let map = sample();
    map = removeVertex(map, { id: 'b', ring: 1, index: 0 });
    expect(findItem(map, 'b')).toMatchObject({ holes: [] });

    const triangle = removeVertex(map, { id: 'b', ring: 0, index: 0 });
    expect(removeVertex(triangle, { id: 'b', ring: 0, index: 0 })).toEqual(triangle);
  });
});

describe('changeKind', () => {
  it('turns a building into a park and back, keeping the outline and holes', () => {
    const park = changeKind(sample(), 'b', 'park');

    expect(findItem(park, 'b')).toEqual({
      id: 'b',
      kind: 'park',
      points: building.points,
      holes: building.kind === 'building' ? building.holes : []
    });
    expect(findItem(changeKind(park, 'b', 'building'), 'b')).toMatchObject({
      kind: 'building',
      height: BUILDING_HEIGHT
    });
  });

  it('turns a road into the polygon of its band', () => {
    const area = findItem(changeKind(sample(), 'r', 'water'), 'r');

    expect(area && 'points' in area && ringArea(area.points)).toBeCloseTo(200 * 20);
  });

  it('turns an outline into its enclosing crate', () => {
    const crate = findItem(changeKind(sample(), 'b', 'crate'), 'b');

    expect(crate).toMatchObject({ kind: 'crate', x: 50, y: 25 });
    expect(crate && 'size' in crate && crate.size.x * crate.size.y).toBeCloseTo(5000);
  });
});

describe('deleting and duplicating', () => {
  it('removes objects and markers by id', () => {
    const map = deleteItems(sample(), ['b', 'k']);

    expect(map.objects.map((item) => item.id)).toEqual(['r']);
    expect(map.capturePoints).toEqual([]);
  });

  it('copies with fresh ids and an offset', () => {
    const { map, ids } = duplicateItems(sample(), ['b'], { x: 5, y: 5 });

    expect(ids).toHaveLength(1);
    expect(ids[0]).not.toBe('b');
    expect(findItem(map, ids[0])).toMatchObject({ kind: 'building', points: [{ x: 5, y: 5 }, {}, {}, {}] });
  });
});

describe('placeKingOfTheHill', () => {
  it('puts the capture point in the middle and the teams at opposite edges', () => {
    const map = placeKingOfTheHill(sample());
    const [red, blue] = map.spawns;

    expect(map.capturePoints).toHaveLength(1);
    expect(map.capturePoints[0]).toMatchObject({ x: 200, y: 150 });
    expect(red.team).toBe('red');
    expect(blue.team).toBe('blue');
    expect(Math.max(...red.points.map((point) => point.x))).toBeLessThan(200);
    expect(Math.min(...blue.points.map((point) => point.x))).toBeGreaterThan(200);
  });
});
