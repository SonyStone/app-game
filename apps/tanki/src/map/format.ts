/**
 * Tanki map format, version 1: what the map editor saves and the game loads.
 *
 * All lengths and coordinates are world pixels, the game's own units, with the y axis pointing
 * down. The world scale is {@link PIXELS_PER_METER}. A polygon is a list of its corners without
 * the first one repeated at the end; its winding order carries no meaning. Angles are radians,
 * clockwise on screen.
 */

/** Value of {@link TankiMap.format}, which tells a Tanki map from other JSON. */
export const MAP_FORMAT = 'tanki-map';

/** Version this module reads and writes. A reader rejects any other version. */
export const MAP_VERSION = 1;

/**
 * World pixels per meter. A tank hull of 40 x 25 px stands for a tank of about 7 x 4.5 m;
 * maps imported from OpenStreetMap use this scale.
 */
export const PIXELS_PER_METER = 5.6;

/** A point in world pixels. */
export type MapPoint = { x: number; y: number };

/** A Tanki map: terrain objects, team spawn zones, capture points and the playable rectangle. */
export type TankiMap = {
  format: typeof MAP_FORMAT;
  version: typeof MAP_VERSION;

  /** Display name. */
  name: string;

  /** Playable rectangle; the game walls it in. Objects may stick out of it. */
  bounds: MapBounds;

  /**
   * Terrain in drawing order within each layer. The game draws water, then parks, then roads,
   * then walls, crates and buildings on top, whatever their order in this list.
   */
  objects: MapObject[];

  /** Areas where tanks of a team enter the game. */
  spawns: SpawnZone[];

  /** Points the teams fight over; the King of the Hill mode has one in the middle. */
  capturePoints: CapturePoint[];

  /** Where the map came from; absent on maps drawn from scratch. */
  source?: MapSource;
};

/** An axis-aligned rectangle in world pixels. */
export type MapBounds = { x: number; y: number; width: number; height: number };

/** Any terrain object; `kind` tells them apart. Every object has an `id` unique within the map. */
export type MapObject = Building | Wall | Crate | Road | Park | Water;

/** Kind of a terrain object. */
export type MapObjectKind = MapObject['kind'];

/** A solid building. Its height casts the sun shadow. */
export type Building = {
  id: string;
  kind: 'building';
  /** Outer outline. */
  points: MapPoint[];
  /** Courtyards: outlines of open areas inside `points`. */
  holes: MapPoint[][];
  /** Height above the ground in world pixels. */
  height: number;
};

/** A solid wall or fence: like a building, but thin and usually low. */
export type Wall = {
  id: string;
  kind: 'wall';
  points: MapPoint[];
  holes: MapPoint[][];
  /** Height above the ground in world pixels. */
  height: number;
};

/** A pushable crate, a box centered at `x`, `y`. */
export type Crate = {
  id: string;
  kind: 'crate';
  x: number;
  y: number;
  /** Extent along the crate's own x and y axes, before rotation. */
  size: MapPoint;
  rotation: number;
};

/** A road drawn on the ground; tanks drive over it. */
export type Road = {
  id: string;
  kind: 'road';
  /** Center line, open: the last point does not connect back to the first. */
  points: MapPoint[];
  /** Full width of the paved band. */
  width: number;
};

/** Grass, trees or a garden on the ground; tanks drive over it. */
export type Park = { id: string; kind: 'park'; points: MapPoint[]; holes: MapPoint[][] };

/** A river, pond or fountain on the ground. */
export type Water = { id: string; kind: 'water'; points: MapPoint[]; holes: MapPoint[][] };

/** Team of the King of the Hill mode. */
export type Team = 'red' | 'blue';

/** A polygon where tanks of `team` enter the game. */
export type SpawnZone = { id: string; team: Team; points: MapPoint[] };

/** A circle that a team captures by holding it. */
export type CapturePoint = { id: string; x: number; y: number; radius: number };

/** Origin of an imported map. */
export type MapSource = {
  kind: 'openstreetmap';
  /** Geographic center of the imported area in degrees; it lands in the middle of `bounds`. */
  lat: number;
  lon: number;
  /** Side of the imported square in meters. */
  sizeMeters: number;
  /** Scale of the import. */
  pixelsPerMeter: number;
  /** Credit the data license requires wherever the map is shown or shared. */
  attribution: string;
};

/** Every terrain kind, in the order the game draws their layers. */
export const OBJECT_KINDS = [
  'water',
  'park',
  'road',
  'wall',
  'crate',
  'building'
] as const satisfies readonly MapObjectKind[];

/** Kinds stored as polygons with holes. */
export const AREA_KINDS = ['building', 'wall', 'park', 'water'] as const satisfies readonly MapObjectKind[];

/** An object stored as a polygon with holes. */
export type AreaObject = Extract<MapObject, { kind: (typeof AREA_KINDS)[number] }>;

/** Tells whether `object` is stored as a polygon with holes. */
export function isArea(object: MapObject): object is AreaObject {
  return (AREA_KINDS as readonly string[]).includes(object.kind);
}

/** Creates an empty map of `width` x `height` world pixels at the origin. */
export function createEmptyMap(name: string, width: number, height: number): TankiMap {
  return {
    format: MAP_FORMAT,
    version: MAP_VERSION,
    name,
    bounds: { x: 0, y: 0, width, height },
    objects: [],
    spawns: [],
    capturePoints: []
  };
}

/**
 * Writes `map` as JSON text: one line per object, world coordinates and sizes rounded to
 * thousandths of a pixel, so files stay small and diff well. The source's degrees keep their
 * precision. {@link parseMap} reads the text back.
 */
export function serializeMap(map: TankiMap) {
  const { objects, spawns, capturePoints, ...header } = map;
  const lines = [
    '{',
    ...Object.entries(header)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => `  ${JSON.stringify(key)}: ${key === 'source' ? JSON.stringify(value) : toJson(value)},`),
    list('objects', objects) + ',',
    list('spawns', spawns) + ',',
    list('capturePoints', capturePoints),
    '}'
  ];

  return lines.join('\n') + '\n';

  function list(key: string, items: readonly unknown[]) {
    if (items.length === 0) {
      return `  ${JSON.stringify(key)}: []`;
    }

    return `  ${JSON.stringify(key)}: [\n${items.map((item) => `    ${toJson(item)}`).join(',\n')}\n  ]`;
  }
}

/** Result of reading a map: the map, or why it could not be read. */
export type ParseResult = { ok: true; map: TankiMap } | { ok: false; error: string };

/**
 * Reads a map from JSON text or an already parsed value. It checks every field and copies only
 * known ones, so the result is a clean {@link TankiMap}; anything malformed fails with a message
 * naming the first bad field.
 */
export function parseMap(input: unknown): ParseResult {
  try {
    const value = typeof input === 'string' ? (JSON.parse(input) as unknown) : input;

    return { ok: true, map: readMap(value) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function readMap(value: unknown): TankiMap {
  const map = record(value, 'map');

  if (map.format !== MAP_FORMAT) {
    throw new Error('Not a Tanki map: "format" must be "tanki-map".');
  }

  if (map.version !== MAP_VERSION) {
    throw new Error(`Unsupported map version ${JSON.stringify(map.version)}; this build reads version ${MAP_VERSION}.`);
  }

  const bounds = record(map.bounds, 'bounds');
  const result: TankiMap = {
    format: MAP_FORMAT,
    version: MAP_VERSION,
    name: text(map.name, 'name'),
    bounds: {
      x: finite(bounds.x, 'bounds.x'),
      y: finite(bounds.y, 'bounds.y'),
      width: positive(bounds.width, 'bounds.width'),
      height: positive(bounds.height, 'bounds.height')
    },
    objects: array(map.objects, 'objects').map((item, index) => readObject(item, `objects[${index}]`)),
    spawns: array(map.spawns, 'spawns').map((item, index) => readSpawn(item, `spawns[${index}]`)),
    capturePoints: array(map.capturePoints, 'capturePoints').map((item, index) =>
      readCapturePoint(item, `capturePoints[${index}]`)
    )
  };

  if (map.source !== undefined) {
    result.source = readSource(map.source);
  }

  const ids = [...result.objects, ...result.spawns, ...result.capturePoints].map((item) => item.id);
  const duplicate = ids.find((id, index) => ids.indexOf(id) !== index);

  if (duplicate !== undefined) {
    throw new Error(`Duplicate id "${duplicate}".`);
  }

  return result;
}

function readObject(value: unknown, path: string): MapObject {
  const object = record(value, path);
  const id = text(object.id, `${path}.id`);

  switch (object.kind) {
    case 'building':
    case 'wall':
      return {
        id,
        kind: object.kind,
        points: polygon(object.points, `${path}.points`),
        holes: array(object.holes, `${path}.holes`).map((hole, index) => polygon(hole, `${path}.holes[${index}]`)),
        height: positive(object.height, `${path}.height`)
      };
    case 'park':
    case 'water':
      return {
        id,
        kind: object.kind,
        points: polygon(object.points, `${path}.points`),
        holes: array(object.holes, `${path}.holes`).map((hole, index) => polygon(hole, `${path}.holes[${index}]`))
      };
    case 'crate': {
      const size = record(object.size, `${path}.size`);

      return {
        id,
        kind: 'crate',
        x: finite(object.x, `${path}.x`),
        y: finite(object.y, `${path}.y`),
        size: { x: positive(size.x, `${path}.size.x`), y: positive(size.y, `${path}.size.y`) },
        rotation: finite(object.rotation, `${path}.rotation`)
      };
    }
    case 'road':
      return {
        id,
        kind: 'road',
        points: points(object.points, `${path}.points`, 2),
        width: positive(object.width, `${path}.width`)
      };
    default:
      throw new Error(`${path}.kind: unknown kind ${JSON.stringify(object.kind)}.`);
  }
}

function readSpawn(value: unknown, path: string): SpawnZone {
  const spawn = record(value, path);

  if (spawn.team !== 'red' && spawn.team !== 'blue') {
    throw new Error(`${path}.team must be "red" or "blue".`);
  }

  return { id: text(spawn.id, `${path}.id`), team: spawn.team, points: polygon(spawn.points, `${path}.points`) };
}

function readCapturePoint(value: unknown, path: string): CapturePoint {
  const point = record(value, path);

  return {
    id: text(point.id, `${path}.id`),
    x: finite(point.x, `${path}.x`),
    y: finite(point.y, `${path}.y`),
    radius: positive(point.radius, `${path}.radius`)
  };
}

function readSource(value: unknown): MapSource {
  const source = record(value, 'source');

  if (source.kind !== 'openstreetmap') {
    throw new Error(`source.kind: unknown source ${JSON.stringify(source.kind)}.`);
  }

  return {
    kind: 'openstreetmap',
    lat: finite(source.lat, 'source.lat'),
    lon: finite(source.lon, 'source.lon'),
    sizeMeters: positive(source.sizeMeters, 'source.sizeMeters'),
    pixelsPerMeter: positive(source.pixelsPerMeter, 'source.pixelsPerMeter'),
    attribution: text(source.attribution, 'source.attribution')
  };
}

function polygon(value: unknown, path: string) {
  return points(value, path, 3);
}

function points(value: unknown, path: string, minimum: number) {
  const list = array(value, path);

  if (list.length < minimum) {
    throw new Error(`${path} needs at least ${minimum} points.`);
  }

  return list.map((item, index) => {
    const point = record(item, `${path}[${index}]`);

    return { x: finite(point.x, `${path}[${index}].x`), y: finite(point.y, `${path}[${index}].y`) };
  });
}

function record(value: unknown, path: string) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${path} must be an object.`);
  }

  return value as Record<string, unknown>;
}

function array(value: unknown, path: string) {
  if (!Array.isArray(value)) {
    throw new Error(`${path} must be an array.`);
  }

  return value as unknown[];
}

function text(value: unknown, path: string) {
  if (typeof value !== 'string') {
    throw new Error(`${path} must be a string.`);
  }

  return value;
}

function finite(value: unknown, path: string) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${path} must be a finite number.`);
  }

  return value;
}

function positive(value: unknown, path: string) {
  const number = finite(value, path);

  if (number <= 0) {
    throw new Error(`${path} must be greater than zero.`);
  }

  return number;
}

/** JSON of `value` with numbers rounded to thousandths; `-0` becomes `0`. */
function toJson(value: unknown) {
  return JSON.stringify(value, (_key, item: unknown) =>
    typeof item === 'number' ? Math.round(item * 1000) / 1000 + 0 : item
  );
}
