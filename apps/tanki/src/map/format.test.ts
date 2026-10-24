import { describe, expect, it } from 'vitest';
import { createEmptyMap, MAP_VERSION, parseMap, serializeMap, type TankiMap } from './format';

const map: TankiMap = {
  ...createEmptyMap('Lubyanka', 2240, 1680),
  objects: [
    {
      id: 'b1',
      kind: 'building',
      points: [
        { x: 10, y: 10 },
        { x: 110, y: 10 },
        { x: 110, y: 90 },
        { x: 10, y: 90 }
      ],
      holes: [
        [
          { x: 40, y: 30 },
          { x: 80, y: 30 },
          { x: 60, y: 60 }
        ]
      ],
      height: 67.2
    },
    {
      id: 'w1',
      kind: 'wall',
      points: [
        { x: 0, y: 200 },
        { x: 300, y: 200 },
        { x: 300, y: 205 }
      ],
      holes: [],
      height: 16.8
    },
    { id: 'c1', kind: 'crate', x: 400, y: 300, size: { x: 42.5, y: 92.5 }, rotation: 0.785 },
    {
      id: 'r1',
      kind: 'road',
      points: [
        { x: 0, y: 500 },
        { x: 2240, y: 520 }
      ],
      width: 100.8
    },
    {
      id: 'p1',
      kind: 'park',
      points: [
        { x: 500, y: 600 },
        { x: 700, y: 600 },
        { x: 650, y: 800 }
      ],
      holes: []
    },
    {
      id: 'water1',
      kind: 'water',
      points: [
        { x: 1000, y: 1000 },
        { x: 1200, y: 1000 },
        { x: 1100, y: 1100 }
      ],
      holes: []
    }
  ],
  spawns: [
    {
      id: 's1',
      team: 'red',
      points: [
        { x: 50, y: 700 },
        { x: 274, y: 700 },
        { x: 274, y: 1036 },
        { x: 50, y: 1036 }
      ]
    },
    {
      id: 's2',
      team: 'blue',
      points: [
        { x: 1966, y: 700 },
        { x: 2190, y: 700 },
        { x: 2190, y: 1036 }
      ]
    }
  ],
  capturePoints: [{ id: 'k1', x: 1120, y: 840, radius: 84 }],
  source: {
    kind: 'openstreetmap',
    lat: 55.7597,
    lon: 37.6263,
    sizeMeters: 400,
    pixelsPerMeter: 5.6,
    attribution: '© OpenStreetMap contributors (ODbL)'
  }
};

describe('serializeMap and parseMap', () => {
  it('round-trip every kind of object, spawns, capture points and the source', () => {
    const text = serializeMap(map);
    const loaded = parseMap(text);

    expect(loaded).toEqual({ ok: true, map });
    expect(loaded.ok && serializeMap(loaded.map)).toBe(text);
  });

  it('write one object per line, with the version up front', () => {
    const lines = serializeMap(map).split('\n');

    expect(lines[1]).toBe('  "format": "tanki-map",');
    expect(lines[2]).toBe(`  "version": ${MAP_VERSION},`);
    expect(lines.filter((line) => line.startsWith('    {"id":'))).toHaveLength(9);
  });

  it('round numbers to thousandths of a pixel', () => {
    const turned: TankiMap = {
      ...map,
      objects: [{ id: 'c', kind: 'crate', x: 1 / 3, y: -0.0001, size: { x: 2, y: 3 }, rotation: Math.PI }]
    };
    const loaded = parseMap(serializeMap(turned));

    expect(loaded.ok && loaded.map.objects[0]).toEqual({
      id: 'c',
      kind: 'crate',
      x: 0.333,
      y: 0,
      size: { x: 2, y: 3 },
      rotation: 3.142
    });
  });

  it('read a map without a source', () => {
    const plain = createEmptyMap('Empty', 100, 100);

    expect(parseMap(serializeMap(plain))).toEqual({ ok: true, map: plain });
  });

  it('strip unknown fields', () => {
    const loaded = parseMap({ ...map, extra: true, objects: [{ ...map.objects[2], color: 'red' }] });

    expect(loaded.ok && loaded.map.objects[0]).toEqual(map.objects[2]);
    expect(loaded.ok && 'extra' in loaded.map).toBe(false);
  });
});

describe('parseMap failures', () => {
  const cases: [string, unknown, RegExp][] = [
    ['broken JSON', '{"format": ', /JSON|Unexpected/],
    ['another format', { format: 'geojson' }, /Not a Tanki map/],
    ['a newer version', { ...map, version: 2 }, /Unsupported map version 2/],
    [
      'an unknown kind',
      { ...map, objects: [{ id: 'x', kind: 'lava', points: [] }] },
      /objects\[0\]\.kind: unknown kind "lava"/
    ],
    [
      'a polygon of two points',
      {
        ...map,
        objects: [
          {
            ...map.objects[0],
            points: [
              { x: 0, y: 0 },
              { x: 1, y: 1 }
            ]
          }
        ]
      },
      /objects\[0\]\.points/
    ],
    [
      'a non-finite coordinate',
      { ...map, capturePoints: [{ id: 'k', x: Number.NaN, y: 0, radius: 1 }] },
      /capturePoints\[0\]\.x must be a finite number/
    ],
    [
      'a zero height',
      { ...map, objects: [{ ...map.objects[0], height: 0 }] },
      /objects\[0\]\.height must be greater than zero/
    ],
    ['an unknown team', { ...map, spawns: [{ ...map.spawns[0], team: 'green' }] }, /spawns\[0\]\.team/],
    ['a duplicate id', { ...map, capturePoints: [{ id: 'b1', x: 0, y: 0, radius: 1 }] }, /Duplicate id "b1"/]
  ];

  it.each(cases)('rejects %s', (_name, input, message) => {
    const result = parseMap(input);

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toMatch(message);
  });
});
