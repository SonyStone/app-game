/**
 * Destructible shapes as sampled distance fields.
 *
 * A field is a grid over a body's local space, y down, in pixels. Each cell stores four channels:
 *
 * 0. `armor`: signed distance to the armor surface, negative inside the material.
 * 1. `pattern`: signed distance to painted lines, negative on a line; drawn only on armor.
 * 2. `core`: signed distance to the core, the weak spot that destroys the body when hit. The core
 *    lies under the armor: a shot reaches it only once holes have cleared the way, and the core
 *    shows only where open space leads to it.
 * 3. `scorch`: soot from hits, 0 (clean) to 1.
 *
 * The CPU copy is authoritative: shots, dents, chipping and colliders all read it, and the renderer
 * uploads it to the GPU after every change. Operations are local to the area they touch.
 */
export type DamageField = {
  readonly cols: number;
  readonly rows: number;
  /** Cell size in pixels. */
  readonly cell: number;
  /** Local position of the center of cell (0, 0). */
  readonly originX: number;
  readonly originY: number;
  /** `cols * rows * CHANNELS` values, row-major, channels interleaved. */
  readonly data: Float32Array;
};

/** Values per cell. */
export const CHANNELS = 4;

/** Distance stored where nothing is near, larger than any shape. */
export const FAR = 1e4;

/**
 * Creates a field covering `bounds` by evaluating `shape` at every cell center.
 *
 * @param shape - Returns the four channels at a local point.
 */
export function createField(
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
  cell: number,
  shape: (x: number, y: number) => readonly [armor: number, pattern: number, core: number, scorch: number]
): DamageField {
  const cols = Math.ceil((bounds.maxX - bounds.minX) / cell);
  const rows = Math.ceil((bounds.maxY - bounds.minY) / cell);
  const originX = bounds.minX + cell / 2;
  const originY = bounds.minY + cell / 2;
  const data = new Float32Array(cols * rows * CHANNELS);

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      data.set(shape(originX + col * cell, originY + row * cell), (row * cols + col) * CHANNELS);
    }
  }

  return { cols, rows, cell, originX, originY, data };
}

/**
 * Samples all channels at a local point with bilinear interpolation. Points outside the grid
 * read as empty: far from armor, pattern and core, unscorched.
 *
 * @param out - Receives the four channels; returned for convenience.
 */
export function sampleField(field: DamageField, x: number, y: number, out: Float32Array = new Float32Array(CHANNELS)) {
  const gx = (x - field.originX) / field.cell;
  const gy = (y - field.originY) / field.cell;

  if (gx < -0.5 || gy < -0.5 || gx > field.cols - 0.5 || gy > field.rows - 0.5) {
    out.set(EMPTY);
    return out;
  }

  const x0 = clampIndex(Math.floor(gx), field.cols);
  const y0 = clampIndex(Math.floor(gy), field.rows);
  const x1 = clampIndex(x0 + 1, field.cols);
  const y1 = clampIndex(y0 + 1, field.rows);
  const tx = Math.min(Math.max(gx - x0, 0), 1);
  const ty = Math.min(Math.max(gy - y0, 0), 1);
  const { data, cols } = field;

  for (let channel = 0; channel < CHANNELS; channel++) {
    const a = data[(y0 * cols + x0) * CHANNELS + channel];
    const b = data[(y0 * cols + x1) * CHANNELS + channel];
    const c = data[(y1 * cols + x0) * CHANNELS + channel];
    const d = data[(y1 * cols + x1) * CHANNELS + channel];
    out[channel] = (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
  }

  return out;
}

const EMPTY = [FAR, FAR, FAR, 0];

/**
 * Marches a ray through the field and reports the first armor or core it meets.
 * Distances in a damaged field are only approximate, so the march takes fixed steps of a
 * quarter cell and refines the crossing by bisection.
 *
 * @param origin - Ray start in local coordinates.
 * @param direction - Unit direction in local coordinates.
 * @param maxDistance - Length of the ray.
 * @returns Distance along the ray and what was hit, or `undefined` for a miss.
 */
export function raycastField(
  field: DamageField,
  origin: { x: number; y: number },
  direction: { x: number; y: number },
  maxDistance: number
): { distance: number; part: 'armor' | 'core' } | undefined {
  const span = clipToGrid(field, origin, direction, maxDistance);

  if (!span) {
    return undefined;
  }

  const sample = new Float32Array(CHANNELS);
  const step = field.cell / 4;
  let previous = span.enter;

  for (let distance = span.enter; distance <= span.exit; distance += step) {
    const part = solidPart(field, origin, direction, distance, sample);

    if (part) {
      let low = previous;
      let high = distance;

      for (let iteration = 0; iteration < 8; iteration++) {
        const middle = (low + high) / 2;

        if (solidPart(field, origin, direction, middle, sample)) {
          high = middle;
        } else {
          low = middle;
        }
      }

      return { distance: high, part: solidPart(field, origin, direction, high, sample) ?? part };
    }

    previous = distance;
  }

  return undefined;
}

function solidPart(
  field: DamageField,
  origin: { x: number; y: number },
  direction: { x: number; y: number },
  distance: number,
  sample: Float32Array
) {
  sampleField(field, origin.x + direction.x * distance, origin.y + direction.y * distance, sample);

  if (sample[2] < 0) {
    return 'core' as const;
  }

  return sample[0] < 0 ? ('armor' as const) : undefined;
}

/** Clips a ray to the grid rectangle; returns the entry and exit distances, or `undefined` if it misses. */
function clipToGrid(
  field: DamageField,
  origin: { x: number; y: number },
  direction: { x: number; y: number },
  maxDistance: number
) {
  const half = field.cell / 2;
  const min = { x: field.originX - half, y: field.originY - half };
  const max = { x: min.x + field.cols * field.cell, y: min.y + field.rows * field.cell };
  let enter = 0;
  let exit = maxDistance;

  for (const axis of ['x', 'y'] as const) {
    if (Math.abs(direction[axis]) < 1e-9) {
      if (origin[axis] < min[axis] || origin[axis] > max[axis]) {
        return undefined;
      }

      continue;
    }

    const a = (min[axis] - origin[axis]) / direction[axis];
    const b = (max[axis] - origin[axis]) / direction[axis];
    enter = Math.max(enter, Math.min(a, b));
    exit = Math.min(exit, Math.max(a, b));
  }

  return enter <= exit ? { enter, exit } : undefined;
}

/**
 * Outward unit normal of the armor surface near a local point, from the field's gradient.
 * Returns `undefined` where the field is flat.
 */
export function surfaceNormal(field: DamageField, point: { x: number; y: number }) {
  const step = field.cell;
  const sample = new Float32Array(CHANNELS);
  const right = sampleField(field, point.x + step, point.y, sample)[0];
  const left = sampleField(field, point.x - step, point.y, sample)[0];
  const down = sampleField(field, point.x, point.y + step, sample)[0];
  const up = sampleField(field, point.x, point.y - step, sample)[0];
  const x = right - left;
  const y = down - up;
  const length = Math.hypot(x, y);

  return length > 1e-6 ? { x: x / length, y: y / length } : undefined;
}

/**
 * Whether the core can be seen from outside: open space connects the edge of the grid to a
 * cell next to the core. An intact hull hides its core in a closed pocket.
 */
export function isCoreExposed(field: DamageField) {
  const { cols, rows, data } = field;
  const open = (cell: number) => data[cell * CHANNELS] >= 0 && data[cell * CHANNELS + 2] >= 0;
  const visited = new Uint8Array(cols * rows);
  const stack: number[] = [];

  for (let col = 0; col < cols; col++) {
    stack.push(col, (rows - 1) * cols + col);
  }

  for (let row = 0; row < rows; row++) {
    stack.push(row * cols, row * cols + cols - 1);
  }

  while (stack.length > 0) {
    const cell = stack.pop()!;

    if (visited[cell] || !open(cell)) {
      continue;
    }

    visited[cell] = 1;
    const col = cell % cols;
    const neighbors = [col > 0 ? cell - 1 : -1, col < cols - 1 ? cell + 1 : -1, cell - cols, cell + cols];

    for (const neighbor of neighbors) {
      if (neighbor < 0 || neighbor >= cols * rows) {
        continue;
      }

      if (data[neighbor * CHANNELS + 2] < 0) {
        return true;
      }

      if (!visited[neighbor]) {
        stack.push(neighbor);
      }
    }
  }

  return false;
}

/**
 * Cuts a ragged hole out of the armor and soots its rim. The radius wobbles with angle, so no
 * two holes look alike.
 *
 * @param roughness - Radius variation as a fraction of `radius`.
 * @param seed - Varies the outline of the hole.
 */
export function carve(field: DamageField, center: { x: number; y: number }, radius: number, roughness: number, seed: number) {
  const phases = [seed * 12.9898, seed * 78.233, seed * 37.719].map((value) => fract(Math.sin(value) * 43758.5453) * 6.283);
  const reach = radius * (1 + roughness) + SCORCH_REACH + field.cell;

  forCellsNear(field, center, reach, (index, x, y) => {
    const dx = x - center.x;
    const dy = y - center.y;
    const angle = Math.atan2(dy, dx);
    const wobble = (Math.sin(angle * 3 + phases[0]) + Math.sin(angle * 5 + phases[1]) * 0.6 + Math.sin(angle * 9 + phases[2]) * 0.3) / 1.9;
    const hole = Math.hypot(dx, dy) - radius * (1 + roughness * wobble);
    const data = field.data;
    data[index] = Math.max(data[index], -hole);
    data[index + 3] = Math.max(data[index + 3], Math.min(Math.max(1 - hole / SCORCH_REACH, 0), 1));
  });
}

/** Soots the armor around `center` without removing any, as a glancing hit does. */
export function scorch(field: DamageField, center: { x: number; y: number }, radius: number) {
  forCellsNear(field, center, radius, (index, x, y) => {
    const amount = 1 - Math.hypot(x - center.x, y - center.y) / radius;
    field.data[index + 3] = Math.max(field.data[index + 3], Math.min(Math.max(amount, 0), 1) * 0.8);
  });
}

/** How far soot spreads from the rim of a hole, in pixels. */
const SCORCH_REACH = 3;

/**
 * Dents the field: material around `center` moves by up to `depth` pixels along `direction`,
 * fading to nothing at `radius`. Every channel moves together, so painted lines, soot and the
 * core bend with the armor. Pushing into a surface caves it in.
 *
 * @param direction - Unit push direction in local coordinates.
 */
export function dent(
  field: DamageField,
  center: { x: number; y: number },
  direction: { x: number; y: number },
  depth: number,
  radius: number
) {
  const source: DamageField = { ...field, data: field.data.slice() };
  const sample = new Float32Array(CHANNELS);

  forCellsNear(field, center, radius, (index, x, y) => {
    const falloff = Math.max(1 - ((x - center.x) ** 2 + (y - center.y) ** 2) / (radius * radius), 0) ** 2;

    if (falloff === 0) {
      return;
    }

    sampleField(source, x - direction.x * depth * falloff, y - direction.y * depth * falloff, sample);
    field.data.set(sample, index);
  });
}

/** A piece of armor cut from a field, with its own field in the parent's coordinates. */
export type Fragment = {
  field: DamageField;
  /** Material cells in the piece. */
  cells: number;
  /** Center of the piece in the parent's local coordinates. */
  centerX: number;
  centerY: number;
};

/**
 * Splits off armor that no longer connects to the main body and removes it from `field`.
 * Pieces of at least `minCells` cells are returned as fragments; smaller crumbs are only removed.
 *
 * @param anchored - Cells that hold whatever touches them in place, such as cells shared with a
 *   neighboring piece of the same wall. Every piece touching one stays and the rest come off;
 *   without anchored cells, or when no piece touches one, the main body is the largest piece.
 */
export function detachLoosePieces(field: DamageField, minCells: number, anchored?: (cell: number) => boolean) {
  const labels = labelArmor(field);
  const sizes = countLabels(labels);
  const held = new Set<number>();

  if (anchored) {
    labels.forEach((label, cell) => {
      if (label > 0 && !held.has(label) && anchored(cell)) {
        held.add(label);
      }
    });
  }

  if (held.size === 0) {
    // Label 0 counts the empty cells, so it never competes for the main body.
    let main = 0;
    let mainSize = 0;

    sizes.forEach((size, label) => {
      if (label > 0 && size > mainSize) {
        main = label;
        mainSize = size;
      }
    });

    held.add(main);
  }

  return removeLabels(field, labels, sizes, (label) => !held.has(label), minCells);
}

/**
 * Breaks all armor into roughly `pieces` chunks around random seeds, for a body that blows up.
 * Removes every chunk from `field` and returns those of at least `minCells` cells.
 *
 * @param random - Source of seed positions in [0, 1).
 */
export function shatter(field: DamageField, pieces: number, minCells: number, random = Math.random) {
  const seeds = Array.from({ length: pieces }, () => ({
    x: field.originX + random() * (field.cols - 1) * field.cell,
    y: field.originY + random() * (field.rows - 1) * field.cell
  }));
  const labels = new Int32Array(field.cols * field.rows);

  for (let row = 0; row < field.rows; row++) {
    for (let col = 0; col < field.cols; col++) {
      const cell = row * field.cols + col;

      if (field.data[cell * CHANNELS] >= 0) {
        continue;
      }

      const x = field.originX + col * field.cell;
      const y = field.originY + row * field.cell;
      let nearest = 0;

      seeds.forEach((seed, index) => {
        if ((seed.x - x) ** 2 + (seed.y - y) ** 2 < (seeds[nearest].x - x) ** 2 + (seeds[nearest].y - y) ** 2) {
          nearest = index;
        }
      });

      labels[cell] = nearest + 1;
    }
  }

  return removeLabels(field, labels, countLabels(labels), () => true, minCells);
}

/** Labels 4-connected armor cells; 0 marks empty cells. */
function labelArmor(field: DamageField) {
  const { cols, rows, data } = field;
  const labels = new Int32Array(cols * rows);
  const stack: number[] = [];
  let next = 0;

  for (let start = 0; start < cols * rows; start++) {
    if (labels[start] !== 0 || data[start * CHANNELS] >= 0) {
      continue;
    }

    next++;
    labels[start] = next;
    stack.push(start);

    while (stack.length > 0) {
      const cell = stack.pop()!;
      const col = cell % cols;
      const neighbors = [col > 0 ? cell - 1 : -1, col < cols - 1 ? cell + 1 : -1, cell - cols, cell + cols];

      for (const neighbor of neighbors) {
        if (neighbor < 0 || neighbor >= cols * rows || labels[neighbor] !== 0 || data[neighbor * CHANNELS] >= 0) {
          continue;
        }

        labels[neighbor] = next;
        stack.push(neighbor);
      }
    }
  }

  return labels;
}

function countLabels(labels: Int32Array) {
  const sizes: number[] = [];
  labels.forEach((label) => {
    sizes[label] = (sizes[label] ?? 0) + 1;
  });

  return sizes;
}

/** Cuts every label accepted by `remove` out of `field`, returning the large ones as fragments. */
function removeLabels(
  field: DamageField,
  labels: Int32Array,
  sizes: number[],
  remove: (label: number) => boolean,
  minCells: number
) {
  const fragments: Fragment[] = [];

  sizes.forEach((size, label) => {
    if (label === 0 || !remove(label)) {
      return;
    }

    if (size >= minCells) {
      fragments.push(copyLabel(field, labels, label, size));
    }
  });

  const cleared = field.cell * 0.75;

  labels.forEach((label, cell) => {
    if (label !== 0 && remove(label)) {
      field.data[cell * CHANNELS] = cleared;
    }
  });

  return fragments;
}

/** Copies one labeled piece into its own field with a margin of empty cells around it. */
function copyLabel(field: DamageField, labels: Int32Array, label: number, size: number): Fragment {
  let minCol = field.cols;
  let minRow = field.rows;
  let maxCol = 0;
  let maxRow = 0;
  let sumX = 0;
  let sumY = 0;

  labels.forEach((value, cell) => {
    if (value !== label) {
      return;
    }

    const col = cell % field.cols;
    const row = Math.floor(cell / field.cols);
    minCol = Math.min(minCol, col);
    maxCol = Math.max(maxCol, col);
    minRow = Math.min(minRow, row);
    maxRow = Math.max(maxRow, row);
    sumX += field.originX + col * field.cell;
    sumY += field.originY + row * field.cell;
  });

  const margin = FRAGMENT_MARGIN;
  const cols = maxCol - minCol + 1 + margin * 2;
  const rows = maxRow - minRow + 1 + margin * 2;
  const data = new Float32Array(cols * rows * CHANNELS);
  const outside = field.cell * 0.75;

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const sourceCol = minCol - margin + col;
      const sourceRow = minRow - margin + row;
      const target = (row * cols + col) * CHANNELS;
      const inside = sourceCol >= 0 && sourceRow >= 0 && sourceCol < field.cols && sourceRow < field.rows;
      const sourceCell = sourceRow * field.cols + sourceCol;

      if (!inside) {
        data.set(EMPTY, target);
        continue;
      }

      data.set(field.data.subarray(sourceCell * CHANNELS, sourceCell * CHANNELS + CHANNELS), target);

      if (labels[sourceCell] !== label) {
        data[target] = Math.max(data[target], outside);
      }

      // A fragment never carries the core: the body it came from keeps or loses it as a whole.
      data[target + 2] = FAR;
    }
  }

  return {
    field: {
      cols,
      rows,
      cell: field.cell,
      originX: field.originX + (minCol - margin) * field.cell,
      originY: field.originY + (minRow - margin) * field.cell,
      data
    },
    cells: size,
    centerX: sumX / size,
    centerY: sumY / size
  };
}

const FRAGMENT_MARGIN = 2;

/**
 * Approximates the solid part of a field, armor and core, with axis-aligned boxes for the
 * physics engine. Cells are grouped into square blocks of `blockCells` cells, a block counts as
 * solid when at least half its cells are, and solid blocks merge into rectangles row by row.
 *
 * @returns Box centers and half sizes in local coordinates, plus the solid area in square pixels.
 */
export function solidBoxes(field: DamageField, blockCells: number) {
  const blockCols = Math.ceil(field.cols / blockCells);
  const blockRows = Math.ceil(field.rows / blockCells);
  const solid = new Uint8Array(blockCols * blockRows);
  let solidCells = 0;

  for (let row = 0; row < field.rows; row++) {
    for (let col = 0; col < field.cols; col++) {
      const index = (row * field.cols + col) * CHANNELS;

      if (field.data[index] < 0 || field.data[index + 2] < 0) {
        solid[Math.floor(row / blockCells) * blockCols + Math.floor(col / blockCells)]++;
        solidCells++;
      }
    }
  }

  const threshold = (blockCells * blockCells) / 2;
  const runs: { col: number; row: number; width: number; height: number }[] = [];
  let open: typeof runs = [];

  for (let row = 0; row < blockRows; row++) {
    const current: typeof runs = [];

    for (let col = 0; col < blockCols; col++) {
      if (solid[row * blockCols + col] < threshold) {
        continue;
      }

      const last = current.at(-1);

      if (last && last.col + last.width === col) {
        last.width++;
      } else {
        current.push({ col, row, width: 1, height: 1 });
      }
    }

    const next: typeof runs = [];

    for (const run of current) {
      const above = open.find((candidate) => candidate.col === run.col && candidate.width === run.width);

      if (above) {
        above.height++;
        next.push(above);
      } else {
        runs.push(run);
        next.push(run);
      }
    }

    open = next;
  }

  const block = blockCells * field.cell;
  const left = field.originX - field.cell / 2;
  const top = field.originY - field.cell / 2;

  return {
    boxes: runs.map((run) => ({
      x: left + (run.col + run.width / 2) * block,
      y: top + (run.row + run.height / 2) * block,
      halfWidth: (run.width * block) / 2,
      halfHeight: (run.height * block) / 2
    })),
    area: solidCells * field.cell * field.cell
  };
}

function forCellsNear(
  field: DamageField,
  center: { x: number; y: number },
  reach: number,
  visit: (index: number, x: number, y: number) => void
) {
  const minCol = Math.max(Math.floor((center.x - reach - field.originX) / field.cell), 0);
  const maxCol = Math.min(Math.ceil((center.x + reach - field.originX) / field.cell), field.cols - 1);
  const minRow = Math.max(Math.floor((center.y - reach - field.originY) / field.cell), 0);
  const maxRow = Math.min(Math.ceil((center.y + reach - field.originY) / field.cell), field.rows - 1);

  for (let row = minRow; row <= maxRow; row++) {
    for (let col = minCol; col <= maxCol; col++) {
      visit((row * field.cols + col) * CHANNELS, field.originX + col * field.cell, field.originY + row * field.cell);
    }
  }
}

function clampIndex(index: number, count: number) {
  return Math.min(Math.max(index, 0), count - 1);
}

function fract(value: number) {
  return value - Math.floor(value);
}
