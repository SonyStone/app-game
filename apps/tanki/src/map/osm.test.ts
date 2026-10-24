import { describe, expect, it, vi } from 'vitest';
import reply from './fixtures/overpass-borovitskaya.json';
import { parseMap, PIXELS_PER_METER, serializeMap, type MapObject } from './format';
import { pointInPolygon, ringArea } from './geometry';
import { areaBox, createProjection, fetchOverpass, overpassQuery, overpassToMap } from './osm';
import { SAMPLE_AREA } from './sample';

describe('createProjection', () => {
  const area = { lat: 55.75, lon: 37.61, sizeMeters: 400 };
  const project = createProjection(area);
  const half = (400 * PIXELS_PER_METER) / 2;

  it('puts the center in the middle of the square', () => {
    expect(project(55.75, 37.61)).toEqual({ x: half, y: half });
  });

  it('maps a meter to PIXELS_PER_METER pixels, y pointing south', () => {
    const north = project(55.75 + 100 / 111_195, 37.61);
    const east = project(55.75, 37.61 + 100 / (111_195 * Math.cos((55.75 * Math.PI) / 180)));

    expect(north.x).toBeCloseTo(half, 6);
    expect(north.y).toBeCloseTo(half - 100 * PIXELS_PER_METER, 0);
    expect(east.x).toBeCloseTo(half + 100 * PIXELS_PER_METER, 0);
    expect(east.y).toBeCloseTo(half, 6);
  });

  it('maps the query box onto the square', () => {
    const box = areaBox(area);
    const northWest = project(box.north, box.west);
    const southEast = project(box.south, box.east);

    expect(northWest.x).toBeCloseTo(0, 6);
    expect(northWest.y).toBeCloseTo(0, 6);
    expect(southEast.x).toBeCloseTo(400 * PIXELS_PER_METER, 6);
    expect(southEast.y).toBeCloseTo(400 * PIXELS_PER_METER, 6);
  });
});

describe('overpassQuery', () => {
  it('asks for every layer inside the box, with geometry', () => {
    const query = overpassQuery(SAMPLE_AREA);

    expect(query).toContain('[bbox:55.746851,37.606803,55.749549,37.611597]');
    expect(query).toMatch(/way\[building\]/);
    expect(query).toMatch(/way\[highway~/);
    expect(query).toMatch(/natural~"\^\(water/);
    expect(query).toMatch(/out geom;$/);
  });
});

describe('overpassToMap on the Borovitskaya fixture', () => {
  const result = overpassToMap(reply, SAMPLE_AREA, 'Borovitskaya');
  const map = result.ok ? result.value : undefined;
  const size = SAMPLE_AREA.sizeMeters * PIXELS_PER_METER;
  const byKind = (kind: MapObject['kind']) => map?.objects.filter((object) => object.kind === kind) ?? [];

  it('imports buildings, roads, parks and the river', () => {
    expect(result.ok).toBe(true);
    expect(map?.bounds).toEqual({ x: 0, y: 0, width: size, height: size });
    expect(map?.source).toMatchObject({ kind: 'openstreetmap', sizeMeters: 300, pixelsPerMeter: PIXELS_PER_METER });
    expect(byKind('building').length).toBeGreaterThan(30);
    expect(byKind('road').length).toBeGreaterThan(40);
    expect(byKind('park').length).toBeGreaterThan(5);
    expect(byKind('water')).toHaveLength(1);
  });

  it('keeps everything inside the square', () => {
    for (const object of map?.objects ?? []) {
      for (const point of 'points' in object ? object.points : []) {
        expect(point.x).toBeGreaterThanOrEqual(0);
        expect(point.y).toBeGreaterThanOrEqual(0);
        expect(point.x).toBeLessThanOrEqual(size);
        expect(point.y).toBeLessThanOrEqual(size);
      }
    }
  });

  it('stitches the river relation from its 101 ways and clips it to the corner it covers', () => {
    const river = byKind('water')[0];

    expect(river.id).toBe('relation/222973');
    expect(river.kind === 'water' && ringArea(river.points)).toBeGreaterThan(300 * PIXELS_PER_METER ** 2);
    expect(river.kind === 'water' && pointInPolygon({ x: size - 5, y: size - 5 }, [river.points])).toBe(true);
  });

  it('assembles multipolygon buildings from their ways', () => {
    const pashkovHouse = map?.objects.find((object) => object.id === 'relation/5969167');

    expect(pashkovHouse?.kind).toBe('building');
    expect(pashkovHouse && 'points' in pashkovHouse && ringArea(pashkovHouse.points)).toBeGreaterThan(
      200 * PIXELS_PER_METER ** 2
    );
  });

  it('takes building heights from levels and roads widths from their class', () => {
    const heights = byKind('building').map((building) =>
      'height' in building ? building.height / PIXELS_PER_METER : 0
    );
    const widths = new Set(
      byKind('road').map((road) => ('width' in road ? Math.round((road.width / PIXELS_PER_METER) * 10) / 10 : 0))
    );

    expect(Math.min(...heights)).toBeGreaterThan(0);
    expect(new Set(heights).size).toBeGreaterThan(3);
    expect(widths.has(18)).toBe(true);
    expect(widths.has(3)).toBe(true);
  });

  it('simplifies outlines and skips sidewalks and tiny things', () => {
    const corners = map?.objects.reduce((sum, object) => sum + ('points' in object ? object.points.length : 0), 0) ?? 0;
    const sourceNodes = JSON.stringify(reply).match(/"lat"/g)?.length ?? 0;

    expect(corners).toBeLessThan(sourceNodes / 2);
    expect(
      byKind('building').every(
        (building) => 'points' in building && ringArea(building.points) >= 12 * PIXELS_PER_METER ** 2
      )
    ).toBe(true);
  });

  it('produces a map that saves and loads unchanged', () => {
    const loaded = parseMap(serializeMap(map!));

    expect(loaded.ok && loaded.map).toEqual(map);
  });

  it('keeps the inner rings of a multipolygon as courtyards', () => {
    const ring = (lat: number, lon: number, size: number) => [
      { lat, lon },
      { lat, lon: lon + size },
      { lat: lat - size, lon: lon + size },
      { lat: lat - size, lon },
      { lat, lon }
    ];
    const courtyard = overpassToMap(
      {
        elements: [
          {
            type: 'relation',
            id: 7,
            tags: { building: 'yes', 'building:levels': '5', type: 'multipolygon' },
            members: [
              { type: 'way', ref: 1, role: 'outer', geometry: ring(55.749, 37.608, 0.0006).slice(0, 3) },
              { type: 'way', ref: 2, role: 'outer', geometry: ring(55.749, 37.608, 0.0006).slice(2) },
              { type: 'way', ref: 3, role: 'inner', geometry: ring(55.7488, 37.6082, 0.0002) }
            ]
          }
        ]
      },
      SAMPLE_AREA
    );
    const building = courtyard.ok ? courtyard.value.objects[0] : undefined;

    expect(building).toMatchObject({ id: 'relation/7', kind: 'building' });
    expect(building && 'height' in building && building.height).toBeCloseTo(5 * 3.3 * PIXELS_PER_METER, 1);
    expect(building && 'holes' in building && building.holes).toHaveLength(1);
  });

  it('fails cleanly on a reply without elements', () => {
    expect(overpassToMap({ remark: 'nothing' }, SAMPLE_AREA)).toEqual({
      ok: false,
      error: 'The Overpass reply has no element list.'
    });
  });
});

describe('fetchOverpass', () => {
  const area = SAMPLE_AREA;

  it('posts the query and returns the parsed reply', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ elements: [] }), { status: 200 }));
    const result = await fetchOverpass(area, { fetcher });

    expect(result).toEqual({ ok: true, value: { elements: [] } });
    expect(fetcher).toHaveBeenCalledWith(
      'https://overpass-api.de/api/interpreter',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('explains a busy server', async () => {
    const result = await fetchOverpass(area, { fetcher: async () => new Response('busy', { status: 504 }) });

    expect(result).toEqual({ ok: false, error: 'Overpass is busy (HTTP 504). Retry in a moment.' });
  });

  it('explains rate limiting', async () => {
    const result = await fetchOverpass(area, { fetcher: async () => new Response('', { status: 429 }) });

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toMatch(/429/);
  });

  it('explains a network failure', async () => {
    const result = await fetchOverpass(area, {
      fetcher: async () => {
        throw new TypeError('Failed to fetch');
      }
    });

    expect(!result.ok && result.error).toMatch(/Could not reach Overpass \(Failed to fetch\)/);
  });

  it('reports a query Overpass stopped', async () => {
    const result = await fetchOverpass(area, {
      fetcher: async () =>
        new Response(JSON.stringify({ elements: [], remark: 'runtime error: Query timed out' }), { status: 200 })
    });

    expect(!result.ok && result.error).toBe('Overpass stopped the query: runtime error: Query timed out');
  });

  it('reports a reply that is not JSON', async () => {
    const result = await fetchOverpass(area, {
      fetcher: async () => new Response('<html>oops</html>', { status: 200 })
    });

    expect(!result.ok && result.error).toMatch(/not JSON/);
  });

  it('reports cancellation', async () => {
    const controller = new AbortController();
    const pending = fetchOverpass(area, {
      signal: controller.signal,
      fetcher: (_url, init) =>
        new Promise((_resolve, reject) =>
          init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
        )
    });
    controller.abort();

    expect(await pending).toEqual({ ok: false, error: 'Import cancelled.' });
  });
});
