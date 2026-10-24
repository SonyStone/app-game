import { createEmptyMap, PIXELS_PER_METER, type MapObject, type MapPoint, type TankiMap } from './format';
import { clipPath, clipRing, outlinePath, pointInPolygon, ringArea, simplifyPath, simplifyRing } from './geometry';

/**
 * Imports a square piece of OpenStreetMap through the Overpass API: buildings, roads, parks,
 * water and city walls become map objects in world pixels at {@link PIXELS_PER_METER}, clipped
 * to the square, simplified, and stripped of pieces too small to matter for tanks.
 */

/** A square piece of the world: its center in degrees and its side in meters. */
export type OsmArea = { lat: number; lon: number; sizeMeters: number };

/** Places in central Moscow from the 2017 level sketches. */
export const MOSCOW_PLACES = [
  { name: 'Lubyanka Square', lat: 55.7597, lon: 37.6263 },
  { name: 'Borovitskaya Square', lat: 55.7497, lon: 37.6082 },
  { name: 'Vozdvizhenka & Mokhovaya', lat: 55.7525, lon: 37.6087 },
  { name: 'Kitay-gorod', lat: 55.7563, lon: 37.6318 }
] as const;

/** Lubyanka Square, 400 m across: what the import dialog suggests first. */
export const DEFAULT_OSM_AREA: OsmArea = { lat: MOSCOW_PLACES[0].lat, lon: MOSCOW_PLACES[0].lon, sizeMeters: 400 };

/** Public Overpass API instance. */
export const OVERPASS_ENDPOINT = 'https://overpass-api.de/api/interpreter';

/** Credit that the Open Database License asks for wherever the data is shown. */
export const OSM_ATTRIBUTION = '© OpenStreetMap contributors (ODbL)';

/** Geographic box of `area` in degrees, the same square that {@link createProjection} maps. */
export function areaBox(area: OsmArea) {
  const halfLat = area.sizeMeters / 2 / METERS_PER_DEGREE;
  const halfLon = area.sizeMeters / 2 / (METERS_PER_DEGREE * Math.cos(toRadians(area.lat)));

  return { south: area.lat - halfLat, west: area.lon - halfLon, north: area.lat + halfLat, east: area.lon + halfLon };
}

/** Overpass QL query for everything the import uses inside `area`, with geometry inline. */
export function overpassQuery(area: OsmArea) {
  const { south, west, north, east } = areaBox(area);
  const bbox = [south, west, north, east].map((value) => value.toFixed(6)).join(',');

  return [
    `[out:json][timeout:25][bbox:${bbox}];`,
    '(',
    '  way[building];',
    '  relation[building][type=multipolygon];',
    `  way[highway~"^(${Object.keys(ROAD_WIDTHS).join('|')})$"][footway!~"^(${SIDEWALKS.join('|')})$"][area!=yes];`,
    `  way[leisure~"^(${GREEN_LEISURE.join('|')})$"];`,
    `  relation[leisure~"^(${GREEN_LEISURE.join('|')})$"][type=multipolygon];`,
    `  way[landuse~"^(${GREEN_LANDUSE.join('|')})$"];`,
    `  relation[landuse~"^(${GREEN_LANDUSE.join('|')})$"][type=multipolygon];`,
    `  way[natural~"^(water|${GREEN_NATURAL.join('|')})$"];`,
    `  relation[natural~"^(water|${GREEN_NATURAL.join('|')})$"][type=multipolygon];`,
    '  way[waterway=riverbank];',
    '  relation[waterway=riverbank][type=multipolygon];',
    '  way[amenity=fountain];',
    '  way[barrier=city_wall];',
    ');',
    'out geom;'
  ].join('\n');
}

/**
 * Maps degrees to world pixels: an equirectangular projection around the area's center, which
 * is exact enough for a few kilometers. The area's north-west corner lands at the origin and
 * its center at half its size in pixels; y grows southward.
 */
export function createProjection(area: OsmArea) {
  const half = (area.sizeMeters * PIXELS_PER_METER) / 2;
  const pixelsPerDegreeLat = METERS_PER_DEGREE * PIXELS_PER_METER;
  const pixelsPerDegreeLon = pixelsPerDegreeLat * Math.cos(toRadians(area.lat));

  return (lat: number, lon: number): MapPoint => ({
    x: half + (lon - area.lon) * pixelsPerDegreeLon,
    y: half - (lat - area.lat) * pixelsPerDegreeLat
  });
}

/** Result of an import step: a value, or a message for the user. */
export type ImportResult<T> = { ok: true; value: T } | { ok: false; error: string };

/**
 * Downloads `area` from Overpass. Network failures, busy servers, timeouts and broken replies
 * come back as messages rather than exceptions; `signal` cancels the request.
 *
 * @param fetcher - Replaces `fetch`, for tests.
 */
export async function fetchOverpass(
  area: OsmArea,
  options: { signal?: AbortSignal; endpoint?: string; fetcher?: typeof fetch } = {}
): Promise<ImportResult<unknown>> {
  const { signal, endpoint = OVERPASS_ENDPOINT, fetcher = fetch } = options;
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  let response: Response;

  try {
    response = await fetcher(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ data: overpassQuery(area) }),
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout
    });
  } catch (error) {
    if (signal?.aborted) {
      return { ok: false, error: 'Import cancelled.' };
    }

    if (timeout.aborted) {
      return {
        ok: false,
        error: `Overpass did not answer within ${REQUEST_TIMEOUT_MS / 1000} s. Try a smaller area or retry later.`
      };
    }

    return { ok: false, error: `Could not reach Overpass (${describe(error)}). Check the connection and retry.` };
  }

  if (!response.ok) {
    return { ok: false, error: statusMessage(response.status, await response.text().catch(() => '')) };
  }

  let body: unknown;

  try {
    body = await response.json();
  } catch {
    return { ok: false, error: 'Overpass sent a reply that is not JSON. Retry later.' };
  }

  const remark = (body as { remark?: unknown } | null)?.remark;

  if (typeof remark === 'string' && /error/i.test(remark)) {
    return { ok: false, error: `Overpass stopped the query: ${remark.trim()}` };
  }

  return { ok: true, value: body };
}

/**
 * Turns an Overpass reply for `area` into a map of the area's square: buildings with heights
 * from their tags, walls, roads with widths from their class, parks and water. Multipolygon
 * relations keep their courtyards as holes. Objects get ids like `way/123`; a relation split
 * into several outlines numbers them `relation/45#2`.
 */
export function overpassToMap(reply: unknown, area: OsmArea, name = 'OpenStreetMap import'): ImportResult<TankiMap> {
  const elements = (reply as { elements?: unknown } | null)?.elements;

  if (!Array.isArray(elements)) {
    return { ok: false, error: 'The Overpass reply has no element list.' };
  }

  const project = createProjection(area);
  const size = area.sizeMeters * PIXELS_PER_METER;
  const map: TankiMap = {
    ...createEmptyMap(name, size, size),
    source: {
      kind: 'openstreetmap',
      lat: area.lat,
      lon: area.lon,
      sizeMeters: area.sizeMeters,
      pixelsPerMeter: PIXELS_PER_METER,
      attribution: OSM_ATTRIBUTION
    }
  };
  const square = map.bounds;

  for (const element of elements as OverpassElement[]) {
    const tags = element.tags ?? {};
    const kind = classify(tags);

    if (!kind) {
      continue;
    }

    const id = `${element.type}/${element.id}`;

    if (kind === 'road') {
      const line = element.type === 'way' ? projectLine(element.geometry, project) : [];
      const width = round1(roadWidth(tags) * PIXELS_PER_METER);

      clipPath(line, square)
        .map((piece) => simplifyPath(piece, ROAD_TOLERANCE))
        .forEach((points, index, pieces) =>
          map.objects.push({ id: numbered(id, index, pieces.length), kind: 'road', points: points.map(round), width })
        );
      continue;
    }

    const polygons =
      kind === 'wall' && element.type === 'way' && !isClosed(element.geometry)
        ? [{ outer: outlinePath(projectLine(element.geometry, project), wallThickness(tags)), holes: [] }]
        : polygonsOf(element, project);

    polygons
      .map((polygon) => fitPolygon(polygon, square, kind))
      .filter((polygon) => polygon !== undefined)
      .forEach((polygon, index, list) =>
        map.objects.push(areaObject(numbered(id, index, list.length), kind, polygon, tags))
      );
  }

  return { ok: true, value: map };
}

/** One element of an Overpass `out geom` reply; nodes are not requested. */
type OverpassElement = {
  type: 'node' | 'way' | 'relation';
  id: number;
  tags?: Record<string, string>;
  /** Way geometry; `null` marks a node Overpass left out. */
  geometry?: (LatLon | null)[];
  members?: { type: string; ref: number; role: string; geometry?: (LatLon | null)[] }[];
};

type LatLon = { lat: number; lon: number };
type Tags = Record<string, string>;
type ImportKind = MapObject['kind'];
type Polygon = { outer: MapPoint[]; holes: MapPoint[][] };

const METERS_PER_DEGREE = (6_371_008.8 * Math.PI) / 180;
const REQUEST_TIMEOUT_MS = 60_000;

const GREEN_LEISURE = ['park', 'garden', 'playground', 'pitch', 'common', 'dog_park'];
const GREEN_LANDUSE = ['grass', 'forest', 'meadow', 'recreation_ground', 'village_green', 'flowerbed', 'cemetery'];
const GREEN_NATURAL = ['wood', 'scrub', 'grassland', 'heath'];

/** Road width in meters by `highway` class; classes missing here are not imported. */
const ROAD_WIDTHS: Record<string, number> = {
  motorway: 24,
  trunk: 22,
  primary: 18,
  secondary: 14,
  tertiary: 11,
  unclassified: 8,
  residential: 8,
  living_street: 6,
  service: 5,
  pedestrian: 8,
  motorway_link: 8,
  trunk_link: 8,
  primary_link: 8,
  secondary_link: 7,
  tertiary_link: 7,
  track: 4,
  footway: 3,
  cycleway: 2.5,
  path: 2.5,
  bridleway: 2.5
};

/**
 * `footway` values of the pavements Moscow maps beside nearly every street; the dark ground
 * already shows them, and as lines they would bury the streets.
 */
const SIDEWALKS = ['sidewalk', 'crossing', 'traffic_island'];

/** Building heights in meters for types that are usually not 12 m tall, used without height tags. */
const TYPE_HEIGHTS: Record<string, number> = {
  garage: 3,
  garages: 3,
  shed: 3,
  kiosk: 3,
  hut: 3,
  carport: 3,
  service: 4,
  toilets: 3,
  transformer_tower: 5,
  church: 22,
  cathedral: 30,
  chapel: 10
};

const DEFAULT_BUILDING_HEIGHT = 12;
const LEVEL_HEIGHT = 3.3;
const DEFAULT_WALL_HEIGHT = 8;
const DEFAULT_WALL_THICKNESS = 5;

/** Simplification tolerances in world pixels: about 0.4 m for buildings and walls, 1 m for the rest. */
const BUILDING_TOLERANCE = 0.4 * PIXELS_PER_METER;
const GROUND_TOLERANCE = 1 * PIXELS_PER_METER;
const ROAD_TOLERANCE = 0.75 * PIXELS_PER_METER;

/** Smallest outlines kept, in square world pixels: 12 m² for buildings, 20 m² for ground, 6 m² for holes. */
const MIN_BUILDING_AREA = 12 * PIXELS_PER_METER ** 2;
const MIN_GROUND_AREA = 20 * PIXELS_PER_METER ** 2;
const MIN_HOLE_AREA = 6 * PIXELS_PER_METER ** 2;

/** Map kind for OSM `tags`, or `undefined` for things the game does not show. */
function classify(tags: Tags): ImportKind | undefined {
  if (isUnderground(tags)) {
    return undefined;
  }

  if (tags.building && tags.building !== 'no' && tags.building !== 'roof') {
    return 'building';
  }

  if (tags.barrier === 'city_wall') {
    return 'wall';
  }

  if (tags.natural === 'water' || tags.waterway === 'riverbank' || tags.amenity === 'fountain') {
    return 'water';
  }

  if (
    GREEN_LEISURE.includes(tags.leisure) ||
    GREEN_LANDUSE.includes(tags.landuse) ||
    GREEN_NATURAL.includes(tags.natural)
  ) {
    return 'park';
  }

  if (tags.highway in ROAD_WIDTHS && !SIDEWALKS.includes(tags.footway) && tags.area !== 'yes') {
    return 'road';
  }

  return undefined;
}

/** Below ground, in a tunnel or under a building: invisible from above. */
function isUnderground(tags: Tags) {
  return (
    Number.parseFloat(tags.layer ?? '0') < 0 ||
    tags.location === 'underground' ||
    tags.building === 'underground' ||
    (tags.tunnel !== undefined && tags.tunnel !== 'no')
  );
}

/** Outlines of a closed way or a multipolygon relation, with holes matched to their outlines. */
function polygonsOf(element: OverpassElement, project: Projection): Polygon[] {
  if (element.type === 'way') {
    return isClosed(element.geometry) ? [{ outer: projectLine(element.geometry, project), holes: [] }] : [];
  }

  if (element.type !== 'relation') {
    return [];
  }

  const members = (element.members ?? []).filter((member) => member.type === 'way' && member.geometry);
  const outers = assembleRings(
    members.filter((member) => member.role !== 'inner').map((member) => projectLine(member.geometry, project))
  );
  const inners = assembleRings(
    members.filter((member) => member.role === 'inner').map((member) => projectLine(member.geometry, project))
  );
  const polygons = outers.map((outer) => ({ outer, holes: [] as MapPoint[][] }));

  for (const inner of inners) {
    polygons.find((polygon) => pointInPolygon(inner[0], [polygon.outer]))?.holes.push(inner);
  }

  return polygons;
}

/**
 * Joins way pieces into closed rings by their shared end points, reversing pieces as needed.
 * Chains that never close, as in a relation that Overpass returned incomplete, are dropped.
 */
function assembleRings(lines: MapPoint[][]) {
  const rings: MapPoint[][] = [];
  const pool = lines.filter((line) => line.length >= 2);

  while (pool.length > 0) {
    const ring = [...pool.pop()!];

    while (!same(ring[0], ring[ring.length - 1])) {
      const end = ring[ring.length - 1];
      const index = pool.findIndex((line) => same(line[0], end) || same(line[line.length - 1], end));

      if (index < 0) {
        break;
      }

      const [next] = pool.splice(index, 1);
      ring.push(...(same(next[0], end) ? next : [...next].reverse()).slice(1));
    }

    if (ring.length >= 4 && same(ring[0], ring[ring.length - 1])) {
      rings.push(ring.slice(0, -1));
    }
  }

  return rings;
}

/** Clips, simplifies and size-filters a polygon for `kind`; `undefined` when nothing is left. */
function fitPolygon(polygon: Polygon, square: TankiMap['bounds'], kind: ImportKind): Polygon | undefined {
  const building = kind === 'building' || kind === 'wall';
  const tolerance = building ? BUILDING_TOLERANCE : GROUND_TOLERANCE;
  const minArea = building ? MIN_BUILDING_AREA : MIN_GROUND_AREA;
  const outer = simplifyRing(clipRing(polygon.outer, square), tolerance);

  if (outer.length < 3 || ringArea(outer) < minArea) {
    return undefined;
  }

  const holes = polygon.holes
    .map((hole) => simplifyRing(clipRing(hole, square), tolerance))
    .filter((hole) => hole.length >= 3 && ringArea(hole) >= MIN_HOLE_AREA);

  return { outer: outer.map(round), holes: holes.map((hole) => hole.map(round)) };
}

function areaObject(id: string, kind: ImportKind, polygon: Polygon, tags: Tags): MapObject {
  const shape = { id, points: polygon.outer, holes: polygon.holes };

  switch (kind) {
    case 'building':
      return { ...shape, kind, height: round1(buildingHeight(tags) * PIXELS_PER_METER) };
    case 'wall':
      return { ...shape, kind, height: round1((meters(tags.height) ?? DEFAULT_WALL_HEIGHT) * PIXELS_PER_METER) };
    case 'water':
      return { ...shape, kind };
    default:
      return { ...shape, kind: 'park' };
  }
}

/** Height in meters from `height`, else `building:levels`, else the building type. */
function buildingHeight(tags: Tags) {
  const height = meters(tags.height);

  if (height !== undefined) {
    return height;
  }

  const levels = Number.parseFloat(tags['building:levels'] ?? '');

  if (levels > 0) {
    return levels * LEVEL_HEIGHT;
  }

  return TYPE_HEIGHTS[tags.building] ?? DEFAULT_BUILDING_HEIGHT;
}

/** Road width in meters from `width`, else `lanes`, else the road class. */
function roadWidth(tags: Tags) {
  const width = meters(tags.width);

  if (width !== undefined) {
    return width;
  }

  const lanes = Number.parseInt(tags.lanes ?? '', 10);

  return lanes > 0 ? Math.max(lanes * 3.5, ROAD_WIDTHS[tags.highway]) : ROAD_WIDTHS[tags.highway];
}

function wallThickness(tags: Tags) {
  return (meters(tags.width) ?? DEFAULT_WALL_THICKNESS) * PIXELS_PER_METER;
}

/** A positive length in meters from an OSM value such as `12`, `12.5 m` or `12,5`. */
function meters(value: string | undefined) {
  const number = Number.parseFloat((value ?? '').replace(',', '.'));

  return number > 0 ? number : undefined;
}

type Projection = ReturnType<typeof createProjection>;

function projectLine(geometry: OverpassElement['geometry'], project: Projection) {
  return (geometry ?? []).filter((point) => point !== null).map((point) => project(point.lat, point.lon));
}

function isClosed(geometry: OverpassElement['geometry']) {
  const points = geometry ?? [];
  const first = points[0];
  const last = points[points.length - 1];

  return points.length >= 4 && first != null && last != null && first.lat === last.lat && first.lon === last.lon;
}

function numbered(id: string, index: number, count: number) {
  return count > 1 ? `${id}#${index + 1}` : id;
}

function same(a: MapPoint, b: MapPoint) {
  return a.x === b.x && a.y === b.y;
}

/** Rounds to tenths of a pixel, which is far below what OSM outlines are accurate to. */
function round(point: MapPoint) {
  return { x: round1(point.x), y: round1(point.y) };
}

/** Rounds to tenths; `-0` becomes `0`, which JSON could not tell apart anyway. */
function round1(value: number) {
  return Math.round(value * 10) / 10 + 0;
}

function toRadians(degrees: number) {
  return (degrees * Math.PI) / 180;
}

function statusMessage(status: number, body: string) {
  if (status === 429) {
    return 'Overpass is rate-limiting this address (HTTP 429). Wait a minute and retry.';
  }

  if (status === 502 || status === 503 || status === 504) {
    return `Overpass is busy (HTTP ${status}). Retry in a moment.`;
  }

  if (status === 400) {
    return `Overpass rejected the query (HTTP 400): ${firstLine(body)}`;
  }

  return `Overpass answered HTTP ${status}${body ? `: ${firstLine(body)}` : ''}.`;
}

function firstLine(text: string) {
  return (
    text
      .replace(/<[^>]+>/g, ' ')
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line.length > 0) ?? ''
  ).slice(0, 200);
}

function describe(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
