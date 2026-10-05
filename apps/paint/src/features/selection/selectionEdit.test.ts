import type { DocumentEditContext } from '@app-game/paint-core/composition/documentEdit';
import type { Layer } from '@app-game/paint-core/document';
import {
  coverageAt,
  emptySelection,
  polygonSelection,
  selectionBounds,
  type SelectionMask
} from '@app-game/paint-core/selectionMask';
import { expect, it } from 'vitest';
import { selectionEdit, type SelectionCommand } from './selectionEdit';

const area = { left: 0, top: 0, width: 100, height: 100 };
const wand = {
  op: 'wand' as const,
  point: { x: 5, y: 5 },
  area,
  tolerance: 0,
  contiguous: true,
  source: 'layer' as const,
  antialias: false,
  mode: 'replace' as const
};

it('selects the connected area of the pressed color, or that color anywhere, as the wand settings say', async () => {
  // Two red squares apart on a transparent layer.
  const layer = paint([
    [0, 0, 20, 20, [255, 0, 0, 255]],
    [50, 50, 20, 20, [255, 0, 0, 255]],
    [80, 80, 5, 5, [250, 0, 0, 255]]
  ]);
  const connected = await run(layer, wand);
  expect(selectionBounds(connected)).toEqual({ left: 0, top: 0, right: 20, bottom: 20 });

  const anywhere = await run(layer, { ...wand, contiguous: false });
  expect(selectionBounds(anywhere)).toEqual({ left: 0, top: 0, right: 70, bottom: 70 });
  expect(coverageAt(anywhere, 82, 82)).toBe(0);

  const tolerant = await run(layer, { ...wand, contiguous: false, tolerance: 8 });
  expect(coverageAt(tolerant, 82, 82)).toBe(255);

  // A smoothed edge is partly selected just outside the region.
  const smooth = await run(layer, { ...wand, antialias: true });
  expect(coverageAt(smooth, 19, 10)).toBe(255);
  expect(coverageAt(smooth, 20, 10)).toBeGreaterThan(0);
  expect(coverageAt(smooth, 20, 10)).toBeLessThan(255);

  // Pressing the empty paper selects it around the squares, within the view.
  const paper = await run(layer, { ...wand, point: { x: 30, y: 5 } });
  expect(coverageAt(paper, 30, 5)).toBe(255);
  expect(coverageAt(paper, 5, 5)).toBe(0);
  expect(coverageAt(paper, 150, 5)).toBe(0);
});

it('combines the wand by its mode and refuses a region that would reach past its limit', async () => {
  const layer = paint([[0, 0, 20, 20, [255, 0, 0, 255]]]);
  const base = polygonSelection([
    { x: 10, y: 10 },
    { x: 40, y: 10 },
    { x: 40, y: 40 },
    { x: 10, y: 40 }
  ]);
  expect(selectionBounds(await run(layer, { ...wand, mode: 'intersect' }, base))).toEqual({
    left: 10,
    top: 10,
    right: 20,
    bottom: 20
  });
  expect(selectionBounds(await run(layer, { ...wand, mode: 'add' }, base))).toEqual({
    left: 0,
    top: 0,
    right: 40,
    bottom: 40
  });

  const huge = { left: -10000, top: -10000, width: 20000, height: 20000 };
  await expect(run(layer, { ...wand, point: { x: 30, y: 30 }, area: huge })).rejects.toThrow('too large');
});

it('selects all, clears, inverts, feathers and moves the selection, and changes no pixels', async () => {
  const layer = paint([]);
  const base = polygonSelection([
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 10 }
  ]);
  expect((await run(layer, { op: 'all' })).outside).toBe(255);
  expect(await run(layer, { op: 'clear' }, base)).toEqual(emptySelection);
  expect(coverageAt(await run(layer, { op: 'invert' }, base), 50, 50)).toBe(255);
  expect(coverageAt(await run(layer, { op: 'feather', radius: 4 }, base), 10, 5)).toBeLessThan(255);
  expect(selectionBounds(await run(layer, { op: 'translate', offset: { x: 5, y: -5 } }, base))).toEqual({
    left: 5,
    top: -5,
    right: 15,
    bottom: 5
  });
  const result = await selectionEdit.run(context(layer, base), { op: 'invert' });
  expect(result.changes).toEqual([]);
  expect(() => selectionEdit.command({ op: 'feather', radius: 0 })).toThrow();
});

async function run(layer: Layer, command: SelectionCommand, selection: SelectionMask = emptySelection) {
  return (await selectionEdit.run(context(layer, selection), command)).selection!;
}

function context(layer: Layer, selection: SelectionMask): DocumentEditContext {
  return {
    layers: [layer],
    active: layer,
    readTile: async (pixels) => pixels as Uint8Array,
    linearBlending: false,
    selection,
    state: { get: () => undefined, set: () => {} },
    floating: { show: () => {}, move: () => {}, clear: async () => {} }
  };
}

/** A layer with rectangles of color, each `[left, top, width, height, rgba]`, within the first tile. */
function paint(rectangles: [number, number, number, number, number[]][]): Layer {
  const tile = new Uint8Array(256 * 256 * 4);
  for (const [left, top, width, height, rgba] of rectangles) {
    for (let y = top; y < top + height; y++) {
      for (let x = left; x < left + width; x++) {
        tile.set(rgba, (y * 256 + x) * 4);
      }
    }
  }

  return { id: 'layer', name: 'Layer', visible: true, opacity: 1, blend: 'normal', tiles: new Map([['0,0', tile]]) };
}
