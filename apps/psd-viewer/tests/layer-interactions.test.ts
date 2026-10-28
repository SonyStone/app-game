import { expect, it } from 'vitest';
import {
  dropZone,
  groupUnavailable,
  moveCommands,
  moveDestination,
  opacityByte,
  scrubPercent,
  selectionRoots,
  selectLayers,
  type EditableLayer
} from '../src/features/layers/interactions';

const plain = { shiftKey: false, metaKey: false, ctrlKey: false };
const layer = (id: number, parent: number | null = null, endId: number | null = null): EditableLayer => ({
  id,
  parent,
  endId,
  group: endId !== null,
  name: String(id),
  visible: true,
  opacity: 255,
  fill: 255,
  blend: 'normal',
  clipped: false,
  link: null,
  linkEnabled: null,
  children: [],
  index: id,
  depth: parent === null ? 0 : 1
});

it('selects anchored ranges and toggles noncontiguous Cmd/Ctrl selections', () => {
  const order = [4, 3, 2, 1];
  expect(selectLayers([4], order, 2, 4, { ...plain, shiftKey: true })).toEqual([4, 3, 2]);
  expect(selectLayers([4, 2], order, 4, 4, { ...plain, metaKey: true })).toEqual([2]);
  expect(selectLayers([4], order, 1, 4, { ...plain, ctrlKey: true })).toEqual([4, 1]);
  expect(selectLayers([4, 1], order, 3, 4, plain)).toEqual([3]);
});

it('rounds stored opacity bytes and scrubs percentages with clamping and Shift acceleration', () => {
  expect(opacityByte(50)).toBe(128);
  expect(opacityByte(68)).toBe(173);
  expect(scrubPercent(50, -13)).toBe(37);
  expect(scrubPercent(50, 4, true)).toBe(90);
  expect(scrubPercent(50, -100)).toBe(0);
  expect(scrubPercent(50, 100)).toBe(100);
});

it('distinguishes group targets, removes selected descendants, and rejects cycles', () => {
  const layers = [layer(1), layer(4, null, 5), layer(3, 4), layer(2, 4), layer(6)];
  expect(dropZone(0.1, true)).toBe('before');
  expect(dropZone(0.5, true)).toBe('inside');
  expect(dropZone(0.9, true)).toBe('after');
  expect(dropZone(0.5, false)).toBe('after');
  expect(selectionRoots(layers, [4, 3, 2]).map((item) => item.id)).toEqual([4]);
  expect(moveDestination(layers, [4], layers[2]!, 'before')).toBeUndefined();
  expect(moveDestination(layers, [6], layers[1]!, 'inside')).toEqual({ parent: 4, index: 2 });
  expect(moveDestination(layers, [3], layers[1]!, 'before')).toEqual({ parent: null, index: 2 });
  expect(moveDestination(layers, [1], layers[4]!, 'after')).toEqual({ parent: null, index: 1 });
});

it('preflights sibling and contiguous grouping requirements', () => {
  const layers = [layer(1), layer(2), layer(3), layer(4, 3)];
  expect(groupUnavailable(layers, [])).toMatch(/Select/);
  expect(groupUnavailable(layers, [1, 4])).toMatch(/sibling/);
  expect(groupUnavailable(layers, [1, 3])).toMatch(/contiguous/);
  expect(groupUnavailable(layers, [1, 2])).toBeUndefined();
});

it('plans post-removal indices for multi-layer drags in both directions and into groups', () => {
  const layers = [layer(1), layer(2), layer(3), layer(4), layer(5, null, 6)];
  expect(moveCommands(layers, [1, 2], layers[3]!, 'before')).toEqual([
    { kind: 'move', layerId: 2, parent: null, index: 3 },
    { kind: 'move', layerId: 1, parent: null, index: 2 }
  ]);
  expect(moveCommands(layers, [3, 4], layers[0]!, 'after')).toEqual([
    { kind: 'move', layerId: 3, parent: null, index: 0 },
    { kind: 'move', layerId: 4, parent: null, index: 1 }
  ]);
  expect(moveCommands(layers, [1, 2], layers[4]!, 'inside')).toEqual([
    { kind: 'move', layerId: 1, parent: 5, index: 0 },
    { kind: 'move', layerId: 2, parent: 5, index: 1 }
  ]);
});
