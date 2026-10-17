import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { TILE_SIZE } from './brush';
import type { Layer } from './document';
import {
  createLayerThumbnailer,
  resampleThumbnail,
  thumbnailFrame,
  thumbnailShape,
  type LayerThumbnailsUpdate
} from './layerThumbnails';
import { TILE_BYTES, type TileData } from './tilePixels';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

it('frames the tiles of every layer, and the tile around the origin for an empty drawing', () => {
  expect(thumbnailFrame([layer('a'), layer('b')])).toEqual({ left: -128, top: -128, width: 256, height: 256 });
  expect(thumbnailFrame([layer('a', { '-1,0': solid(0) }), layer('b', { '2,3': solid(0) })])).toEqual({
    left: -TILE_SIZE,
    top: 0,
    width: 4 * TILE_SIZE,
    height: 4 * TILE_SIZE
  });
});

it('keeps the frame aspect and resamples from the coarsest level at least as detailed as the thumbnail', () => {
  const frame = { left: 0, top: 0, width: 4096, height: 1024 };
  expect(thumbnailShape(frame, 128)).toEqual({ width: 128, height: 32, level: 5 });
  expect(thumbnailShape(frame, 100)).toEqual({ width: 100, height: 25, level: 5 });
  // Never larger than the frame itself.
  expect(thumbnailShape({ left: 0, top: 0, width: 256, height: 256 }, 512)).toEqual({
    width: 256,
    height: 256,
    level: 0
  });
});

it('averages the page pixels each thumbnail pixel covers, weighted by covered area', () => {
  // Opaque red on the left tile, nothing on the right one; three thumbnail pixels span both.
  const pages = new Map([['0,0', solid(255)]]);
  const frame = { left: 0, top: 0, width: 2 * TILE_SIZE, height: TILE_SIZE };
  const shape = { width: 3, height: 1, level: 0 };
  const pixels = resampleThumbnail((x, y) => pages.get(`${x},${y}`), frame, shape);
  expect([...pixels]).toEqual([255, 0, 0, 255, 128, 0, 0, 128, 0, 0, 0, 0]);

  // Only the requested rows are written.
  const target = new Uint8Array(4 * 2 * 4).fill(7);
  const red = solid(255);
  resampleThumbnail(
    () => red,
    { left: 0, top: 0, width: 256, height: 512 },
    { width: 2, height: 4, level: 0 },
    target,
    [1, 2]
  );
  expect([...target.subarray(0, 8)]).toEqual(new Array(8).fill(7));
  expect([...target.subarray(8, 16)]).toEqual([255, 0, 0, 255, 255, 0, 0, 255]);
});

it('makes nothing until asked, then images of every layer, and later only of the layers that changed', async () => {
  const { thumbnailer, posts, encoded, layers } = setup([layer('a', { '0,0': solid(255) }), layer('b')]);
  thumbnailer.changed();
  await vi.advanceTimersByTimeAsync(1000);
  expect(posts).toEqual([]);

  thumbnailer.resize(64);
  await vi.advanceTimersByTimeAsync(1000);
  expect(posts).toHaveLength(1);
  expect(posts[0]).toMatchObject({ frame: { left: 0, top: 0, width: 256, height: 256 }, layerIds: ['a', 'b'] });
  expect(posts[0]!.thumbnails.map(({ layerId, width, height }) => ({ layerId, width, height }))).toEqual([
    { layerId: 'a', width: 64, height: 64 },
    { layerId: 'b', width: 64, height: 64 }
  ]);
  // The red tile downsamples to red; the empty layer is transparent.
  expect([...encoded[0]!.subarray(0, 4)]).toEqual([255, 0, 0, 255]);
  expect(encoded[1]!.every((value) => value === 0)).toBe(true);

  // Repeating the size and changes that leave the pixels alone send nothing.
  thumbnailer.resize(64);
  thumbnailer.changed();
  await vi.advanceTimersByTimeAsync(1000);
  expect(posts).toHaveLength(1);

  layers[1]!.tiles.set('0,0', solid(128));
  thumbnailer.changed();
  await vi.advanceTimersByTimeAsync(1000);
  expect(posts).toHaveLength(2);
  expect(posts[1]!.thumbnails.map((image) => image.layerId)).toEqual(['b']);

  // Paint in a new tile moves the frame, so every layer is drawn again.
  layers[0]!.tiles.set('1,0', solid(255));
  thumbnailer.changed();
  await vi.advanceTimersByTimeAsync(1000);
  expect(posts[2]).toMatchObject({ frame: { left: 0, top: 0, width: 512, height: 256 } });
  expect(posts[2]!.thumbnails.map(({ layerId, width, height }) => ({ layerId, width, height }))).toEqual([
    { layerId: 'a', width: 64, height: 32 },
    { layerId: 'b', width: 64, height: 32 }
  ]);

  // A deleted layer only changes the ids.
  layers.splice(1, 1);
  thumbnailer.changed();
  await vi.advanceTimersByTimeAsync(1000);
  expect(posts[3]).toMatchObject({ layerIds: ['a'], thumbnails: [] });
  thumbnailer.dispose();
});

it('waits for drawing to stop, retrying an update a stroke stopped, and starts over after being turned off', async () => {
  let idle = false;
  const { thumbnailer, posts } = setup([layer('a', { '0,0': solid(255) })], () => idle);
  thumbnailer.resize(32);
  await vi.advanceTimersByTimeAsync(2000);
  expect(posts).toEqual([]);

  // A stroke ended without a change, such as a cancelled one: the retry still comes.
  idle = true;
  await vi.advanceTimersByTimeAsync(1000);
  expect(posts).toHaveLength(1);

  thumbnailer.resize(undefined);
  thumbnailer.changed();
  await vi.advanceTimersByTimeAsync(1000);
  expect(posts).toHaveLength(1);

  thumbnailer.resize(32);
  await vi.advanceTimersByTimeAsync(1000);
  expect(posts).toHaveLength(2);
  expect(posts[1]!.thumbnails).toHaveLength(1);
  thumbnailer.dispose();
});

it('reads derived pages from the shared overview storage and writes the ones it builds', async () => {
  const stored = new Map<string, Uint8Array>();
  const storage = {
    read: vi.fn(async (key: string) => stored.get(key)),
    write: vi.fn((key: string, pixels: Uint8Array) => void stored.set(key, pixels))
  };
  // Stored tile versions, as the runtime's tiles are once persisted, so both pyramids name them alike.
  const red = { storageId: 'red', byteLength: TILE_BYTES };
  const first = setup([layer('a', { '0,0': red })], () => true, storage);
  first.thumbnailer.resize(64);
  await waitFor(() => first.posts.length === 1);
  // Levels 1 and 2 were built from the tile.
  expect(storage.write).toHaveBeenCalledTimes(2);
  first.thumbnailer.dispose();

  // Another pyramid over the same tile versions reads them back instead.
  const second = setup(first.layers, () => true, storage);
  second.thumbnailer.resize(64);
  await waitFor(() => second.posts.length === 1);
  expect(storage.write).toHaveBeenCalledTimes(2);
  expect([...second.encoded[0]!.subarray(0, 4)]).toEqual([255, 0, 0, 255]);
  second.thumbnailer.dispose();
});

/** Advances fake time until `condition` holds; content keys hash with real asynchronous I/O that fake timers skip. */
async function waitFor(condition: () => boolean) {
  const deadline = vi.getRealSystemTime() + 2000;
  while (!condition() && vi.getRealSystemTime() < deadline) {
    await vi.advanceTimersByTimeAsync(10);
  }

  expect(condition()).toBe(true);
}

/** A thumbnailer over `layers`, whose posts and encoded pixels the test reads. */
function setup(layers: Layer[], idle = () => true, storage?: Parameters<typeof createLayerThumbnailer>[0]['storage']) {
  const posts: LayerThumbnailsUpdate[] = [];
  const encoded: Uint8ClampedArray[] = [];
  const thumbnailer = createLayerThumbnailer({
    layers: () => layers,
    read: async (data) => (data instanceof Uint8Array ? data : solid(255)),
    storage,
    idle,
    post: (update) => posts.push(update),
    onError: (error) => {
      throw error;
    },
    encode: async (pixels) => {
      encoded.push(pixels);
      return new Blob([]);
    }
  });
  return { thumbnailer, posts, encoded, layers };
}

function layer(id: string, tiles: Record<string, TileData> = {}): Layer {
  return { id, name: id, visible: true, opacity: 1, blend: 'normal', tiles: new Map(Object.entries(tiles)) };
}

/** A full tile of premultiplied red at alpha `alpha`. */
function solid(alpha: number) {
  const pixels = new Uint8Array(TILE_BYTES);
  for (let index = 0; index < TILE_BYTES; index += 4) {
    pixels.set([alpha, 0, 0, alpha], index);
  }

  return pixels;
}
