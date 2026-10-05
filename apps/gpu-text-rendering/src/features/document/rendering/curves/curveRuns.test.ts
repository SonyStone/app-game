import { expect, it } from 'vitest';
import { paintTree } from '../../plan/paintTree';
import { curveRuns } from './curveRuns';

it('keeps paint order and separates analytic clips and hairlines from ordinary fills', () => {
  const instances = new ArrayBuffer(6 * 80);
  const data = new DataView(instances);
  data.setUint32(2 * 80 + 24, 1, true);
  data.setUint32(3 * 80 + 72, 3, true);
  data.setFloat32(4 * 80 + 32, 1, true);
  const before = instances.slice(0);
  const pages = [{ beginVertex: 0, endVertex: 36 }];
  const trees = paintTree(instances, new ArrayBuffer(0), new ArrayBuffer(0), pages);

  expect(curveRuns(trees, instances).get('0:6')).toEqual([
    { first: 0, count: 2, simple: true, cacheScale: Infinity, minimumScale: Infinity, large: [] },
    { first: 2, count: 2, simple: false, cacheScale: Infinity, minimumScale: Infinity, large: [] },
    { first: 4, count: 2, simple: true, cacheScale: Infinity, minimumScale: Infinity, large: [] }
  ]);
  expect(instances).toEqual(before);
});

it('keeps image, blend and transparency-group boundaries', () => {
  const instances = new ArrayBuffer(6 * 80);
  new DataView(instances).setUint32(2 * 80 + 72, 2, true);
  const groups = new ArrayBuffer(24);
  const group = new DataView(groups);
  group.setUint32(0, 3, true);
  group.setUint32(4, 5, true);
  group.setFloat32(8, 0.5, true);
  const blends = new Uint8Array([0, 0, 0, 0, 1, 0]).buffer;
  const trees = paintTree(instances, blends, groups, [{ beginVertex: 0, endVertex: 36 }]);
  const batches = curveRuns(trees, instances);

  expect([...batches.keys()]).toEqual(['0:2', '3:1', '4:1', '5:1']);
  expect(batches.get('3:1')).toEqual([
    { first: 3, count: 1, simple: true, cacheScale: Infinity, minimumScale: Infinity, large: [] }
  ]);
  expect(batches.has('2:1')).toBe(false);
});

it('lists large ordinary fills with few enough segments for cell drawing', () => {
  const instances = new ArrayBuffer(4 * 80);
  const data = new DataView(instances);
  // A figure-sized fill, a glyph-sized fill, a figure-sized clipped fill and one with too many segments.
  data.setFloat32(0, 0.3, true);
  data.setFloat32(80, 0.01, true);
  data.setFloat32(2 * 80, 0.3, true);
  data.setUint32(2 * 80 + 24, 1, true);
  data.setFloat32(3 * 80, 0.3, true);
  data.setUint32(3 * 80 + 68, 600, true);
  const trees = paintTree(instances, new ArrayBuffer(0), new ArrayBuffer(0), [{ beginVertex: 0, endVertex: 24 }]);
  const runs = curveRuns(trees, instances).get('0:4')!;

  expect(runs.flatMap((run) => run.large.map(({ index }) => index))).toEqual([0]);
  expect(runs[0]!.large[0]!.norm).toBeCloseTo(0.3);
});
