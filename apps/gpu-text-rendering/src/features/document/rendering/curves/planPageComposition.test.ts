import { expect, it } from 'vitest';
import type { PaintNode } from './paintTree';
import { planPageComposition } from './planPageComposition';

it('chooses expensive pages independently and leaves ordinary foreground direct', () => {
  const background = leaf(0);
  const text = leaf(1);
  const groups = [group(), group(), group()];
  const trees = [[background, ...groups, text], [background, text], [text]];
  const plan = planPageComposition(new ArrayBuffer(160), trees);

  expect([...plan.pages]).toEqual([0]);
  expect(plan.cached).toEqual([[background, ...groups], [], []]);
  expect(plan.direct).toEqual([[text], trees[1], trees[2]]);
});

it('keeps cheap isolated opacity direct at every scale', () => {
  const opacity = group([leaf(0)]);
  const text = leaf(1);
  const plan = planPageComposition(new ArrayBuffer(160), [[opacity, text]]);

  expect(plan.overview.size).toBe(0);
  expect(plan.cached[0]).toEqual([]);
  expect(plan.direct[0]).toEqual([opacity, text]);
});

it('prepares repeated raster swatches for overview without caching the following text', () => {
  const swatches = { ...leaf(0), image: 1, count: 50 };
  const text = leaf(50);
  const plan = planPageComposition(new ArrayBuffer(51 * 80), [[swatches, text]]);

  expect([...plan.overview]).toEqual([0]);
  expect(plan.cached[0]).toEqual([swatches]);
  expect(plan.direct[0]).toEqual([text]);
});

it('prepares overview-only image prefixes without rasterizing ordinary text pages', () => {
  const picture = { ...leaf(0), image: 3 };
  const text = leaf(1);
  const trees = [[group(), group(), group()], [picture, text], [text]];
  const plan = planPageComposition(new ArrayBuffer(160), trees);

  expect([...plan.pages]).toEqual([0, 1]);
  expect([...plan.overview]).toEqual([1]);
  expect(plan.cached[1]).toEqual([picture]);
  expect(plan.direct[1]).toEqual([text]);
  expect(plan.direct[2]).toEqual([text]);
  expect(planPageComposition(new ArrayBuffer(160), [[picture, text]]).pages.size).toBe(0);
});

it('splits a large illustration from small foreground glyphs within one paint run', () => {
  const records = new DataView(new ArrayBuffer(160));
  records.setFloat32(0, 0.4, true);
  records.setFloat32(12, 0.4, true);
  records.setUint32(68, 20, true);
  const run = { ...leaf(0), count: 2 };
  const plan = planPageComposition(records.buffer, [[group(), group(), group()], [run]]);

  expect([...plan.overview]).toEqual([1]);
  expect(plan.cached[1]).toEqual([leaf(0)]);
  expect(plan.direct[1]).toEqual([leaf(1)]);
});

it('caches dense fills in an ordinary PDF while keeping the following text direct', () => {
  const records = new DataView(new ArrayBuffer(240));
  records.setUint32(68, 2203, true);
  records.setUint32(80 + 68, 24, true);
  records.setUint32(160 + 68, 512, true);
  const run = { ...leaf(0), count: 2 };
  const ordinary = [leaf(2)];
  const plan = planPageComposition(records.buffer, [[run], ordinary]);

  expect([...plan.pages]).toEqual([0]);
  expect(plan.overview.size).toBe(0);
  expect(plan.cached).toEqual([[leaf(0)], []]);
  expect(plan.direct).toEqual([[leaf(1)], ordinary]);
});

it('does not mistake raster image dimensions for dense curve counts', () => {
  const records = new DataView(new ArrayBuffer(80));
  records.setUint32(68, 4096, true);
  records.setUint32(72, 2, true);
  const picture = { ...leaf(0), image: 0 };

  expect(planPageComposition(records.buffer, [[picture]]).pages.size).toBe(0);
});

it('includes analytically clipped text in the overview prefix but keeps following ordinary text live', () => {
  const records = new DataView(new ArrayBuffer(160));
  records.setUint32(24, 1, true);
  const plan = planPageComposition(records.buffer, [[{ ...leaf(0), count: 2 }]]);

  expect([...plan.overview]).toEqual([0]);
  expect(plan.cached[0]).toEqual([leaf(0)]);
  expect(plan.direct[0]).toEqual([leaf(1)]);
});

it('retains expensive inherited clipping in the mandatory cache, including clipped images', () => {
  const records = new DataView(new ArrayBuffer(160));
  records.setUint32(24, 2, true);
  records.setUint32(72, 2, true);
  const clips = new DataView(new ArrayBuffer(160));
  clips.setUint32(68, 7895, true);
  clips.setUint32(80 + 68, 4, true);
  clips.setUint32(80 + 76, 1, true);
  const image = { ...leaf(0), image: 0 };
  const plan = planPageComposition(records.buffer, [[image, leaf(1)]], undefined, clips.buffer);

  expect([...plan.pages]).toEqual([0]);
  expect(plan.overview.size).toBe(0);
  expect(plan.cached[0]).toEqual([image]);
  expect(plan.direct[0]).toEqual([leaf(1)]);
});

it('keeps backdrop-dependent blends and nested masks together in source order', () => {
  const background = leaf(0);
  const textInside = leaf(1);
  const mask = group([], { blend: 3 });
  const nested = group([textInside, mask], { isolated: false, knockout: true });
  const blend = { ...leaf(2), blend: 4 };
  const textAbove = leaf(3);
  const nodes = [background, group(), nested, blend, textAbove];
  const plan = planPageComposition(new ArrayBuffer(320), [nodes]);

  expect(plan.cached[0]).toEqual([background, nodes[1], nested, blend]);
  expect(plan.direct[0]).toEqual([textAbove]);
  expect(plan.cached[0]![2]).toBe(nested);
});

it('keeps cached-prefix hairlines direct but allows hairlines in the live foreground', () => {
  const records = new DataView(new ArrayBuffer(160));
  records.setUint32(72, 3, true);
  const heavy = [group(), group(), group()];
  const trees = [
    [group([leaf(0)]), ...heavy],
    [...heavy, leaf(0)],
    [...heavy, leaf(1)]
  ];
  const plan = planPageComposition(records.buffer, trees);

  expect([...plan.pages]).toEqual([1, 2]);
  expect(plan.direct[0]).toBe(trees[0]);
  expect(plan.direct[1]).toEqual([leaf(0)]);
});

it('invalidates composed tiles only for images retained in that cache', () => {
  const picture = { ...leaf(0), image: 5 };
  const overlay = { ...leaf(1), image: 7 };
  const foreground = leaf(2);
  const plan = planPageComposition(new ArrayBuffer(240), [[group([picture]), group(), group(), overlay, foreground]]);

  expect([...plan.images.get(0)!]).toEqual([5, 7]);
  expect(plan.direct[0]).toEqual([foreground]);
});

function leaf(first: number): PaintNode {
  return { first, count: 1, image: undefined, blend: 0 };
}

function group(
  children: PaintNode[] = [],
  properties: Partial<Extract<PaintNode, { children: PaintNode[] }>> = {}
): PaintNode {
  return { children, opacity: 0.5, blend: 0, isolated: true, knockout: false, ...properties };
}
