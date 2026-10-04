import type { DocumentEditContext } from '@app-game/paint-core/composition/documentEdit';
import type { Layer } from '@app-game/paint-core/document';
import { unpackTile } from '@app-game/paint-core/tilePixels';
import { expect, it } from 'vitest';
import { applyAffine, boxAffine, identity, invertAffine, multiplyAffine } from './affine';
import { transformEdit, type TransformCommand } from './transformEdit';

it('moves, scales and restores the whole layer, amending one undo step', async () => {
  const { run, tiles } = setup(square(10, 20, 4, 6, [0, 0, 255, 255]));
  const begun = await run({ phase: 'begin' });
  expect(begun.reply).toEqual({ bounds: { left: 10, top: 20, right: 14, bottom: 26 } });
  expect(begun.changes).toEqual([]);

  // The identity keeps every byte; the first update starts the undo step and later ones amend it.
  const kept = await run({ phase: 'update', interpolation: 'smooth', matrix: [...identity] });
  expect(kept.amend).toBe(false);
  expect(alphaCount(kept)).toBe(24);
  expect(pixel(kept, 10, 20)).toEqual([0, 0, 255, 255]);

  const moved = await run({ phase: 'update', interpolation: 'smooth', matrix: [1, 0, 0, 1, 100, 0] });
  expect(moved.amend).toBe(true);
  expect(pixel(moved, 10, 20)).toEqual([0, 0, 0, 0]);
  expect(pixel(moved, 110, 20)).toEqual([0, 0, 255, 255]);
  // `before` is always the layer as the transform began.
  expect(moved.changes.every((change) => change.before === tiles.get(change.key))).toBe(true);

  const scaled = await run({ phase: 'update', interpolation: 'smooth', matrix: [2, 0, 0, 2, -10, -20] });
  expect(alphaCount(scaled)).toBe(8 * 12);

  // Pixel art keeps hard edges: scaled by 1.5 with the nearest pixel, every pixel is either the color or empty.
  const pixels = await run({ phase: 'update', interpolation: 'pixels', matrix: [1.5, 0, 0, 1.5, -5, -10] });
  const alphas = new Set(
    pixels.changes.flatMap((change) =>
      [...((change.after as Uint8Array | undefined) ?? [])].filter((_, index) => index % 4 === 3)
    )
  );
  expect([...alphas].sort()).toEqual([0, 255]);
  const smooth = await run({ phase: 'update', interpolation: 'smooth', matrix: [1.5, 0, 0, 1.5, -5, -10] });
  expect(
    new Set(
      smooth.changes.flatMap((change) =>
        [...((change.after as Uint8Array | undefined) ?? [])].filter((_, index) => index % 4 === 3)
      )
    ).size
  ).toBeGreaterThan(2);

  const cancelled = await run({ phase: 'cancel' });
  expect(cancelled).toEqual({ changes: [], amend: true });
  await expect(run({ phase: 'update', interpolation: 'smooth', matrix: [...identity] })).rejects.toThrow(
    'Start a transform first'
  );
});

it('transforms only the selected pixels and refuses empty or oversized sources', async () => {
  const { run } = setup(square(0, 0, 20, 10, [255, 0, 0, 255]));
  const left = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 10 }
  ];
  expect((await run({ phase: 'begin', points: left })).reply).toEqual({
    bounds: { left: 0, top: 0, right: 10, bottom: 10 }
  });
  const flipped = await run({ phase: 'update', interpolation: 'smooth', matrix: [1, 0, 0, 1, 0, 30] });
  // The selected half moves down; the other half stays.
  expect(pixel(flipped, 5, 5)).toEqual([0, 0, 0, 0]);
  expect(pixel(flipped, 15, 5)).toEqual([255, 0, 0, 255]);
  expect(pixel(flipped, 5, 35)).toEqual([255, 0, 0, 255]);
  await run({ phase: 'end' });

  const empty = setup(new Map());
  await expect(empty.run({ phase: 'begin' })).rejects.toThrow('The active layer is empty');
  const huge = setup(new Map([...square(0, 0, 1, 1), ...square(5000, 0, 1, 1)]));
  await expect(huge.run({ phase: 'begin' })).rejects.toThrow('at most 4096 px');
});

it('builds box transforms about a pivot and inverts them', () => {
  const matrix = boxAffine({
    pivot: { x: 10, y: 10 },
    scale: { x: -2, y: 1 },
    angle: Math.PI / 2,
    offset: { x: 5, y: 0 }
  });
  const pivot = applyAffine(matrix, { x: 10, y: 10 });
  expect(pivot.x).toBeCloseTo(15);
  expect(pivot.y).toBeCloseTo(10);
  const back = multiplyAffine(invertAffine(matrix)!, matrix);
  back.forEach((value, index) => expect(value).toBeCloseTo(identity[index]!));
  expect(invertAffine([0, 0, 0, 1, 0, 0])).toBeUndefined();
});

function setup(tiles: Map<string, Uint8Array>) {
  const layer: Layer = { id: 'layer', name: 'Layer', visible: true, opacity: 1, blend: 'normal', tiles };
  let state: unknown;
  const context: DocumentEditContext = {
    layers: [layer],
    active: layer,
    readTile: async (pixels) => unpackTile(pixels),
    state: { get: () => state, set: (value) => (state = value) }
  };
  return { tiles, run: (command: TransformCommand) => transformEdit.run(context, command) };
}

/** An opaque rectangle of `rgba` with its top-left corner at (left, top), in tiles. */
function square(left: number, top: number, width: number, height: number, rgba = [0, 0, 0, 255]) {
  const tiles = new Map<string, Uint8Array>();
  for (let y = top; y < top + height; y++) {
    for (let x = left; x < left + width; x++) {
      const key = `${Math.floor(x / 256)},${Math.floor(y / 256)}`;
      const tile = tiles.get(key) ?? new Uint8Array(256 * 256 * 4);
      tiles.set(key, tile);
      tile.set(rgba, ((y % 256) * 256 + (x % 256)) * 4);
    }
  }

  return tiles;
}

type Result = Awaited<ReturnType<typeof transformEdit.run>>;

function pixel(result: Result, x: number, y: number) {
  const change = result.changes.find((candidate) => candidate.key === `${Math.floor(x / 256)},${Math.floor(y / 256)}`);
  const tile = change?.after as Uint8Array | undefined;
  const index = ((y % 256) * 256 + (x % 256)) * 4;
  return tile ? [...tile.subarray(index, index + 4)] : [0, 0, 0, 0];
}

function alphaCount(result: Result) {
  let count = 0;
  for (const change of result.changes) {
    const tile = change.after as Uint8Array | undefined;
    for (let index = 3; tile && index < tile.length; index += 4) {
      count += tile[index]! > 0 ? 1 : 0;
    }
  }

  return count;
}
