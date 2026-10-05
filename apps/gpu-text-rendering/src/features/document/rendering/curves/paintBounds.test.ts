import { expect, it } from 'vitest';
import { buildPaintBounds } from '../../plan/buildPaintBounds';
import type { PaintNode } from '../../plan/paintTree';
import type { SceneFrame } from '../createFrame';
import { createPaintBounds } from './paintBounds';

const frame: SceneFrame = {
  width: 100,
  height: 100,
  mul: [2, 2],
  add: [-1, -1],
  rotation: [1, 0, 0, 1],
  visible: [],
  vectorOnly: false,
  grids: false,
  moving: false
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

it('matches per-instance corner projection when accepting fully visible branches wholesale', () => {
  const count = 2000;
  const instances = new ArrayBuffer(count * 80);
  const data = new DataView(instances);
  let seed = 7;
  const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

  for (let i = 0; i < count; i++) {
    data.setFloat32(i * 80, random() * 0.05, true);
    data.setFloat32(i * 80 + 4, (random() - 0.5) * 0.02, true);
    data.setFloat32(i * 80 + 12, random() * 0.05, true);
    // Clustered runs make some branches fully visible and others straddle the viewport edge.
    data.setFloat32(i * 80 + 16, Math.floor(i / 64) / 16 - 0.5 + random() * 0.02, true);
    data.setFloat32(i * 80 + 20, random() * 1.4 - 0.2, true);
  }

  const pages = [{ x: 0, y: 0 }];
  const bounds = createPaintBounds(instances, pages);
  const { leaves } = buildPaintBounds(instances, pages);

  const views: SceneFrame[] = [
    frame,
    { ...frame, width: 173, height: 91, mul: [1.7, 2.3], add: [-0.9, -1.2] },
    { ...frame, rotation: [Math.cos(0.4), Math.sin(0.4), -Math.sin(0.4), Math.cos(0.4)] }
  ];

  for (const view of views) {
    const expected: { first: number; count: number }[] = [];

    for (let index = 100; index < 1900; index++) {
      if (cornerRect(view, leaves.subarray(index * 4, index * 4 + 4))) {
        const previous = expected.at(-1);

        if (previous && previous.first + previous.count === index) {
          previous.count++;
        } else {
          expected.push({ first: index, count: 1 });
        }
      }
    }

    expect(expected.length).toBeGreaterThan(0);
    expect(bounds(view).ranges(100, 1800)).toEqual(expected);
  }
});

/** Reference projection of all four corners, including the two-pixel fringe and viewport clamp. */
function cornerRect(view: SceneFrame, [left, bottom, right, top]: Float64Array) {
  const [a, b, c, d] = view.rotation;
  const xs: number[] = [];
  const ys: number[] = [];

  for (const [x, y] of [
    [left!, bottom!],
    [right!, bottom!],
    [left!, top!],
    [right!, top!]
  ] as const) {
    const px = x * view.mul[0] + view.add[0];
    const py = y * view.mul[1] + view.add[1];
    xs.push(((a * px + c * py + 1) * view.width) / 2);
    ys.push(((1 - b * px - d * py) * view.height) / 2);
  }

  const x = Math.max(0, Math.floor(Math.min(...xs) - 2));
  const y = Math.max(0, Math.floor(Math.min(...ys) - 2));
  return (
    Math.min(view.width, Math.ceil(Math.max(...xs) + 2)) > x &&
    Math.min(view.height, Math.ceil(Math.max(...ys) + 2)) > y
  );
}
