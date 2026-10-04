import type { DocumentEditContext } from '@app-game/paint-core/composition/documentEdit';
import type { Layer } from '@app-game/paint-core/document';
import { unpackTile } from '@app-game/paint-core/tilePixels';
import { expect, it, vi } from 'vitest';
import { applyAffine, boxAffine, identity, invertAffine, multiplyAffine, type Affine } from './affine';
import { fromAffine, rectToQuad } from './projective';
import { transformEdit, type TransformCommand } from './transformEdit';
import { warpFromMatrix, warpNumbers } from './warp';

it('lifts the pixels as floating pixels and moves them without changing the document', async () => {
  const { run, floating } = setup(square(10, 20, 4, 6, [0, 0, 255, 255]));
  const begun = await run({ phase: 'begin' });
  expect(begun).toEqual({ changes: [], reply: { bounds: { left: 10, top: 20, right: 14, bottom: 26 } } });
  expect(floating.show).toHaveBeenCalledWith(
    expect.objectContaining({
      layerId: 'layer',
      bounds: { left: 10, top: 20, right: 14, bottom: 26 },
      matrix: fromAffine(identity),
      interpolation: 'smooth'
    })
  );
  expect(floating.show.mock.calls[0]![0].pixels).toHaveLength(4 * 6 * 4);

  const moved = await run({ phase: 'update', interpolation: 'pixels', matrix: [1, 0, 100, 0, 1, 0, 0, 0, 1] });
  expect(moved).toEqual({ changes: [] });
  expect(floating.move).toHaveBeenLastCalledWith([1, 0, 100, 0, 1, 0, 0, 0, 1], 'pixels', undefined);
  await expect(run({ phase: 'update', interpolation: 'smooth', matrix: [0, 0, 0, 0, 1, 0, 0, 0, 1] })).rejects.toThrow(
    'too thin'
  );

  expect(await run({ phase: 'cancel' })).toEqual({ changes: [] });
  expect(floating.clear).toHaveBeenCalledOnce();
  await expect(run({ phase: 'update', interpolation: 'smooth', matrix: [...fromAffine(identity)] })).rejects.toThrow(
    'Start a transform first'
  );
});

it('draws the latest transform into the layer when it ends', async () => {
  const blue = square(10, 20, 4, 6, [0, 0, 255, 255]);
  const { run, floating } = setup(blue);
  const finish = async (matrix?: Affine, interpolation: 'smooth' | 'pixels' = 'smooth') => {
    await run({ phase: 'begin' });
    if (matrix) {
      await run({ phase: 'update', interpolation, matrix: [...fromAffine(matrix)] });
    }

    return run({ phase: 'end' });
  };

  // Ending without a change, or back where it began, leaves the layer and its history alone.
  expect(await finish()).toEqual({ changes: [] });
  expect(await finish(identity)).toEqual({ changes: [] });
  expect(floating.clear).toHaveBeenCalledTimes(2);

  const moved = await finish([1, 0, 0, 1, 100, 0]);
  expect(pixel(moved, 10, 20)).toEqual([0, 0, 0, 0]);
  expect(pixel(moved, 110, 20)).toEqual([0, 0, 255, 255]);
  expect(alphaCount(moved)).toBe(24);
  // `before` is the layer as the transform began.
  expect(moved.changes.every((change) => change.before === blue.get(change.key))).toBe(true);

  expect(alphaCount(await finish([2, 0, 0, 2, -10, -20]))).toBe(8 * 12);

  // Pixel art keeps hard edges: scaled by 1.5 with the nearest pixel, every pixel is either the color or empty.
  expect([...alphas(await finish([1.5, 0, 0, 1.5, -5, -10], 'pixels'))].sort()).toEqual([0, 255]);
  expect(alphas(await finish([1.5, 0, 0, 1.5, -5, -10], 'smooth')).size).toBeGreaterThan(2);
});

it('enlarges bicubically without halos around the pixels', async () => {
  const { run } = setup(square(10, 10, 4, 4, [255, 0, 0, 255]));
  await run({ phase: 'begin' });
  await run({ phase: 'update', interpolation: 'smooth', matrix: [3, 0, -20, 0, 3, -20, 0, 0, 1] });
  const ended = await run({ phase: 'end' });
  const tile = ended.changes.find((change) => change.key === '0,0')!.after as Uint8Array;
  for (let index = 0; index < tile.length; index += 4) {
    expect(tile[index]!).toBeLessThanOrEqual(tile[index + 3]!);
  }

  // The enlarged square spans 10–22 px; its middle is solid and nothing spills past a pixel beyond it.
  expect(pixel(ended, 16, 16)).toEqual([255, 0, 0, 255]);
  expect(pixel(ended, 24, 16)).toEqual([0, 0, 0, 0]);
});

it('draws a perspective distortion into the quad its corners make', async () => {
  const { run } = setup(square(0, 0, 100, 100, [255, 0, 0, 255]));
  await run({ phase: 'begin' });
  // The top edge narrows to 40 px, centered, like a floor seen from above.
  const quad = [
    { x: 30, y: 0 },
    { x: 70, y: 0 },
    { x: 100, y: 100 },
    { x: 0, y: 100 }
  ] as const;
  await run({
    phase: 'update',
    interpolation: 'smooth',
    matrix: [...rectToQuad({ left: 0, top: 0, right: 100, bottom: 100 }, quad)]
  });
  const ended = await run({ phase: 'end' });
  expect(pixel(ended, 50, 2)).toEqual([255, 0, 0, 255]);
  expect(pixel(ended, 10, 2)).toEqual([0, 0, 0, 0]);
  expect(pixel(ended, 2, 97)[3]).toBe(255);
  // A trapezoid of (40 + 100) / 2 × 100 px.
  expect(Math.abs(alphaCount(ended) - 7000)).toBeLessThan(150);
});

it('warps the pixels through the patch, covering each pixel once', async () => {
  const bounds = { left: 0, top: 0, right: 40, bottom: 30 };
  // Half-transparent pixels show a pixel drawn twice, as more opaque.
  const { run, floating } = setup(square(0, 0, 40, 30, [0, 64, 0, 128]));
  const warp = async (points: { x: number; y: number }[]) => {
    await run({ phase: 'begin' });
    await run({ phase: 'update', interpolation: 'pixels', matrix: [...fromAffine(identity)], warp: points });
    return run({ phase: 'end' });
  };

  // A warp that only moves the pixels draws each of them exactly once, with no seams between the mesh's triangles.
  const moved = warpFromMatrix(bounds, fromAffine([1, 0, 0, 1, 100.25, 50]));
  const shifted = await warp(moved);
  expect(floating.move).toHaveBeenLastCalledWith(fromAffine(identity), 'pixels', warpNumbers(moved));
  expect(alphaCount(shifted)).toBe(40 * 30);
  expect([...alphas(shifted)].sort()).toEqual([0, 128]);
  expect(pixel(shifted, 120, 65)).toEqual([0, 64, 0, 128]);

  // Pulling the two middle points of the top row up 30 px bows the top edge upward; the corners stay.
  const bowed = warpFromMatrix(bounds, fromAffine(identity)).map((point, index) =>
    index === 1 || index === 2 ? { x: point.x, y: point.y - 30 } : point
  );
  const bent = await warp(bowed);
  expect(pixel(bent, 20, -10)[3]).toBe(128);
  expect(pixel(bent, 1, -10)[3]).toBe(0);
  expect(pixel(bent, 20, 29)[3]).toBe(128);
  // A warp needs (3n + 1)² control points; a 2 × 2 grid of patches has 49.
  await expect(
    (async () =>
      run({ phase: 'update', interpolation: 'smooth', matrix: [...fromAffine(identity)], warp: bowed.slice(1) }))()
  ).rejects.toThrow('control points');
  const grid = warpFromMatrix(bounds, fromAffine(identity), 2);
  expect(grid).toHaveLength(49);
  await run({ phase: 'begin' });
  await expect(
    run({ phase: 'update', interpolation: 'pixels', matrix: [...fromAffine(identity)], warp: grid })
  ).resolves.toEqual({ changes: [] });
  await run({ phase: 'cancel' });
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
  const floating = {
    show: vi.fn<DocumentEditContext['floating']['show']>(),
    move: vi.fn<DocumentEditContext['floating']['move']>(),
    clear: vi.fn(async () => {})
  };
  const context: DocumentEditContext = {
    layers: [layer],
    active: layer,
    readTile: async (pixels) => unpackTile(pixels),
    state: { get: () => state, set: (value) => (state = value) },
    floating
  };
  return { tiles, floating, run: (command: TransformCommand) => transformEdit.run(context, command) };
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

/** The distinct alpha values of the changed tiles. */
function alphas(result: Result) {
  return new Set(
    result.changes.flatMap((change) =>
      [...((change.after as Uint8Array | undefined) ?? [])].filter((_, index) => index % 4 === 3)
    )
  );
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
