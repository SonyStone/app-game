import { unpackTile } from './tilePixels';
import { describe, expect, it } from 'vitest';
import { createStrokeSampler, dabTiles, defaultBrush, TILE_SIZE, type Sample } from './brush';
import { defaultCamera, panCamera, screenToWorld, transformAt, worldToScreen } from './camera';
import { createDocument, TILE_BYTES } from './document';
import { decodeDocument, encodeDocument, restoreDocument, snapshotDocument } from './storage';

describe('stroke sampling', () => {
  it('produces identical stamps across different event/frame batch sizes', () => {
    const samples: Sample[] = Array.from({ length: 80 }, (_, index) => ({
      x: index * 2.3 - 300,
      y: Math.sin(index / 8) * 20,
      pressure: index / 80,
      time: index * 4
    }));
    const whole = createStrokeSampler(defaultBrush()).add(samples);
    const sampler = createStrokeSampler(defaultBrush());
    const split = samples.flatMap((sample) => sampler.add([sample]));
    expect(split).toEqual(whole);
  });
  it('preserves spacing when collinear samples are subdivided', () => {
    const a = { x: 0, y: 0, pressure: 1, time: 0 },
      b = { x: 100, y: 0, pressure: 1, time: 100 };
    const brush = { ...defaultBrush(), size: 20, spacing: 0.1 };
    const direct = createStrokeSampler(brush).add([a, b]);
    const split = createStrokeSampler(brush).add([a, { ...a, x: 33, time: 33 }, b]);
    expect(split).toHaveLength(direct.length);
    split.forEach((dab, index) => {
      expect(dab.x).toBeCloseTo(direct[index]!.x, 10);
      expect(dab.y).toBeCloseTo(direct[index]!.y, 10);
      expect(dab.radius).toBe(direct[index]!.radius);
      expect(dab.flow).toBe(direct[index]!.flow);
    });
  });
  it('draws one stamp for a tap and no duplicate for stationary input', () => {
    const sampler = createStrokeSampler(defaultBrush());
    const sample = { x: 0, y: 0, pressure: 1, time: 0 };
    expect(sampler.add([sample, sample])).toHaveLength(1);
  });
  it('enumerates every crossing tile with signed coordinates', () => {
    expect(dabTiles({ x: 0, y: 0, radius: 3, flow: 1 })).toEqual(['-1,-1', '0,-1', '-1,0', '0,0']);
    expect(dabTiles({ x: TILE_SIZE - 1, y: 10, radius: 2, flow: 1 })).toEqual(['0,0', '1,0']);
  });
});

describe('camera', () => {
  it('round-trips rotation, zoom, mirror, and distant origins', () => {
    const camera = { x: 1e8, y: -1e8, zoom: 2.5, angle: 1.3, mirrored: true },
      size = { width: 1200, height: 800 };
    const point = { x: 318, y: 713 };
    const result = worldToScreen(screenToWorld(point, camera, size), camera, size);
    expect(result.x).toBeCloseTo(point.x, 5);
    expect(result.y).toBeCloseTo(point.y, 5);
  });
  it('keeps the anchor stationary when zooming and rotating', () => {
    const camera = defaultCamera(),
      size = { width: 800, height: 600 },
      anchor = { x: 130, y: 240 };
    const world = screenToWorld(anchor, camera, size);
    const next = transformAt(camera, size, anchor, 2, Math.PI / 3);
    const result = worldToScreen(world, next, size);
    expect(result.x).toBeCloseTo(anchor.x);
    expect(result.y).toBeCloseTo(anchor.y);
  });
  it('pans in screen space even when the view is mirrored and rotated', () => {
    const camera = { ...defaultCamera(), angle: 1, mirrored: true },
      size = { width: 800, height: 600 };
    const result = worldToScreen({ x: 0, y: 0 }, panCamera(camera, size, { x: 21, y: -37 }), size);
    expect(result.x).toBeCloseTo(421);
    expect(result.y).toBeCloseTo(263);
  });
});

describe('document transactions', () => {
  it('undoes and redoes exact pixels including creation and removal of tiles', () => {
    const doc = createDocument(),
      pixels = new Uint8Array(TILE_BYTES).fill(17);
    doc.commit([{ layerId: doc.active.id, key: '-1,0', before: undefined, after: pixels }]);
    expect(doc.active.tiles.get('-1,0')).toEqual(pixels);
    doc.undo();
    expect(doc.active.tiles.size).toBe(0);
    doc.redo();
    expect(doc.active.tiles.get('-1,0')).toEqual(pixels);
  });
  it('restores deleted layer pixels, order, and selection', () => {
    const doc = createDocument();
    doc.changeLayer({ type: 'add' });
    const id = doc.active.id,
      pixels = new Uint8Array(TILE_BYTES).fill(9);
    doc.commit([{ layerId: id, key: '0,0', before: undefined, after: pixels }]);
    doc.changeLayer({ type: 'delete', id });
    expect(doc.layers).toHaveLength(1);
    doc.undo();
    expect(doc.active.id).toBe(id);
    expect(doc.active.tiles.get('0,0')).toEqual(pixels);
    doc.redo();
    expect(doc.layers).toHaveLength(1);
  });
  it('drops redo after branching history and preserves layer blend settings', () => {
    const doc = createDocument();
    doc.changeLayer({ type: 'update', id: doc.active.id, patch: { blend: 'multiply', opacity: 0.5 } });
    doc.undo();
    expect(doc.active.blend).toBe('linear');
    doc.changeLayer({ type: 'add' });
    expect(doc.state().canRedo).toBe(false);
  });
});

describe('portable document', () => {
  it('round-trips pixels, negative tiles, layers, and camera', () => {
    const doc = createDocument(),
      camera = { ...defaultCamera(), angle: 0.7, x: -500 };
    const pixels = new Uint8Array(TILE_BYTES);
    pixels.set([7, 19, 23, 255]);
    doc.commit([{ layerId: doc.active.id, key: '-2,1', before: undefined, after: pixels }]);
    const restored = decodeDocument(encodeDocument(snapshotDocument(doc.layers, doc.active.id, camera)));
    expect(restored.camera).toEqual(camera);
    expect(unpackTile(restored.layers[0]!.tiles.get('-2,1')!)).toEqual(pixels);
  });
  it('rejects malformed and unsupported documents before replacement', () => {
    const doc = createDocument(),
      saved = snapshotDocument(doc.layers, doc.active.id, defaultCamera());
    expect(() => restoreDocument({ ...saved, version: 3 })).toThrow();
    expect(() => restoreDocument({ ...saved, activeId: 'missing' })).toThrow();
    expect(() =>
      restoreDocument({
        ...saved,
        layers: [{ ...saved.layers[0], tiles: [{ key: '0,0', pixels: new Uint8Array(4) }] }]
      })
    ).toThrow();
  });
});
