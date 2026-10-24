import {
  isArea,
  PIXELS_PER_METER,
  type CapturePoint,
  type MapBounds,
  type MapObject,
  type MapObjectKind,
  type MapPoint,
  type SpawnZone,
  type TankiMap,
  type Team
} from '../map/format';
import {
  boundsOf,
  boxCorners,
  distanceToLine,
  enclosingBox,
  outlinePath,
  pointInPolygon,
  rotatePoint
} from '../map/geometry';

/**
 * Pure edits of a {@link TankiMap}: each returns a new map and shares everything it did not
 * change, so the editor can keep old maps as undo steps. Items are found by id.
 */

/** Anything the editor selects: a terrain object, a spawn zone or a capture point. */
export type MapItem = MapObject | SpawnZone | CapturePoint;

/** Every item, topmost first: the order clicks look for them in. */
function itemsTopmostFirst(map: TankiMap): MapItem[] {
  const objects = [...map.objects].reverse();

  return [
    ...[...map.capturePoints].reverse(),
    ...[...map.spawns].reverse(),
    ...HIT_ORDER.flatMap((kind) => objects.filter((object) => object.kind === kind))
  ];
}

/** The item with `id`, if the map has one. */
export function findItem(map: TankiMap, id: string): MapItem | undefined {
  return (
    map.objects.find((item) => item.id === id) ??
    map.spawns.find((item) => item.id === id) ??
    map.capturePoints.find((item) => item.id === id)
  );
}

/** Id of the topmost item under `point`; lines and edges count within `tolerance` world pixels. */
export function itemAt(map: TankiMap, point: MapPoint, tolerance: number) {
  return itemsTopmostFirst(map).find((item) => hits(item, point, tolerance))?.id;
}

/** Ids of the items lying entirely inside `rect`, in map order. */
export function itemsInside(map: TankiMap, rect: MapBounds) {
  return [...map.objects, ...map.spawns, ...map.capturePoints]
    .filter((item) => {
      const bounds = itemBounds(item);

      return (
        bounds.x >= rect.x &&
        bounds.y >= rect.y &&
        bounds.x + bounds.width <= rect.x + rect.width &&
        bounds.y + bounds.height <= rect.y + rect.height
      );
    })
    .map((item) => item.id);
}

/** Smallest axis-aligned rectangle around an item, roads and capture circles included. */
export function itemBounds(item: MapItem): MapBounds {
  if (isCapturePoint(item)) {
    return { x: item.x - item.radius, y: item.y - item.radius, width: item.radius * 2, height: item.radius * 2 };
  }

  if (isCrate(item)) {
    return boundsOf(boxCorners(item, item.size, item.rotation));
  }

  const bounds = boundsOf(item.points);

  if (isRoad(item)) {
    const half = item.width / 2;

    return {
      x: bounds.x - half,
      y: bounds.y - half,
      width: bounds.width + item.width,
      height: bounds.height + item.width
    };
  }

  return bounds;
}

/** Bounds of every item in `ids`, or `undefined` when none of them exist. */
export function selectionBounds(map: TankiMap, ids: readonly string[]) {
  const corners = ids.flatMap((id) => {
    const item = findItem(map, id);

    if (!item) {
      return [];
    }

    const bounds = itemBounds(item);

    return [
      { x: bounds.x, y: bounds.y },
      { x: bounds.x + bounds.width, y: bounds.y + bounds.height }
    ];
  });

  return corners.length > 0 ? boundsOf(corners) : undefined;
}

/** Adds a terrain object, a spawn zone or a capture point on top of the others of its sort. */
export function addItem(map: TankiMap, item: MapItem): TankiMap {
  if (isCapturePoint(item)) {
    return { ...map, capturePoints: [...map.capturePoints, item] };
  }

  if (isSpawn(item)) {
    return { ...map, spawns: [...map.spawns, item] };
  }

  return { ...map, objects: [...map.objects, item] };
}

/** Removes the items in `ids`. */
export function deleteItems(map: TankiMap, ids: readonly string[]): TankiMap {
  const doomed = new Set(ids);

  return {
    ...map,
    objects: map.objects.filter((item) => !doomed.has(item.id)),
    spawns: map.spawns.filter((item) => !doomed.has(item.id)),
    capturePoints: map.capturePoints.filter((item) => !doomed.has(item.id))
  };
}

/** Copies the items in `ids` with fresh ids, shifted by `offset`; returns the map and the new ids. */
export function duplicateItems(map: TankiMap, ids: readonly string[], offset: MapPoint) {
  const copies = ids
    .map((id) => findItem(map, id))
    .filter((item) => item !== undefined)
    .map((item) => ({ ...moveItem(item, offset), id: createId(itemPrefix(item)) }));

  return { map: copies.reduce(addItem, map), ids: copies.map((item) => item.id) };
}

/** Moves the items in `ids` by `offset`. */
export function moveItems(map: TankiMap, ids: readonly string[], offset: MapPoint) {
  return updateItems(map, ids, (item) => moveItem(item, offset));
}

/** Turns the items in `ids` by `angle` radians around `center`. */
export function rotateItems(map: TankiMap, ids: readonly string[], center: MapPoint, angle: number) {
  return updateItems(map, ids, (item) => rotateItem(item, center, angle));
}

/**
 * Replaces the item with `id` by `patch(item)`; the patch keeps the item's sort. Used for
 * property edits such as a building's height or a spawn zone's team.
 */
export function updateItem<T extends MapItem>(map: TankiMap, id: string, patch: (item: T) => T): TankiMap {
  return updateItems(map, [id], (item) => patch(item as T));
}

/**
 * Turns the terrain object with `id` into `kind`, keeping its place and size: areas keep their
 * outline, a crate becomes its box outline or the road along its long side, a road becomes the
 * outline of its band, and anything becomes a crate through its smallest enclosing box.
 */
export function changeKind(map: TankiMap, id: string, kind: MapObjectKind): TankiMap {
  return {
    ...map,
    objects: map.objects.map((object) => (object.id === id && object.kind !== kind ? convert(object, kind) : object))
  };
}

/** Sets the team of the spawn zone with `id`. */
export function setTeam(map: TankiMap, id: string, team: Team): TankiMap {
  return { ...map, spawns: map.spawns.map((spawn) => (spawn.id === id ? { ...spawn, team } : spawn)) };
}

/**
 * Outlines of an item that the editor lets you reshape point by point: a polygon's outline and
 * holes, a road's line or a spawn zone. Crates and capture points have none.
 */
export function editableRings(item: MapItem): MapPoint[][] {
  if (isCrate(item) || isCapturePoint(item)) {
    return [];
  }

  return 'holes' in item ? [item.points, ...item.holes] : [item.points];
}

/** Tells whether the rings of `item` are closed outlines rather than an open road line. */
export function hasClosedRings(item: MapItem) {
  return !isRoad(item);
}

/** A corner of an editable ring: ring 0 is the outline or road line, then the holes. */
export type VertexRef = { id: string; ring: number; index: number };

/** Moves one corner to `point`. */
export function moveVertex(map: TankiMap, vertex: VertexRef, point: MapPoint) {
  return editRing(map, vertex, (ring) => ring.map((corner, index) => (index === vertex.index ? point : corner)));
}

/** Inserts a corner at `point`, which becomes number `vertex.index` of its ring. */
export function insertVertex(map: TankiMap, vertex: VertexRef, point: MapPoint) {
  return editRing(map, vertex, (ring) => [...ring.slice(0, vertex.index), point, ...ring.slice(vertex.index)]);
}

/**
 * Removes one corner. An outline keeps at least three corners and a road two; a hole that drops
 * below three disappears.
 */
export function removeVertex(map: TankiMap, vertex: VertexRef) {
  return editRing(map, vertex, (ring, closed) => {
    const minimum = closed ? 3 : 2;
    const next = ring.filter((_corner, index) => index !== vertex.index);

    if (next.length >= minimum) {
      return next;
    }

    return vertex.ring > 0 ? undefined : ring;
  });
}

/**
 * Lays out a King of the Hill match, replacing existing spawn zones and capture points: a
 * capture point near the middle of the map, a red spawn zone in its western fifth and a blue
 * one in its eastern fifth. Each goes to the open ground nearest its ideal place, away from
 * buildings, walls, crates and water.
 */
export function placeKingOfTheHill(map: TankiMap): TankiMap {
  const { x, y, width, height } = map.bounds;
  const center = { x: x + width / 2, y: y + height / 2 };
  const blocked = createBlockedTest(map);
  const radius = Math.min(CAPTURE_RADIUS, width / 6, height / 6);
  const capture = mostOpen(
    grid(center.x - width * 0.15, center.y - height * 0.15, width * 0.3, height * 0.3, 9, 9),
    (point) => circleSamples(point, radius),
    (point) => Math.hypot(point.x - center.x, point.y - center.y) / Math.max(width, height),
    blocked
  );
  const zone = { x: Math.min(width * 0.12, SPAWN_SIZE.x), y: Math.min(height * 0.3, SPAWN_SIZE.y) };
  const inset = Math.min(width * 0.03, 8 * PIXELS_PER_METER);
  const spawnAt = (left: number) =>
    mostOpen(
      grid(left, y + inset, width * 0.2 - zone.x - inset, height - zone.y - inset * 2, 5, 13),
      (corner) => rectangleSamples(corner, zone),
      (corner) => Math.abs(corner.y + zone.y / 2 - capture.y) / height,
      blocked
    );
  const red = spawnAt(x + inset);
  const blue = spawnAt(x + width * 0.8);

  return {
    ...map,
    spawns: [
      { id: createId('spawn'), team: 'red', points: rectangle(red, zone.x, zone.y) },
      { id: createId('spawn'), team: 'blue', points: rectangle(blue, zone.x, zone.y) }
    ],
    capturePoints: [{ id: createId('capture'), x: capture.x, y: capture.y, radius }]
  };
}

/** Corners of an axis-aligned rectangle from its top-left corner, clockwise on screen. */
export function rectangle(corner: MapPoint, width: number, height: number): MapPoint[] {
  return [
    { x: corner.x, y: corner.y },
    { x: corner.x + width, y: corner.y },
    { x: corner.x + width, y: corner.y + height },
    { x: corner.x, y: corner.y + height }
  ];
}

/** A fresh id: `prefix`, a dash and random letters. Unique enough within one map. */
export function createId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Default height of new buildings: 12 m, four floors. */
export const BUILDING_HEIGHT = 12 * PIXELS_PER_METER;

/** Default height of new walls: 3 m. */
export const WALL_HEIGHT = 3 * PIXELS_PER_METER;

/** Default road width: 8 m, two lanes. */
export const ROAD_WIDTH = 8 * PIXELS_PER_METER;

/** The game's crate, a long box. */
export const CRATE_SIZE = { x: 42.5, y: 92.5 };

/** Default capture point radius: 15 m, room for a few tanks. */
export const CAPTURE_RADIUS = 15 * PIXELS_PER_METER;

/** Default spawn zone: 40 x 60 m. */
export const SPAWN_SIZE = { x: 40 * PIXELS_PER_METER, y: 60 * PIXELS_PER_METER };

/** Tells a spawn zone from other items. */
export function isSpawn(item: MapItem): item is SpawnZone {
  return 'team' in item;
}

/** Tells a capture point from other items. */
export function isCapturePoint(item: MapItem): item is CapturePoint {
  return 'radius' in item;
}

/** Tells a terrain object from other items. */
export function isObject(item: MapItem): item is MapObject {
  return 'kind' in item;
}

/**
 * Point test for ground tanks cannot hold: inside a building, wall, crate or water. Each
 * outline's bounds are checked first, so testing many points against a city stays quick.
 */
function createBlockedTest(map: TankiMap) {
  const obstacles = map.objects
    .filter((object) => object.kind !== 'road' && object.kind !== 'park')
    .map((object) => ({
      bounds: itemBounds(object),
      rings: object.kind === 'crate' ? [boxCorners(object, object.size, object.rotation)] : editableRings(object)
    }));

  return (point: MapPoint) =>
    obstacles.some(
      ({ bounds, rings }) =>
        point.x >= bounds.x &&
        point.y >= bounds.y &&
        point.x <= bounds.x + bounds.width &&
        point.y <= bounds.y + bounds.height &&
        pointInPolygon(point, rings)
    );
}

/**
 * The candidate whose sample points are least blocked; `penalty` (0 to 1) breaks ties toward
 * the ideal place.
 */
function mostOpen(
  candidates: MapPoint[],
  samples: (candidate: MapPoint) => MapPoint[],
  penalty: (candidate: MapPoint) => number,
  blocked: (point: MapPoint) => boolean
) {
  let best = candidates[0];
  let bestScore = Infinity;

  for (const candidate of candidates) {
    const points = samples(candidate);
    const score = points.filter(blocked).length / points.length + penalty(candidate) * 0.25;

    if (score < bestScore) {
      best = candidate;
      bestScore = score;
    }
  }

  return best;
}

/** `columns` x `rows` points spread evenly over a rectangle, edges included. */
function grid(left: number, top: number, width: number, height: number, columns: number, rows: number) {
  const points: MapPoint[] = [];

  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      points.push({
        x: left + (columns > 1 ? (Math.max(width, 0) * column) / (columns - 1) : 0),
        y: top + (rows > 1 ? (Math.max(height, 0) * row) / (rows - 1) : 0)
      });
    }
  }

  return points;
}

function circleSamples(center: MapPoint, radius: number) {
  return grid(center.x - radius, center.y - radius, radius * 2, radius * 2, 7, 7).filter(
    (point) => Math.hypot(point.x - center.x, point.y - center.y) <= radius
  );
}

function rectangleSamples(corner: MapPoint, size: MapPoint) {
  return grid(corner.x, corner.y, size.x, size.y, 6, 8);
}

/** Order clicks search terrain kinds in: solid things above ground cover. */
const HIT_ORDER: MapObjectKind[] = ['crate', 'building', 'wall', 'road', 'park', 'water'];

function isCrate(item: MapItem): item is Extract<MapObject, { kind: 'crate' }> {
  return isObject(item) && item.kind === 'crate';
}

function isRoad(item: MapItem): item is Extract<MapObject, { kind: 'road' }> {
  return isObject(item) && item.kind === 'road';
}

function hits(item: MapItem, point: MapPoint, tolerance: number) {
  if (isCapturePoint(item)) {
    return Math.hypot(point.x - item.x, point.y - item.y) <= item.radius + tolerance;
  }

  if (isCrate(item)) {
    const corners = boxCorners(item, item.size, item.rotation);

    return pointInPolygon(point, [corners]) || distanceToLine(point, corners, true) <= tolerance;
  }

  if (isRoad(item)) {
    return distanceToLine(point, item.points, false) <= item.width / 2 + tolerance;
  }

  const rings = editableRings(item);

  return pointInPolygon(point, rings) || rings.some((ring) => distanceToLine(point, ring, true) <= tolerance);
}

function updateItems(map: TankiMap, ids: readonly string[], update: (item: MapItem) => MapItem): TankiMap {
  const chosen = new Set(ids);

  return {
    ...map,
    objects: map.objects.map((item) => (chosen.has(item.id) ? (update(item) as MapObject) : item)),
    spawns: map.spawns.map((item) => (chosen.has(item.id) ? (update(item) as SpawnZone) : item)),
    capturePoints: map.capturePoints.map((item) => (chosen.has(item.id) ? (update(item) as CapturePoint) : item))
  };
}

function moveItem<T extends MapItem>(item: T, offset: MapPoint): T {
  return transformItem(item, (point) => ({ x: point.x + offset.x, y: point.y + offset.y }), 0);
}

function rotateItem<T extends MapItem>(item: T, center: MapPoint, angle: number): T {
  return transformItem(item, (point) => rotatePoint(point, center, angle), angle);
}

/** Copy of `item` with every point mapped through `map`, and crates also turned by `turn`. */
function transformItem<T extends MapItem>(item: T, map: (point: MapPoint) => MapPoint, turn: number): T {
  const copy: MapItem = { ...item };

  if ('points' in copy) {
    copy.points = copy.points.map(map);
  }

  if ('holes' in copy) {
    copy.holes = copy.holes.map((hole) => hole.map(map));
  }

  if ('x' in copy) {
    const center = map(copy);
    copy.x = center.x;
    copy.y = center.y;
  }

  if ('rotation' in copy) {
    copy.rotation = normalizeAngle(copy.rotation + turn);
  }

  return copy as T;
}

function editRing(
  map: TankiMap,
  vertex: VertexRef,
  edit: (ring: MapPoint[], closed: boolean) => MapPoint[] | undefined
): TankiMap {
  return updateItems(map, [vertex.id], (item) => {
    const rings = editableRings(item);
    const ring = rings[vertex.ring];

    if (!ring) {
      return item;
    }

    const next = edit(ring, hasClosedRings(item));

    if (vertex.ring === 0) {
      return next ? ({ ...item, points: next } as MapItem) : item;
    }

    const holes = rings.slice(1).flatMap((hole, index) => (index === vertex.ring - 1 ? (next ? [next] : []) : [hole]));

    return { ...item, holes } as MapItem;
  });
}

function convert(object: MapObject, kind: MapObjectKind): MapObject {
  const { id } = object;

  if (kind === 'crate') {
    const box = enclosingBox(outlineOf(object));

    return { id, kind, x: box.center.x, y: box.center.y, size: box.size, rotation: box.rotation };
  }

  if (kind === 'road') {
    return { id, kind, ...roadAlong(object) };
  }

  const area = isArea(object)
    ? { points: object.points, holes: object.holes }
    : { points: outlineOf(object), holes: [] as MapPoint[][] };

  switch (kind) {
    case 'building':
      return { id, kind, ...area, height: 'height' in object ? object.height : BUILDING_HEIGHT };
    case 'wall':
      return { id, kind, ...area, height: 'height' in object ? Math.min(object.height, BUILDING_HEIGHT) : WALL_HEIGHT };
    default:
      return { id, kind, ...area };
  }
}

/** Outline polygon of any terrain object. */
function outlineOf(object: MapObject): MapPoint[] {
  switch (object.kind) {
    case 'crate':
      return boxCorners(object, object.size, object.rotation);
    case 'road':
      return outlinePath(object.points, object.width);
    default:
      return object.points;
  }
}

/** A road covering an object: a crate's long axis, or an area's outline as a closed loop. */
function roadAlong(object: MapObject) {
  if (object.kind === 'crate') {
    const long = object.size.y >= object.size.x;
    const half = (long ? object.size.y : object.size.x) / 2;
    const ends = long
      ? [
          { x: object.x, y: object.y - half },
          { x: object.x, y: object.y + half }
        ]
      : [
          { x: object.x - half, y: object.y },
          { x: object.x + half, y: object.y }
        ];

    return {
      points: ends.map((end) => rotatePoint(end, object, object.rotation)),
      width: long ? object.size.x : object.size.y
    };
  }

  if (object.kind === 'road') {
    return { points: object.points, width: object.width };
  }

  return { points: [...object.points, object.points[0]], width: ROAD_WIDTH };
}

function itemPrefix(item: MapItem) {
  if (isCapturePoint(item)) {
    return 'capture';
  }

  return isSpawn(item) ? 'spawn' : item.kind;
}

function normalizeAngle(angle: number) {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}
