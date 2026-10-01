/**
 * Rasterizes one outline over the whole unit square into `size`×`size` cells and writes its prefix-area table into
 * `areas` at `base`: `(size + 1)²` floats in rows of `size + 1`, whose first row and column must already be zero.
 * Cell coverage is the 2D context's anti-aliased alpha, so the table stays accurate only where a pixel spans several
 * cells; the source cubics remain authoritative when magnified further. Resizes and clears `context`'s canvas.
 */
export function writeOutlineTable(
  context: OffscreenCanvasRenderingContext2D,
  curves: Float32Array,
  outline: { first: number; count: number; rule: number },
  size: number,
  areas: Float32Array,
  base: number
) {
  const stride = size + 1;
  const coverage = rasterizeOutline(context, curves, outline, { columns: size, rows: size });

  for (let y = 1; y <= size; y++) {
    let row = 0;

    for (let x = 1; x <= size; x++) {
      row += coverage[(y - 1) * size + x - 1]!;
      areas[base + y * stride + x] = row + areas[base + (y - 1) * stride + x]!;
    }
  }
}

/**
 * Rasterizes one outline over a square `window` of its unit box into a compact row table of `grid.columns` by
 * `grid.rows` cells, so an outline magnified unevenly along its axes gets cells of a similar on-screen size: for each
 * row, the running coverage after each of its cells, in units of 1/{@link rowTableUnits}(`columns`) cell, as 16-bit
 * values packed two per 32-bit word (the even cell in the low half). `columns` must be even. Coverage averages 4×4
 * canvas samples per cell in tables up to {@link fineSampledCells} cells across and 2×2 in larger ones, keeping
 * features much thinner than a cell, such as hairline frames, within a few percent; a 2D context's anti-aliasing
 * misjudges features thinner than about 0.7 of its pixels. Resizes and clears `context`'s canvas.
 */
export function rasterizeRowTable(
  context: OffscreenCanvasRenderingContext2D,
  curves: Float32Array,
  outline: { first: number; count: number; rule: number },
  grid: { columns: number; rows: number },
  window: { x: number; y: number; extent: number }
) {
  const supersample = Math.max(grid.columns, grid.rows) <= fineSampledCells ? 4 : 2;
  return encodeRowTable(rasterizeOutline(context, curves, outline, grid, supersample, window), grid);
}

/** Packs per-cell coverage (`columns`×`rows` values in [0, 1], row-major) into the row table of {@link rasterizeRowTable}. */
export function encodeRowTable(coverage: Float32Array, { columns, rows }: { columns: number; rows: number }) {
  const units = rowTableUnits(columns);
  const words = new Uint32Array((columns * rows) / 2);

  for (let y = 0; y < rows; y++) {
    let running = 0;

    for (let x = 0; x < columns; x++) {
      const index = y * columns + x;
      running += coverage[index]!;
      // Rounding the running sum, not each cell, keeps every row monotonic and its total exact to half a unit.
      words[index >> 1]! |= Math.min(0xffff, Math.round(running * units)) << ((index & 1) * 16);
    }
  }

  return words;
}

/** Units per fully covered cell in a row table of `columns` cells per row, the largest that keeps a full row within 16 bits. */
export function rowTableUnits(columns: number) {
  return Math.floor(0xffff / columns);
}

/**
 * Per-cell coverage of one outline over a square `window` of its unit box (default the whole box) divided into
 * `columns`×`rows` cells: the 2D context's anti-aliased alpha averaged over `supersample`² canvas pixels per cell.
 */
function rasterizeOutline(
  context: OffscreenCanvasRenderingContext2D,
  curves: Float32Array,
  outline: { first: number; count: number; rule: number },
  { columns, rows }: { columns: number; rows: number },
  supersample = 1,
  window = { x: 0, y: 0, extent: 1 }
) {
  const width = columns * supersample;
  const height = rows * supersample;
  context.canvas.width = width;
  context.canvas.height = height;
  const canvasX = (x: number) => ((x - window.x) / window.extent) * width;
  const canvasY = (y: number) => ((y - window.y) / window.extent) * height;
  context.fillStyle = 'white';
  const path = new Path2D();
  let endX = NaN;
  let endY = NaN;

  for (let curve = outline.first; curve < outline.first + outline.count; curve++) {
    const offset = curve * 8;
    const x = curves[offset]!;
    const y = curves[offset + 1]!;

    if (x !== endX || y !== endY) {
      path.closePath();
      path.moveTo(canvasX(x), canvasY(y));
    }

    path.bezierCurveTo(
      canvasX(curves[offset + 2]!),
      canvasY(curves[offset + 3]!),
      canvasX(curves[offset + 4]!),
      canvasY(curves[offset + 5]!),
      canvasX(curves[offset + 6]!),
      canvasY(curves[offset + 7]!)
    );
    endX = curves[offset + 6]!;
    endY = curves[offset + 7]!;
  }

  path.closePath();
  context.clearRect(0, 0, width, height);
  context.fill(path, outline.rule === 1 ? 'evenodd' : 'nonzero');
  const pixels = context.getImageData(0, 0, width, height).data;
  const weight = 1 / (255 * supersample * supersample);
  const coverage = new Float32Array(columns * rows);

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < columns; x++) {
      let alpha = 0;

      for (let sy = y * supersample; sy < (y + 1) * supersample; sy++) {
        for (let sx = x * supersample; sx < (x + 1) * supersample; sx++) {
          alpha += pixels[(sy * width + sx) * 4 + 3]!;
        }
      }

      coverage[y * columns + x] = alpha * weight;
    }
  }

  return coverage;
}

/** Largest row table side sampled 4×4 per cell; larger tables, for big outlines, keep the cheaper 2×2. */
const fineSampledCells = 256;
