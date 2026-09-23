import { expect, it } from 'vitest';
import type { SceneFrame } from '../createFrame';
import { buildPaintBounds, createPaintBounds } from './paintBounds';
import type { PaintNode } from './paintTree';

const frame: SceneFrame = {
  width: 100,
  height: 100,
  mul: [2, 2],
  add: [-1, -1],
  rotation: [1, 0, 0, 1],
  visible: [],
  vectorOnly: false,
  grids: false
};

it('preserves source order while skipping invisible instances and merges adjacent spans', () => {
  const values = [-2, 0.1, 0.3, 2, 0.5];
  const instances = new ArrayBuffer(values.length * 80);
  const data = new DataView(instances);

  values.forEach((x, i) => {
    data.setFloat32(i * 80, 0.1, true);
    data.setFloat32(i * 80 + 12, 0.1, true);
    data.setFloat32(i * 80 + 16, x, true);
  });

  expect(createPaintBounds(instances, [{ x: 0, y: 0 }])(frame).ranges(0, 5)).toEqual([
    { first: 1, count: 2 },
    { first: 4, count: 1 }
  ]);
});

it('retains edge antialiasing and includes page placement before rotation', () => {
  const data = new DataView(new ArrayBuffer(80));
  data.setFloat32(0, 0.1, true);
  data.setFloat32(12, 0.1, true);
  data.setFloat32(16, 1.21, true);
  const visible = createPaintBounds(data.buffer, [{ x: 0.2, y: 0 }]);
  const node: PaintNode = { first: 0, count: 1, image: undefined, blend: 0 };
  expect(visible(frame).rect(node)).toEqual({ x: 99, y: 0, width: 1, height: 13 });
  expect(visible({ ...frame, rotation: [0, 1, -1, 0] }).rect(node)).toBeDefined();
});

it('never narrows group content to its mask bounds', () => {
  const data = new DataView(new ArrayBuffer(160));
  for (let i = 0; i < 2; i++) {
    data.setFloat32(i * 80, 0.1, true);
    data.setFloat32(i * 80 + 12, 0.1, true);
    data.setFloat32(i * 80 + 16, i === 0 ? 0.4 : 5, true);
  }
  const content: PaintNode = { first: 0, count: 1, image: undefined, blend: 0 };
  const mask: PaintNode = {
    children: [{ first: 1, count: 1, image: undefined, blend: 0 }],
    opacity: 0,
    blend: 3,
    isolated: true,
    knockout: false
  };
  const group: PaintNode = { children: [content, mask], opacity: 1, blend: 0, isolated: true, knockout: false };
  expect(createPaintBounds(data.buffer, [{ x: 0, y: 0 }])(frame).rect(group)?.width).toBeGreaterThan(50);
});

it('preserves queries after worker spatial data is cloned and transferred', () => {
  const instances = new ArrayBuffer(80 * 100);
  const data = new DataView(instances);
  for (let i = 0; i < 100; i++) {
    data.setFloat32(i * 80, 0.03, true);
    data.setFloat32(i * 80 + 12, 0.05, true);
    data.setFloat32(i * 80 + 16, i / 50, true);
  }
  const pages = [{ x: 0, y: 0 }];
  const prepared = buildPaintBounds(instances, pages);
  const cloned = structuredClone(prepared, { transfer: [prepared.leaves.buffer] });
  expect(prepared.leaves.byteLength).toBe(0);
  const direct = createPaintBounds(instances, pages);
  const transferred = createPaintBounds(instances, pages, cloned);
  for (const rotation of [
    [1, 0, 0, 1],
    [0, 1, -1, 0]
  ] as const) {
    const view: SceneFrame = { ...frame, rotation: [...rotation] };
    expect(transferred(view).ranges(0, 100)).toEqual(direct(view).ranges(0, 100));
  }
});
