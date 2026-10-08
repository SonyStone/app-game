import type { PsdLayerNode } from '@app-game/psd/viewer';
import { expect, it } from 'vitest';
import { collapsedGroups, collectNotes, findLayer, topFirst } from '../src/features/layers/layerTree';
import { clampScale, fitView, panView, zoomView } from '../src/features/viewport/view';

it('fits an image centered with a margin and magnifies small ones', () => {
  expect(fitView({ width: 1048, height: 548 }, { width: 500, height: 250 })).toEqual({ scale: 2, x: 24, y: 24 });
  expect(fitView({ width: 448, height: 448 }, { width: 800, height: 400 })).toEqual({ scale: 0.5, x: 24, y: 124 });
});

it('zooms about a point that stays over the same image pixel, within limits', () => {
  const view = { scale: 2, x: 10, y: 20 };
  const zoomed = zoomView(view, 2, { x: 110, y: 120 });
  expect(zoomed).toEqual({ scale: 4, x: -90, y: -80 });
  // Image pixel (50, 50) is under the point before and after.
  expect([50 * view.scale + view.x, 50 * zoomed.scale + zoomed.x]).toEqual([110, 110]);
  expect(clampScale(1000)).toBe(64);
  expect(clampScale(0)).toBe(1 / 64);
  expect(panView(view, { x: 5, y: -5 })).toEqual({ scale: 2, x: 15, y: 15 });
});

it('lists layers top first and gathers notes, collapsed groups and records', () => {
  const node = (index: number, name: string, patch: Partial<PsdLayerNode> = {}): PsdLayerNode => ({
    index,
    name,
    kind: 'pixel',
    background: false,
    blendMode: 'normal',
    opacity: 255,
    fill: 255,
    visible: true,
    clipped: false,
    bounds: { top: 0, left: 0, bottom: 1, right: 1 },
    mask: null,
    vectorMask: null,
    effects: null,
    notes: [],
    keys: [],
    ...patch
  });
  const layers = [
    node(0, 'Paper'),
    node(3, 'Group', {
      kind: 'group',
      open: false,
      end: 1,
      children: [node(2, 'Ink', { notes: ['Dissolve uses a stand-in noise'] })],
      notes: ['Blend If on a group is not rendered']
    })
  ];
  expect(topFirst(layers).map((layer) => layer.name)).toEqual(['Group', 'Paper']);
  expect(collectNotes(layers)).toEqual([
    { index: 3, name: 'Group', note: 'Blend If on a group is not rendered' },
    { index: 2, name: 'Ink', note: 'Dissolve uses a stand-in noise' }
  ]);
  expect(collapsedGroups(layers)).toEqual([3]);
  expect(findLayer(layers, 2)?.name).toBe('Ink');
  expect(findLayer(layers, 9)).toBeUndefined();
});
