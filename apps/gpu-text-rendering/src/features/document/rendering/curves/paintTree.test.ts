import { describe, expect, it } from 'vitest';
import { paintTree } from './paintTree';

describe('transparency group composition', () => {
  it('keeps knockout siblings separate even when they use the same normal paint', () => {
    const tree = scene(512);
    expect(tree).toHaveLength(1);
    expect(tree[0]).toMatchObject({
      isolated: true,
      knockout: true,
      children: [
        { first: 0, count: 1 },
        { first: 1, count: 1 }
      ]
    });
  });

  it('flattens an opaque non-isolated group without losing its child blend modes', () => {
    const tree = scene(256, [1, 4]);
    expect(tree.map((node) => node.blend)).toEqual([1, 4]);
    expect(tree.every((node) => !('children' in node))).toBe(true);
  });

  it('keeps an isolated group around children that must blend against transparency', () => {
    expect(scene(0, [1, 4])[0]).toMatchObject({ isolated: true, children: [{ blend: 1 }, { blend: 4 }] });
  });

  it('coalesces repeated raster draws after flattening opaque PDF groups', () => {
    const instances = new DataView(new ArrayBuffer(400 * 80));
    const groups = new DataView(new ArrayBuffer(400 * 24));

    for (let i = 0; i < 400; i++) {
      instances.setUint32(i * 80 + 64, i < 200 ? 0 : 1, true);
      instances.setUint32(i * 80 + 72, 2, true);
      groups.setUint32(i * 24, i, true);
      groups.setUint32(i * 24 + 4, i + 1, true);
      groups.setFloat32(i * 24 + 8, 1, true);
    }

    const tree = paintTree(instances.buffer, new ArrayBuffer(0), groups.buffer, [
      { beginVertex: 0, endVertex: 2400 }
    ])[0];

    expect(tree).toEqual([
      { first: 0, count: 200, image: 0, blend: 0 },
      { first: 200, count: 200, image: 1, blend: 0 }
    ]);
  });

  it('coalesces flattened vector runs without crossing a translucent group', () => {
    const groups = new DataView(new ArrayBuffer(3 * 24));

    for (let i = 0; i < 3; i++) {
      groups.setUint32(i * 24, i, true);
      groups.setUint32(i * 24 + 4, i + 1, true);
      groups.setFloat32(i * 24 + 8, i === 2 ? 0.5 : 1, true);
    }

    const tree = paintTree(new ArrayBuffer(320), new ArrayBuffer(0), groups.buffer, [
      { beginVertex: 0, endVertex: 24 }
    ])[0]!;

    expect(tree).toHaveLength(3);
    expect(tree[0]).toMatchObject({ first: 0, count: 2 });
    expect(tree[1]).toMatchObject({ opacity: 0.5, children: [{ first: 2, count: 1 }] });
    expect(tree[2]).toMatchObject({ first: 3, count: 1 });
  });
});

function scene(properties: number, blends = [0, 0]) {
  const groups = new ArrayBuffer(24);
  const view = new DataView(groups);
  view.setUint32(4, 2, true);
  view.setFloat32(8, 1, true);
  view.setUint32(12, properties, true);
  return paintTree(new ArrayBuffer(160), new Uint8Array(blends).buffer, groups, [
    { beginVertex: 0, endVertex: 12 }
  ])[0]!;
}
