import {
  drawClip,
  drawCount,
  drawFirst,
  drawKind,
  drawMatrix,
  drawSegments,
  drawTranslation,
  imageKind
} from '../../plan/drawRecord';
import type { SceneFrame } from '../createFrame';
import type { createDetailTableWorker } from './createDetailTableWorker';

/**
 * Builds larger prefix-area tables on demand for ordinary fills that a reading view or a page tile magnifies beyond
 * their prepared table (dense outlines have none), so their pixels read a table instead of integrating source cubics
 * in every pixel. A table covers a square window of the outline's unit box: the whole outline for views, and only the
 * region a tile shows for page tiles, which bounds its size however far a tile magnifies a dense illustration. Tables
 * have about four cells per pixel along each of the outline's axes, a margin over the three where `tableCoverage`
 * trusts them fully, and live in the pool reserved by
 * `prepareCoverageTables` until less recently drawn outlines need the space. Tables approximate the source curves
 * within about 22/255 at edges, visually indistinguishable from exact evaluation. `changed` requests a redraw after tables land; nothing is built without `worker` or pool space, and results arriving after `destroy` are dropped.
 */
export function createDetailTables({
  device,
  detail,
  baseOffsets,
  document,
  worker,
  changed
}: {
  device: GPUDevice;
  detail: DetailStorage;
  /** Prepared table offsets, indexed by an outline's first curve. */
  baseOffsets: Uint32Array;
  document: {
    instances: ArrayBuffer;
    curves: ArrayBuffer;
    pages: readonly { x: number; y: number; beginVertex: number; endVertex: number }[];
  };
  worker?: ReturnType<typeof createDetailTableWorker>;
  changed: () => void;
}) {
  const records = new DataView(document.instances);
  // Tables are addressed by first curve alone, so outlines drawn with several fill rules or lengths cannot share one.
  const ambiguous = ambiguousOutlines(records);
  const curves = new Float32Array(document.curves);
  // Tiles get their own region: their tables guard against multi-second renders, so text tables must not crowd them out.
  const tileWords = Math.floor(detail.poolWords * tilePoolShare);
  const regions = {
    view: { offset: tileWords, pool: createPoolAllocator(detail.poolWords - tileWords) },
    tile: { offset: 0, pool: createPoolAllocator(tileWords) }
  };
  /** Resident tables by outline (first curve). */
  const entries = new Map<
    number,
    DetailWant & {
      start: number;
      length: number;
      used: number;
      /** Clock when the table last suited a want without being needlessly fine. */
      fitted: number;
      region: keyof typeof regions;
    }
  >();
  /** Largest size each outline still needs, with its visible use count as priority. */
  const queue = new Map<number, DetailWant>();
  const inFlight = new Map<number, DetailWant>();
  /** Outlines whose table can never fit, or whose builds keep failing; they stay on the exact path. */
  const rejected = new Set<number>();
  /** Tick until which an outline whose table found no room is not requested again. */
  const backoff = new Map<number, number>();
  /** Counts requests and tile checks, so backoff also expires while only tiles ask for tables. */
  let ticks = 0;
  /** Outlines page tiles wait for; without their tables a tile render can stall the GPU for seconds. */
  const tileOutlines = new Set<number>();
  /** Failed worker batches per outline; a few retries tolerate a transient worker failure. */
  const failures = new Map<number, number>();
  /**
   * Outlines and sizes wanted by each page, for the {@link measuredScales} most recent scales, so split panes at
   * different zooms keep their measurements instead of discarding each other's.
   */
  const scaleWants = new Map<string, Map<number, Map<number, DetailWant>>>();
  let clock = 0;
  /** Whether the latest view request came from a moving frame, when uploads shrink to keep frames smooth. */
  let moving = false;
  /** Words uploaded since `uploadClock`, the view request they count against; tile checks share their frame's budget. */
  let uploadedWords = 0;
  let uploadClock = -1;
  let busy = false;
  let destroyed = false;
  /** Built tables waiting for upload; a few megabytes per frame keep large batches from stalling one frame. */
  const uploads: { first: number; want: DetailWant; words: Uint32Array }[] = [];
  const waiters = new Set<() => void>();

  return {
    /**
     * Requests tables for the frame's directly drawn `pages` (default all visible) and marks their resident tables as
     * used. Views with more than {@link maxDirectPages} such pages, such as overviews, rely on tiles and prepared tables.
     */
    request(frame: SceneFrame, pages: readonly number[] = frame.visible.map(({ index }) => index)) {
      if (destroyed || !worker || detail.poolWords === 0 || frame.vectorOnly) {
        return;
      }

      clock++;
      ticks++;
      moving = frame.moving;
      upload();

      if (pages.length > maxDirectPages) {
        return;
      }

      const scale = scaleKey(frame);
      const pageWants = scaleWants.get(scale) ?? new Map<number, Map<number, DetailWant>>();
      // Most recently used last; the oldest scale goes once more are kept.
      scaleWants.delete(scale);
      scaleWants.set(scale, pageWants);

      if (scaleWants.size > measuredScales) {
        scaleWants.delete(scaleWants.keys().next().value!);
      }

      for (const index of pages) {
        const wants = pageWants.get(index) ?? measurePage(index, frame);
        pageWants.set(index, wants);

        // Every outline gets a table: one sized to its scale is small, while a rare glyph such as a capital letter
        // integrating its curves in every pixel costs more than all the table reads of the body text around it.
        for (const [first, want] of wants) {
          demand(first, want);
        }
      }

      pump();
    },
    /**
     * Whether `page` can render at `frame`'s scale, such as into a page tile, without integrating dense outlines that
     * lack a fine enough table; requests the missing tables. Only outlines whose tables can never be built do not
     * block; a table waiting for room keeps the tile waiting.
     */
    ready(page: number, frame: SceneFrame) {
      if (destroyed || !worker || detail.poolWords === 0) {
        return true;
      }

      let ready = true;

      ticks++;
      upload();

      for (const [first, want] of measurePage(page, frame, true)) {
        // Small outlines stay cheap in a small tile; only dense ones risk a multi-second render.
        if (want.count <= denseSegments) {
          continue;
        }

        tileOutlines.add(first);
        ready = (demand(first, want) || rejected.has(first)) && ready;
      }

      pump();
      return ready;
    },
    /** Waits until every requested table has been built or has failed, for deterministic screenshots. */
    async settle() {
      while (!destroyed && (busy || queue.size > 0 || uploads.length > 0)) {
        // Screenshots need every table now, not paced across frames that may never come.
        while (uploads.length > 0) {
          const { first, want, words } = uploads.shift()!;
          install(first, want, words);
        }

        if (!destroyed && (busy || queue.size > 0)) {
          await new Promise<void>((resolve) => waiters.add(resolve));
        }
      }
    },
    /** Stops building; later replies are ignored. The worker belongs to its supplier. */
    destroy() {
      destroyed = true;
      queue.clear();
      uploads.length = 0;
      finish();
    }
  };

  /**
   * Marks a resident table as used this frame, or queues a build; returns whether a fitting table is resident. A table
   * much finer than wanted, as after zooming out, is rebuilt smaller unless another view, such as a split pane at a
   * closer zoom, still needed it within {@link sharedFitTicks}; otherwise two views would rebuild it in turn forever.
   */
  function demand(first: number, want: DetailWant) {
    const entry = entries.get(first);

    if (entry && coversWant(entry, want)) {
      entry.used = clock;

      if (!tooFine(entry, want)) {
        entry.fitted = clock;
      }

      if (clock - entry.fitted <= sharedFitTicks) {
        return true;
      }
    }

    // While views move, a resident table that no longer suits stays: rebuilding it uploads megabytes mid-gesture, and
    // the still frame after motion asks again. Only outlines without any table are built meanwhile.
    if (entry && moving) {
      entry.used = clock;
      return false;
    }

    const flying = inFlight.get(first);

    if (!(flying && coversWant(flying, want)) && !rejected.has(first) && (backoff.get(first) ?? 0) <= ticks) {
      const queued = queue.get(first);
      queue.set(
        first,
        queued && coversWant(queued, want) ? { ...queued, uses: Math.max(queued.uses, want.uses) } : want
      );
    }

    return false;
  }

  /**
   * Outlines of `page` whose prepared tables are too coarse at this frame's scale, with the table each needs. With
   * `windowed`, as for a page tile, a table covers only the part of the outline inside the frame.
   */
  function measurePage(page: number, frame: SceneFrame, windowed = false) {
    const wants = new Map<number, DetailWant>();
    const { x: pageX, y: pageY, beginVertex, endVertex } = document.pages[page]!;
    const [r0, r1, r2, r3] = frame.rotation;
    const [mulX, mulY] = frame.mul;
    const halfWidth = frame.width / 2;
    const halfHeight = frame.height / 2;
    // The frame's corners in world space, widened by a few pixels so tile gutters stay inside the window.
    const corners = windowed ? frameCorners(frame, windowMarginPixels) : [];

    for (let index = beginVertex / 6; index < endVertex / 6; index++) {
      const kind = drawKind(records, index);
      const count = drawSegments(records, index);

      // Only ordinary unclipped fills read tables.
      if (
        kind >= imageKind ||
        drawClip(records, index) !== 0 ||
        count === 0 ||
        ambiguous.has(drawFirst(records, index))
      ) {
        continue;
      }

      const m0 = drawMatrix(records, index, 0);
      const m1 = drawMatrix(records, index, 1);
      const m2 = drawMatrix(records, index, 2);
      const m3 = drawMatrix(records, index, 3);
      // Outline units to physical pixels, as in the curve vertex shader.
      const ax = m0 * mulX;
      const ay = -m1 * mulY;
      const bx = m2 * mulX;
      const by = -m3 * mulY;
      // Columns of the outline-to-pixel map: where its unit x and y axes land on screen.
      const xAxisX = (r0! * ax + r2! * ay) * halfWidth;
      const xAxisY = (r1! * ax + r3! * ay) * halfHeight;
      const yAxisX = (r0! * bx + r2! * by) * halfWidth;
      const yAxisY = (r1! * bx + r3! * by) * halfHeight;
      const scale = {
        pixelsPerUnit: largestSingularValue(xAxisX, xAxisY, yAxisX, yAxisY),
        axisPixels: [Math.hypot(xAxisX, xAxisY), Math.hypot(yAxisX, yAxisY)] as const
      };
      const window = windowed
        ? outlineWindow(
            corners,
            pageX,
            pageY,
            [m0, m1, m2, m3],
            [drawTranslation(records, index, 0), drawTranslation(records, index, 1)]
          )
        : fullWindow;

      if (!window) {
        continue;
      }

      const first = drawFirst(records, index);
      const grid = selectDetailGrid(scale, preparedSize(baseOffsets[first]!), window.extent);

      if (!grid) {
        continue;
      }

      const previous = wants.get(first);
      // Several instances of one outline in a tile share the whole-outline window.
      const merged = previous && !sameWindow(previous, window) ? fullWindow : window;
      const mergedGrid = merged === window ? grid : selectDetailGrid(scale, preparedSize(baseOffsets[first]!), 1);

      if (!mergedGrid) {
        continue;
      }

      const kept = previous && sameWindow(previous, merged) ? previous : { columns: 0, rows: 0 };
      wants.set(first, {
        ...merged,
        columns: Math.max(mergedGrid.columns, kept.columns),
        rows: Math.max(mergedGrid.rows, kept.rows),
        uses: (previous?.uses ?? 0) + 1,
        count,
        rule: kind
      });
    }

    return wants;
  }

  /** Sends the most used queued outlines as one bounded batch; installs its tables when it returns. */
  function pump() {
    if (busy || destroyed || queue.size === 0) {
      if (!busy && uploads.length === 0) {
        finish();
      }

      return;
    }

    const batch: (DetailWant & { first: number })[] = [];
    let floats = 0;

    for (const [first, want] of [...queue].sort(([, a], [, b]) => b.uses - a.uses)) {
      const length = (want.columns * want.rows) / 2 + windowHeaderWords;

      if (batch.length > 0 && (batch.length >= maxBatchOutlines || floats + length > maxBatchWords)) {
        break;
      }

      queue.delete(first);
      inFlight.set(first, want);
      batch.push({ first, ...want });
      floats += length;
    }

    busy = true;
    void worker!
      .build({
        outlines: batch.map(({ first, columns, rows, count, rule, x, y, extent }) => ({
          key: first,
          rule,
          grid: { columns, rows },
          window: { x, y, extent },
          curves: curves.slice(first * 8, (first + count) * 8)
        }))
      })
      .then((result) => {
        busy = false;

        for (const { first } of batch) {
          inFlight.delete(first);
        }

        if (destroyed) {
          return;
        }

        // Outlines of a failed batch may be requested again; after repeated failures tiles stop waiting for them.
        if (result.isErr()) {
          for (const { first } of batch) {
            const count = (failures.get(first) ?? 0) + 1;
            failures.set(first, count);

            if (count >= maxFailures) {
              rejected.add(first);
            }
          }
        } else {
          const wanted = new Map(batch.map((want) => [want.first, want]));

          for (const { key, words } of result.value.tables) {
            uploads.push({ first: key, want: wanted.get(key)!, words });
          }

          // The next frame uploads them; nothing visible changes until then. Waiting settles drain them now.
          changed();
          finish();
        }

        pump();
      });
  }

  /**
   * Installs queued tables up to {@link maxUploadWords} per frame, or {@link maxMovingUploadWords} while views move,
   * however many tile checks call it, and asks for another frame while some remain. At least one table goes per frame,
   * however large.
   */
  function upload() {
    const limit = moving ? maxMovingUploadWords : maxUploadWords;
    let uploaded = 0;

    if (uploadClock !== clock) {
      uploadClock = clock;
      uploadedWords = 0;
    }

    while (uploads.length > 0 && (uploadedWords === 0 || uploadedWords + uploads[0]!.words.length <= limit)) {
      const { first, want, words } = uploads.shift()!;
      uploaded += words.length;
      uploadedWords += words.length;
      install(first, want, words);
    }

    if (uploaded > 0) {
      changed();
    }

    if (uploads.length === 0 && !busy && queue.size === 0) {
      finish();
    }
  }

  /**
   * Copies a built table into the pool and publishes its offset. Space comes from tables the current frame did not
   * draw, least recently used first; a table page tiles wait for may also displace text tables of the current frame,
   * which only speed drawing up, while a missing tile table risks a multi-second render.
   */
  function install(first: number, want: DetailWant, words: Uint32Array) {
    const previous = entries.get(first);

    if (previous) {
      release(first, previous);
    }

    const length = words.length + windowHeaderWords;
    const region = tileOutlines.has(first) ? 'tile' : 'view';
    const { pool, offset } = regions[region];
    let start = pool.allocate(length);

    // Free the region's least recently drawn tables; tables the current frame drew stay.
    for (const [key, entry] of [...entries].sort(([, a], [, b]) => a.used - b.used)) {
      if (start !== undefined || entry.used >= clock) {
        break;
      }

      if (entry.region === region) {
        release(key, entry);
        start = pool.allocate(length);
      }
    }

    if (start === undefined) {
      // A table larger than its region can never fit; otherwise wait for room and ask again later.
      if (length > (region === 'tile' ? tileWords : detail.poolWords - tileWords)) {
        rejected.add(first);
      } else {
        backoff.set(first, ticks + retryAfterTicks);
      }

      return;
    }

    // The window header precedes the table; the published offset addresses the table itself.
    const header = detail.poolStart + offset + start;
    const table = header + windowHeaderWords;
    const window = new Float32Array([want.x, want.y, want.extent, 0]);
    new Uint32Array(window.buffer)[3] = want.columns | (want.rows << 16);
    device.queue.writeBuffer(detail.poolBuffer, header * 4, window);
    device.queue.writeBuffer(detail.poolBuffer, table * 4, words);
    device.queue.writeBuffer(detail.offsetBuffer, (detail.offsetStart + first) * 4, new Uint32Array([table + 1]));
    entries.set(first, { ...want, start, length, used: clock, fitted: clock, region });
  }

  function finish() {
    waiters.forEach((resolve) => resolve());
    waiters.clear();
  }

  /** Unpublishes a table before its pool space can be reused; queue order keeps earlier frames consistent. */
  function release(first: number, entry: { start: number; length: number; region: keyof typeof regions }) {
    device.queue.writeBuffer(detail.offsetBuffer, (detail.offsetStart + first) * 4, new Uint32Array([0]));
    regions[entry.region].pool.free(entry.start, entry.length);
    entries.delete(first);
  }
}

/**
 * A table an outline needs: `columns` by `rows` cells over the square window at (`x`, `y`) with side `extent` in the
 * outline's unit box, plus what building it requires and its visible use count as priority.
 */
type DetailWant = {
  x: number;
  y: number;
  extent: number;
  columns: number;
  rows: number;
  uses: number;
  count: number;
  rule: number;
};

/** Buffers and layout reserved by `prepareCoverageTables` for tables built on demand. */
type DetailStorage = {
  offsetBuffer: GPUBuffer;
  poolBuffer: GPUBuffer;
  /** First index of the on-demand half of the offset array. */
  offsetStart: number;
  /** First word of the on-demand pool in the grid buffer. */
  poolStart: number;
  poolWords: number;
};

/**
 * The on-demand table grid for an outline whose outline-to-pixel map has largest singular value `pixelsPerUnit` and
 * stretches its unit x and y axes to `axisPixels`, with a prepared table of `preparedSize` cells per side (zero without
 * one), over a window of side `extent` in its unit box (default the whole outline): per axis, the smallest of
 * {@link detailSizes} giving {@link targetCellsPerPixel} cells per pixel. Undefined when the prepared table already
 * lets a pixel span six cells (where prepared tables are trusted) or even 1024 cells would leave fewer than two (where
 * on-demand tables are not trusted at all). Shaders walk one row per cell a pixel spans, so rows sized by the
 * outline's longer axis, as for wide glyphs such as `m`, would cost time without improving coverage.
 */
export function selectDetailGrid(
  { pixelsPerUnit, axisPixels }: { pixelsPerUnit: number; axisPixels: readonly [number, number] },
  preparedSize: number,
  extent = 1
) {
  if (preparedSize >= pixelsPerUnit * 6 || pixelsPerUnit * extent * 2 > 1024) {
    return undefined;
  }

  const fit = (pixels: number) =>
    detailSizes.find((size) => size >= pixels * extent * targetCellsPerPixel) ?? detailSizes.at(-1)!;
  return { columns: fit(axisPixels[0]), rows: fit(axisPixels[1]) };
}

/**
 * Cells per side of on-demand tables, a step of about √2 so a table fits its scale closely; the grid is recorded in
 * the table's header (see `tableCoverage`). Sizes are even, as row tables pack two cells per word.
 */
export const detailSizes = [16, 24, 32, 48, 64, 96, 128, 192, 256, 384, 512, 768, 1024];
/** Cells a pixel spans in a freshly sized on-demand table: above the three where they are fully trusted, for margin. */
const targetCellsPerPixel = 4;

/**
 * First-fit allocation of float ranges within a pool of `capacity`; freed neighbours merge. Returns undefined when no
 * free range is large enough.
 */
export function createPoolAllocator(capacity: number) {
  const free = capacity > 0 ? [{ start: 0, length: capacity }] : [];

  return {
    allocate(length: number) {
      const index = free.findIndex((range) => range.length >= length);

      if (index < 0) {
        return undefined;
      }

      const range = free[index]!;
      const start = range.start;
      range.start += length;
      range.length -= length;

      if (range.length === 0) {
        free.splice(index, 1);
      }

      return start;
    },
    free(start: number, length: number) {
      let index = free.findIndex((range) => range.start > start);
      index = index < 0 ? free.length : index;
      free.splice(index, 0, { start, length });

      const next = free[index + 1];

      if (next && start + length === next.start) {
        free[index]!.length += next.length;
        free.splice(index + 1, 1);
      }

      const previous = free[index - 1];

      if (previous && previous.start + previous.length === start) {
        previous.length += free[index]!.length;
        free.splice(index, 1);
      }
    }
  };
}

/**
 * First curves of outlines that ordinary fills draw with different fill rules or segment counts, as when one path is
 * filled both nonzero and even-odd; like prepared tables, on-demand tables skip them.
 */
function ambiguousOutlines(records: DataView) {
  const seen = new Map<number, number>();
  const ambiguous = new Set<number>();

  for (let index = 0; index < drawCount(records); index++) {
    const kind = drawKind(records, index);
    const count = drawSegments(records, index);

    if (kind >= imageKind || count === 0) {
      continue;
    }

    const first = drawFirst(records, index);
    const shape = count * 2 + kind;
    const previous = seen.get(first);

    if (previous === undefined) {
      seen.set(first, shape);
    } else if (previous !== shape) {
      ambiguous.add(first);
    }
  }

  return ambiguous;
}

/** Cells per side of a prepared table from its encoded offset, or zero without one. */
function preparedSize(offset: number) {
  if (offset === 0) {
    return 0;
  }

  return offset & 0x80000000 ? 64 : offset & 0x40000000 ? 32 : 128;
}

/** Largest singular value of the 2×2 matrix with columns (a, b) and (c, d). */
function largestSingularValue(a: number, b: number, c: number, d: number) {
  const trace = a * a + b * b + c * c + d * d;
  const determinant = a * d - b * c;
  return Math.sqrt((trace + Math.sqrt(Math.max(0, trace * trace - 4 * determinant * determinant))) / 2);
}

/** Whether `table` covers `want`'s window at least as finely along both axes; a small tolerance absorbs rounding. */
function coversWant(table: DetailWant, want: DetailWant) {
  const slack = 1e-6;
  return (
    table.x <= want.x + slack &&
    table.y <= want.y + slack &&
    table.x + table.extent >= want.x + want.extent - slack &&
    table.y + table.extent >= want.y + want.extent - slack &&
    table.columns / table.extent >= (want.columns / want.extent) * (1 - slack) &&
    table.rows / table.extent >= (want.rows / want.extent) * (1 - slack)
  );
}

/**
 * Whether `table` has rows more than {@link maxExcessDensity} times finer than `want` needs, past which its pixels walk
 * enough rows to make a smaller table worth rebuilding.
 */
function tooFine(table: DetailWant, want: DetailWant) {
  return table.rows / table.extent > (want.rows / want.extent) * maxExcessDensity;
}

function sameWindow(a: { x: number; y: number; extent: number }, b: { x: number; y: number; extent: number }) {
  return a.x === b.x && a.y === b.y && a.extent === b.extent;
}

/** World-space corners of the frame's view, widened by `margin` physical pixels. */
function frameCorners(frame: SceneFrame, margin: number) {
  const [r0, r1, r2, r3] = frame.rotation;
  const determinant = r0! * r3! - r1! * r2!;
  const cornerX = 1 + (2 * margin) / frame.width;
  const cornerY = 1 + (2 * margin) / frame.height;

  return [
    [-cornerX, -cornerY],
    [cornerX, -cornerY],
    [-cornerX, cornerY],
    [cornerX, cornerY]
  ].map(([cx, cy]) => {
    // Undo the view's rotation, then its scale and offset.
    const qx = (r3! * cx! - r2! * cy!) / determinant;
    const qy = (r0! * cy! - r1! * cx!) / determinant;
    return [(qx - frame.add[0]) / frame.mul[0], (qy - frame.add[1]) / frame.mul[1]] as const;
  });
}

/**
 * The square window of an outline's unit box that world-space `corners` show, for an instance with matrix `m` and
 * translation `t` on the page placed at (`pageX`, `pageY`); undefined when the outline is outside them. Windows
 * covering most of the outline become the whole outline.
 */
function outlineWindow(
  corners: readonly (readonly [number, number])[],
  pageX: number,
  pageY: number,
  [m0, m1, m2, m3]: [number, number, number, number],
  [tx, ty]: [number, number]
) {
  const determinant = m0 * m3 - m1 * m2;

  if (Math.abs(determinant) < 1e-20) {
    return undefined;
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const [wx, wy] of corners) {
    // World to page coordinates (y measured down the page), then through the inverse instance transform.
    const px = wx + pageX - tx;
    const py = 1 - pageY - wy - ty;
    const ux = (m3 * px - m2 * py) / determinant;
    const uy = (m0 * py - m1 * px) / determinant;
    minX = Math.min(minX, ux);
    minY = Math.min(minY, uy);
    maxX = Math.max(maxX, ux);
    maxY = Math.max(maxY, uy);
  }

  minX = Math.max(0, minX);
  minY = Math.max(0, minY);
  maxX = Math.min(1, maxX);
  maxY = Math.min(1, maxY);

  if (maxX <= minX || maxY <= minY) {
    return undefined;
  }

  const extent = Math.max(maxX - minX, maxY - minY);

  if (extent >= 0.75) {
    return fullWindow;
  }

  return { x: Math.min(minX, 1 - extent), y: Math.min(minY, 1 - extent), extent };
}

/** Identifies the frame's zoom, rotation and size; pans keep it, so pages are measured once per scale. */
function scaleKey(frame: SceneFrame) {
  return [
    Math.round(Math.log2(Math.abs(frame.mul[0])) * 16),
    Math.round(Math.log2(Math.abs(frame.mul[1])) * 16),
    ...frame.rotation.map((value) => Math.round(value * 1000)),
    frame.width,
    frame.height
  ].join(':');
}

/** Scales whose page measurements are kept, enough for two split panes plus a zoom between them. */
const measuredScales = 3;
/** Segments above which an outline counts as dense, as in `planPageComposition`. */
const denseSegments = 512;
/** Share of the pool reserved for tables page tiles wait for. */
const tilePoolShare = 0.25;
/** Requests and tile checks before an outline whose table found no room is requested again. */
const retryAfterTicks = 30;
/** The whole unit box of an outline. */
const fullWindow = { x: 0, y: 0, extent: 1 };
/** Words before each table in the pool: its window's x, y and extent as float bits, then its columns and rows. */
const windowHeaderWords = 4;
/** Times finer than wanted a resident table may be before it is rebuilt smaller, such as after zooming out. */
const maxExcessDensity = 2.5;
/** Requests during which a needlessly fine table stays because some view last needed it that fine. */
const sharedFitTicks = 8;
/** Physical pixels a tile window extends beyond the tile, covering its sampling gutter. */
const windowMarginPixels = 4;
/** Worker failures after which an outline stays on the exact path. */
const maxFailures = 3;
/** Most directly drawn pages served per frame, as in a reading view; more would thrash the table pool. */
const maxDirectPages = 8;
/** Outlines per worker batch, so tables start landing quickly after a zoom. */
const maxBatchOutlines = 24;
/** Words per worker batch: about 4 MiB, so the first tables land soon after a zoom. */
const maxBatchWords = 1024 * 1024;
/** Table words uploaded per frame: about 4 MiB, one large table at most. */
const maxUploadWords = 1024 * 1024;
/** Table words uploaded per frame while views move: about 1 MiB, as larger copies delay frames on mobile GPUs. */
const maxMovingUploadWords = 256 * 1024;
