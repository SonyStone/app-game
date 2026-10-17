import { TILE_SIZE } from './brush';
import type { Layer } from './document';
import type { DocumentRect } from './layersInView';
import { createPageWork, ObsoletePageError } from './pageWork';
import type { TileData } from './tilePixels';
import { createVirtualPages, MAX_LEVEL, type OverviewStorage } from './virtualPages';

/**
 * Makes small images of every layer's own pixels for layer panels, all showing the same document rectangle (see
 * `thumbnailFrame`), so they line up. Off until `resize` gives a size; then each update re-renders only the layers
 * whose pixels under that rectangle, or the rectangle itself, changed, and posts their images in one batch.
 *
 * Thumbnails come from a sparse overview pyramid of their own (`createVirtualPages`): the level just finer than the
 * thumbnail is resampled with an exact box filter. It shares the renderer's content-addressed overview `storage`, so
 * after a stroke the pages the renderer just derived are read back instead of rebuilt from full-resolution tiles, and
 * it does not depend on the renderer, so it survives renderer restarts.
 *
 * Updates wait `delayMs` after the latest `changed` and run outside the command queue in small budgeted steps. Before
 * each step `idle` is checked: while it is false, such as during a stroke, the update is abandoned and retried later,
 * so it never competes with drawing. Owns timers; call `dispose` when done.
 */
export function createLayerThumbnailer(options: {
  /** The document's layers, bottom to top; read when an update starts. */
  layers: () => readonly Layer[];
  /** Reads the packed pixels of a tile version kept in storage. */
  read: (data: TileData) => Promise<Uint8Array>;
  /** Derived overview pages, shared with the renderer; this thumbnailer never calls `retain`. */
  storage?: Omit<OverviewStorage, 'retain'>;
  /** Whether thumbnails may be made now; false abandons an update in progress, which is retried after `delayMs`. */
  idle: () => boolean;
  /** Receives each batch of new images. */
  post: (update: LayerThumbnailsUpdate) => void;
  /** Reports a failed update, other than an abandoned one; the next `changed` tries again. */
  onError?: (error: unknown) => void;
  /** Encodes unpremultiplied sRGB RGBA pixels as an image; PNG through an OffscreenCanvas by default. */
  encode?: (pixels: Uint8ClampedArray<ArrayBuffer>, width: number, height: number) => Promise<Blob>;
  /** Pause after the latest change before an update starts, in milliseconds; 400 by default. */
  delayMs?: number;
}) {
  const { delayMs = 400, encode = encodeThumbnailPng } = options;
  // A smaller CPU slice than the renderer's: a pen-down arriving mid-update waits for at most one slice.
  const work = createPageWork({ cpuMs: 2 });
  const pages = createVirtualPages(options.read, pyramidBudget, options.storage, work);
  /** Longer side of the thumbnails in pixels; undefined while off. */
  let size: number | undefined;
  /** The latest rendered image of each layer and what it shows, posted or not. */
  const rendered = new Map<string, { signature: string; image: LayerThumbnailImage }>();
  /** The signature of each layer's posted image, and the frame and layer order last posted. */
  const sent = new Map<string, string>();
  let sentLayout = '';
  let timer: ReturnType<typeof setTimeout> | undefined;
  /** Advances on every change, so an update that started earlier is abandoned. */
  let generation = 0;
  /** Something changed since the latest completed update. */
  let dirty = false;
  let running = false;
  let disposed = false;

  return {
    /**
     * Turns thumbnails on at `size` pixels on their longer side (clamped to 16–256), re-rendering every layer when
     * the size changes, or off with `undefined`, which drops every image and cached page. Repeating the size changes
     * nothing.
     */
    resize(next: number | undefined) {
      const clamped = next === undefined || !(next > 0) ? undefined : Math.round(Math.min(256, Math.max(16, next)));
      if (clamped === size) {
        return;
      }

      size = clamped;
      if (size === undefined) {
        stop();
        return;
      }

      changed();
    },
    /** The document changed: schedules an update while thumbnails are on. Cheap; call after every change. */
    changed,
    /** Stops updates and releases cached pages. */
    dispose() {
      disposed = true;
      stop();
      work.dispose();
    }
  };

  function changed() {
    generation++;
    dirty = true;
    if (size === undefined || disposed) {
      return;
    }

    clearTimeout(timer);
    timer = setTimeout(update, delayMs);
  }

  function stop() {
    generation++;
    dirty = false;
    clearTimeout(timer);
    timer = undefined;
    rendered.clear();
    sent.clear();
    sentLayout = '';
    pages.clear();
  }

  /** Runs one update unless one is running or drawing goes on; either way, a later attempt follows while dirty. */
  async function update() {
    timer = undefined;
    if (running || size === undefined || disposed) {
      return;
    }

    if (!options.idle()) {
      timer = setTimeout(update, delayMs);
      return;
    }

    running = true;
    const started = generation;
    const target = size;
    const valid = () => !disposed && generation === started && size === target && options.idle();
    try {
      await refresh(target, valid);
      if (generation === started) {
        dirty = false;
      }
    } catch (error) {
      if (!(error instanceof ObsoletePageError)) {
        dirty = false;
        options.onError?.(error);
      }
    } finally {
      running = false;
      if (dirty && size !== undefined && !disposed && timer === undefined) {
        timer = setTimeout(update, delayMs);
      }
    }
  }

  /** Renders the layers whose pixels or frame changed and posts them with the frame and the current layer order. */
  async function refresh(target: number, valid: () => boolean) {
    const layers = options.layers();
    pages.invalidate();
    pages.sync(layers as Layer[]);
    const frame = thumbnailFrame(layers);
    const shape = thumbnailShape(frame, target);
    const layout = `${frame.left},${frame.top},${frame.width},${frame.height}/${shape.width}x${shape.height}`;
    const covering = coveringPages(frame, shape.level);
    for (const layer of layers) {
      const versions = covering.map(({ x, y }) => pages.pageVersion({ layerId: layer.id, level: shape.level, x, y }));
      const signature = `${layout}|${versions.join(',')}`;
      if (rendered.get(layer.id)?.signature === signature) {
        continue;
      }

      const pixels = await renderLayer(layer.id, frame, shape, covering, valid);
      const image = await encode(unpremultiply(pixels), shape.width, shape.height);
      if (!valid()) {
        throw new ObsoletePageError();
      }

      rendered.set(layer.id, {
        signature,
        image: { layerId: layer.id, width: shape.width, height: shape.height, image }
      });
    }

    const ids = new Set(layers.map((layer) => layer.id));
    for (const id of [...rendered.keys()]) {
      if (!ids.has(id)) {
        rendered.delete(id);
        sent.delete(id);
      }
    }

    const fresh = layers.flatMap((layer) => {
      const entry = rendered.get(layer.id)!;
      return sent.get(layer.id) === entry.signature ? [] : [entry];
    });
    const order = `${layout}|${[...ids].join('\n')}`;
    if (!fresh.length && order === sentLayout) {
      return;
    }

    for (const entry of fresh) {
      sent.set(entry.image.layerId, entry.signature);
    }

    sentLayout = order;
    options.post({ frame, layerIds: [...ids], thumbnails: fresh.map((entry) => entry.image) });
  }

  /** Premultiplied RGBA pixels of one layer's thumbnail, resampled in bounded bands of rows. */
  async function renderLayer(
    layerId: string,
    frame: DocumentRect,
    shape: ThumbnailShape,
    covering: readonly { x: number; y: number }[],
    valid: () => boolean
  ) {
    const found = new Map<string, Uint8Array>();
    for (const { x, y } of covering) {
      const page = { layerId, level: shape.level, x, y };
      if (pages.pageVersion(page) !== undefined) {
        found.set(`${x},${y}`, await pages.pagePixels(page, valid));
      }
    }

    const pixels = new Uint8Array(shape.width * shape.height * 4);
    if (!found.size) {
      return pixels;
    }

    const band = Math.max(1, Math.floor(bandPixels / shape.width));
    const lookup = (x: number, y: number) => found.get(`${x},${y}`);
    for (let row = 0; row < shape.height; row += band) {
      await work.run(
        () => resampleThumbnail(lookup, frame, shape, pixels, [row, Math.min(shape.height, row + band)]),
        valid
      );
    }

    return pixels;
  }
}

/** New images of some layers, with the rectangle every thumbnail shows and the ids of all current layers. */
export type LayerThumbnailsUpdate = {
  /**
   * The document rectangle every thumbnail shows, in document pixels: the tile-aligned bounds of the paint of all
   * layers; see `thumbnailFrame`. Images posted earlier for another frame are replaced in the same batch.
   */
  frame: DocumentRect;
  /** Ids of every layer, bottom to top; thumbnails of other ids belong to deleted layers. */
  layerIds: string[];
  /** Images of the layers whose pixels or frame changed since the previous batch; empty layers get transparent ones. */
  thumbnails: LayerThumbnailImage[];
};

/** One layer's thumbnail: its own pixels, regardless of visibility, opacity or blend mode. */
export type LayerThumbnailImage = {
  layerId: string;
  /** Image size in pixels; the frame's aspect, with `size` pixels on the longer side. */
  width: number;
  height: number;
  /** A PNG of the layer's unpremultiplied sRGB pixels, transparent where the layer has none. */
  image: Blob;
};

/**
 * The document rectangle the thumbnails show: the bounds of the tiles of every layer, so a layer's thumbnail shows
 * where its paint lies in the whole drawing. An empty drawing gives the tile around the origin, where a new view is
 * centered. Tile-aligned, so it changes only when paint reaches a new tile.
 */
export function thumbnailFrame(layers: readonly Pick<Layer, 'tiles'>[]): DocumentRect {
  let left = Infinity,
    top = Infinity,
    right = -Infinity,
    bottom = -Infinity;
  for (const layer of layers) {
    for (const key of layer.tiles.keys()) {
      const comma = key.indexOf(',');
      const x = Number(key.slice(0, comma)),
        y = Number(key.slice(comma + 1));
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }
  }

  if (left === Infinity) {
    return { left: -TILE_SIZE / 2, top: -TILE_SIZE / 2, width: TILE_SIZE, height: TILE_SIZE };
  }

  return {
    left: left * TILE_SIZE,
    top: top * TILE_SIZE,
    width: (right - left + 1) * TILE_SIZE,
    height: (bottom - top + 1) * TILE_SIZE
  };
}

/**
 * The pixel size of thumbnails of `frame` with `size` pixels on the longer side (never more than the frame's own),
 * and the overview level they are resampled from: the coarsest one still at least as detailed as the thumbnail.
 */
export function thumbnailShape(frame: DocumentRect, size: number): ThumbnailShape {
  const longer = Math.max(frame.width, frame.height);
  const scale = longer / Math.min(size, longer);
  return {
    width: Math.max(1, Math.round(frame.width / scale)),
    height: Math.max(1, Math.round(frame.height / scale)),
    level: Math.max(0, Math.min(MAX_LEVEL, Math.floor(Math.log2(scale) + 1e-9)))
  };
}

/** Thumbnail pixel size and the overview level its pixels come from; see `thumbnailShape`. */
export type ThumbnailShape = { width: number; height: number; level: number };

/**
 * Resamples a document rectangle from overview pages of one level into premultiplied RGBA thumbnail pixels with an
 * exact box filter: each thumbnail pixel averages the page pixels its footprint covers, weighted by covered area.
 * `page(x, y)` returns the level's page at page coordinates, `undefined` where it is transparent. Writes rows
 * `rows[0]` to `rows[1]` (all by default) of `target` and returns it.
 */
export function resampleThumbnail(
  page: (x: number, y: number) => Uint8Array | undefined,
  frame: DocumentRect,
  shape: ThumbnailShape,
  target = new Uint8Array(shape.width * shape.height * 4),
  rows: readonly [number, number] = [0, shape.height]
): Uint8Array {
  const unit = 2 ** shape.level;
  const columns = boxTaps(frame.left / unit, frame.width / unit, shape.width);
  const lines = boxTaps(frame.top / unit, frame.height / unit, shape.height);
  // Every page the taps reach, looked up once rather than per tap.
  const across = columns.lastPage - columns.firstPage + 1;
  const grid: (Uint8Array | undefined)[] = [];
  for (let y = lines.firstPage; y <= lines.lastPage; y++) {
    for (let x = columns.firstPage; x <= columns.lastPage; x++) {
      grid.push(page(x, y));
    }
  }

  for (let y = rows[0]; y < rows[1]; y++) {
    for (let x = 0; x < shape.width; x++) {
      let r = 0,
        g = 0,
        b = 0,
        a = 0;
      for (let row = lines.offsets[y]!; row < lines.offsets[y + 1]!; row++) {
        const pageRow = (lines.pages[row]! - lines.firstPage) * across;
        const lineStart = lines.within[row]! * TILE_SIZE;
        const rowWeight = lines.weights[row]!;
        for (let column = columns.offsets[x]!; column < columns.offsets[x + 1]!; column++) {
          const pixels = grid[pageRow + columns.pages[column]! - columns.firstPage];
          if (!pixels) {
            continue;
          }

          const weight = rowWeight * columns.weights[column]!;
          const index = (lineStart + columns.within[column]!) * 4;
          r += pixels[index]! * weight;
          g += pixels[index + 1]! * weight;
          b += pixels[index + 2]! * weight;
          a += pixels[index + 3]! * weight;
        }
      }

      const out = (y * shape.width + x) * 4;
      target[out] = Math.round(r);
      target[out + 1] = Math.round(g);
      target[out + 2] = Math.round(b);
      target[out + 3] = Math.round(a);
    }
  }

  return target;
}

/** Encodes unpremultiplied RGBA pixels as a PNG through an OffscreenCanvas, in a worker or on the main thread. */
export async function encodeThumbnailPng(
  pixels: Uint8ClampedArray<ArrayBuffer>,
  width: number,
  height: number
): Promise<Blob> {
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Could not draw a layer thumbnail.');
  }

  context.putImageData(new ImageData(pixels, width, height), 0, 0);
  return canvas.convertToBlob({ type: 'image/png' });
}

/** Page coordinates at `level` of every page that `frame` overlaps. */
function coveringPages(frame: DocumentRect, level: number) {
  const span = TILE_SIZE * 2 ** level;
  const covering: { x: number; y: number }[] = [];
  const x0 = Math.floor(frame.left / span),
    x1 = Math.ceil((frame.left + frame.width) / span) - 1;
  const y0 = Math.floor(frame.top / span),
    y1 = Math.ceil((frame.top + frame.height) / span) - 1;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      covering.push({ x, y });
    }
  }

  return covering;
}

/**
 * For each of `count` equal output cells spanning `extent` source pixels from `origin`, the source pixels it covers,
 * as a page index and a pixel within that page, and the share of the cell each covers; cell `i` uses entries
 * `offsets[i]` to `offsets[i + 1]`. `firstPage` and `lastPage` bound the pages used.
 */
function boxTaps(origin: number, extent: number, count: number) {
  const step = extent / count;
  const offsets = new Int32Array(count + 1);
  const pages: number[] = [];
  const within: number[] = [];
  const weights: number[] = [];
  for (let cell = 0; cell < count; cell++) {
    const start = origin + cell * step,
      end = start + step;
    for (let source = Math.floor(start); source < end; source++) {
      const covered = Math.min(end, source + 1) - Math.max(start, source);
      if (covered > 1e-9) {
        const page = Math.floor(source / TILE_SIZE);
        pages.push(page);
        within.push(source - page * TILE_SIZE);
        weights.push(covered / step);
      }
    }

    offsets[cell + 1] = pages.length;
  }

  return {
    offsets,
    pages: Int32Array.from(pages),
    within: Int32Array.from(within),
    weights: Float64Array.from(weights),
    firstPage: Math.min(...pages),
    lastPage: Math.max(...pages)
  };
}

/** Premultiplied RGBA to the straight alpha `ImageData` expects. */
function unpremultiply(pixels: Uint8Array): Uint8ClampedArray<ArrayBuffer> {
  const straight = new Uint8ClampedArray(pixels.length);
  for (let index = 0; index < pixels.length; index += 4) {
    const alpha = pixels[index + 3]!;
    if (!alpha) {
      continue;
    }

    straight[index] = Math.round((pixels[index]! * 255) / alpha);
    straight[index + 1] = Math.round((pixels[index + 1]! * 255) / alpha);
    straight[index + 2] = Math.round((pixels[index + 2]! * 255) / alpha);
    straight[index + 3] = alpha;
  }

  return straight;
}

/** Bytes of overview pages the thumbnailer keeps in RAM; older ones are read again from `storage` when needed. */
const pyramidBudget = 8 * 1048576;

/** Thumbnail pixels resampled per budgeted step: about a millisecond on a tablet. */
const bandPixels = 4096;
