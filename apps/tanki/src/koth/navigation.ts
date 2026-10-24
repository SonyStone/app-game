import type { CombatLayout } from '../damage/combat';

type Point = { x: number; y: number };

/**
 * Where a tank can drive, as a grid over the battlefield built from its static obstacles: the
 * border walls, the walls and campfire stones. Each cell stores the distance from its center to
 * the nearest obstacle; a tank's center may stand in cells at least `clearance` away, so paths
 * through open cells keep the whole hull off the walls. Moving bodies such as tanks and crates
 * are not part of the grid: callers add them as path costs and steer around them. When walls are
 * shot apart, `updateNavGrid` follows them where they changed.
 */
export type NavGrid = {
  /** Cell size in pixels. */
  readonly cell: number;
  readonly cols: number;
  readonly rows: number;
  /** World position of the center of cell (0, 0). */
  readonly originX: number;
  readonly originY: number;
  /** Distance from a tank's center to obstacles that the hull needs, in pixels. */
  readonly clearance: number;
  /**
   * Distance from each cell center to the nearest obstacle in pixels, negative inside one. Cells
   * that `updateNavGrid` recomputed may hold less than the true distance where it is large.
   */
  readonly distance: Float32Array;
  /** Counts the updates that opened or closed a cell, so paths planned before can be planned again. */
  revision: number;
};

/**
 * Builds the grid for `layout`.
 *
 * @param options.cell - Cell size in pixels; defaults to 20.
 * @param options.clearance - Distance a tank's center keeps from obstacles; defaults to 24, about
 *   half a hull's diagonal, since the hull swings around its tow point.
 */
export function createNavGrid(layout: CombatLayout, options: { cell?: number; clearance?: number } = {}): NavGrid {
  const cell = options.cell ?? 20;
  const cols = Math.ceil((layout.halfWidth * 2) / cell);
  const rows = Math.ceil((layout.halfHeight * 2) / cell);
  const originX = -layout.halfWidth + cell / 2;
  const originY = -layout.halfHeight + cell / 2;
  const distance = new Float32Array(cols * rows);

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x = originX + col * cell;
      const y = originY + row * cell;
      let nearest = Math.min(layout.halfWidth - Math.abs(x), layout.halfHeight - Math.abs(y));

      for (const wall of layout.walls ?? []) {
        nearest = Math.min(nearest, boxDistance({ x, y }, wall));
      }

      for (const campfire of layout.campfires ?? []) {
        nearest = Math.min(nearest, Math.hypot(x - campfire.x, y - campfire.y) - CAMPFIRE_RADIUS);
      }

      distance[row * cols + col] = nearest;
    }
  }

  return { cell, cols, rows, originX, originY, clearance: options.clearance ?? 24, distance, revision: 0 };
}

/**
 * Recomputes the cells whose centers lie within `bounds` from `distanceAt`, after obstacles there
 * changed, such as a wall shot apart or a wreck left. Bumps the grid's `revision` when a cell
 * opened or closed.
 *
 * Cells outside `bounds` keep their distances, which an obstacle that appeared within `changed`
 * may make too large; they are capped at their distance to `changed`, so traces that step by the
 * distance never skip over the new obstacle. Make `bounds` reach far enough around `changed`
 * that the cap stays above the clearance.
 *
 * @param distanceAt - Distance from a point to the nearest obstacle as they stand now; it may cap
 *   large distances, as long as the cap exceeds the clearance with room to spare.
 * @param changed - Where obstacles changed, inside `bounds`; without it, nothing outside `bounds` changes.
 * @returns How many cells opened or closed.
 */
export function updateNavGrid(
  grid: NavGrid,
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
  distanceAt: (point: Point) => number,
  changed?: { minX: number; minY: number; maxX: number; maxY: number }
) {
  const minCol = Math.max(Math.ceil((bounds.minX - grid.originX) / grid.cell), 0);
  const maxCol = Math.min(Math.floor((bounds.maxX - grid.originX) / grid.cell), grid.cols - 1);
  const minRow = Math.max(Math.ceil((bounds.minY - grid.originY) / grid.cell), 0);
  const maxRow = Math.min(Math.floor((bounds.maxY - grid.originY) / grid.cell), grid.rows - 1);
  let flipped = 0;

  for (let row = minRow; row <= maxRow; row++) {
    for (let col = minCol; col <= maxCol; col++) {
      const cell = row * grid.cols + col;
      const open = isOpenCell(grid, cell);
      grid.distance[cell] = distanceAt(cellCenter(grid, cell));

      if (open !== isOpenCell(grid, cell)) {
        flipped++;
      }
    }
  }

  if (changed) {
    for (let cell = 0; cell < grid.distance.length; cell++) {
      const col = cell % grid.cols;
      const row = Math.floor(cell / grid.cols);

      if (col < minCol || col > maxCol || row < minRow || row > maxRow) {
        const center = cellCenter(grid, cell);
        const gap = Math.hypot(Math.max(changed.minX - center.x, 0, center.x - changed.maxX), Math.max(changed.minY - center.y, 0, center.y - changed.maxY));
        grid.distance[cell] = Math.min(grid.distance[cell], gap);
      }
    }
  }

  if (flipped > 0) {
    grid.revision++;
  }

  return flipped;
}

/**
 * Finds a short drivable path from `from` to `to` with A* over the grid's 8-connected open cells,
 * then straightens it. A start inside an obstacle's margin, as after a tank was shoved against a
 * wall, begins from the nearest open cell; a goal there ends at the nearest open cell within
 * three cells.
 *
 * @param options.cost - Extra cost of entering a cell, 0 or more, as a multiple of the step length:
 *   2 makes a cell three times as expensive to cross. Use it for danger and movable obstacles.
 * @returns Points from `from` to the goal, or `undefined` when the goal cannot be reached.
 */
export function findPath(
  grid: NavGrid,
  from: Point,
  to: Point,
  options: { cost?: (cell: number) => number } = {}
): Point[] | undefined {
  const start = nearestOpen(grid, from, grid.cols + grid.rows);
  const goal = nearestOpen(grid, to, 3);

  if (start === undefined || goal === undefined) {
    return undefined;
  }

  const cells = searchPath(grid, start, goal, options.cost);

  if (!cells) {
    return undefined;
  }

  const end = isOpenAt(grid, to) ? to : cellCenter(grid, goal);
  const points = [from, ...cells.slice(1, -1).map((cell) => cellCenter(grid, cell)), end];

  return smoothPath(grid, points, options.cost);
}

/**
 * Straightens a path by string pulling: from each kept point it skips ahead along the path for as
 * long as it can still drive straight to the next point.
 *
 * @param cost - Extra cell costs the path was found with; a shortcut must not cost more than the
 *   stretch of path it replaces, so straightening keeps a detour around danger.
 */
export function smoothPath(grid: NavGrid, path: readonly Point[], cost?: (cell: number) => number) {
  if (path.length <= 2) {
    return [...path];
  }

  const along = [0];

  for (let index = 1; index < path.length; index++) {
    along.push(along[index - 1] + (cost ? costAlong(grid, path[index - 1], path[index], cost) : 0));
  }

  const result = [path[0]];
  let anchor = 0;

  while (anchor < path.length - 1) {
    let next = anchor + 1;

    while (next + 1 < path.length) {
      const candidate = next + 1;

      if (!canDrive(grid, path[anchor], path[candidate])) {
        break;
      }

      if (cost && costAlong(grid, path[anchor], path[candidate], cost) > along[candidate] - along[anchor] + 1e-3) {
        break;
      }

      next = candidate;
    }

    result.push(path[next]);
    anchor = next;
  }

  return result;
}

/** Whether a tank can drive straight from `a` to `b` without its hull touching an obstacle. */
export function canDrive(grid: NavGrid, a: Point, b: Point) {
  return segmentKeeps(grid, a, b, grid.clearance);
}

/** Whether a straight line from `a` to `b` passes no static obstacle, so walls do not block a shot along it. */
export function sightClear(grid: NavGrid, a: Point, b: Point) {
  return traceClear(grid, grid.distance, a, b);
}

/**
 * Whether a straight line from `a` to `b` stays out of the obstacles of a distance field on the
 * grid's cells, such as `grid.distance` or one that adds moving bodies. It steps by the distance
 * to the nearest obstacle, so open ground costs only a few samples.
 */
export function traceClear(grid: NavGrid, field: Float32Array, a: Point, b: Point) {
  const length = Math.hypot(b.x - a.x, b.y - a.y);

  if (length < 1e-6) {
    return true;
  }

  const dx = (b.x - a.x) / length;
  const dy = (b.y - a.y) / length;
  let travelled = 0;

  while (travelled < length) {
    const distance = sampleDistance(grid, field, { x: a.x + dx * travelled, y: a.y + dy * travelled });

    if (distance < 0) {
      return false;
    }

    travelled += Math.max(distance * 0.9, MIN_TRACE_STEP);
  }

  return sampleDistance(grid, field, b) >= 0;
}

/**
 * How far the view from `from` reaches in each of `rays` directions before an obstacle of a
 * distance field on the grid's cells blocks it, up to `range`: the outline of what can be seen
 * from there. Direction `index` points at angle `index / rays * 2π`. The first few pixels are
 * skipped, so a viewer pressed against a wall still sees past it.
 */
export function sightReach(grid: NavGrid, field: Float32Array, from: Point, range: number, rays: number) {
  const reach = new Float32Array(rays);

  for (let index = 0; index < rays; index++) {
    const angle = (index / rays) * Math.PI * 2;
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    let travelled = VIEWER_RADIUS;

    while (travelled < range) {
      const distance = sampleDistance(grid, field, { x: from.x + dx * travelled, y: from.y + dy * travelled });

      if (distance < 0) {
        break;
      }

      travelled += Math.max(distance * 0.9, MIN_TRACE_STEP);
    }

    reach[index] = Math.min(travelled, range);
  }

  return reach;
}

/**
 * Driving costs from `from` to every cell, as Dijkstra's search over open cells: `Infinity` for
 * cells that cannot be reached. Reading it is a cheap estimate of the way to any place.
 *
 * @param options.cost - Extra cost of entering a cell, as for `findPath`.
 */
export function floodCosts(grid: NavGrid, from: Point, options: { cost?: (cell: number) => number } = {}) {
  const costs = new Float32Array(grid.cols * grid.rows).fill(Infinity);
  const start = nearestOpen(grid, from, 4);

  if (start === undefined) {
    return costs;
  }

  const heap = createHeap();
  costs[start] = 0;
  heap.push(start, 0);

  while (heap.size > 0) {
    const cell = heap.pop();
    const cost = costs[cell];

    forNeighbors(grid, cell, (neighbor, length) => {
      const next = cost + length * (1 + (options.cost?.(neighbor) ?? 0));

      if (next < costs[neighbor]) {
        costs[neighbor] = next;
        heap.push(neighbor, next);
      }
    });
  }

  return costs;
}

/** Distance from `point` to the nearest static obstacle, interpolated between cell centers. */
export function obstacleDistance(grid: NavGrid, point: Point) {
  return sampleDistance(grid, grid.distance, point);
}

/** Samples a distance field on the grid's cells at `point`, interpolating between cell centers. */
export function sampleDistance(grid: NavGrid, field: Float32Array, point: Point) {
  const gx = Math.min(Math.max((point.x - grid.originX) / grid.cell, 0), grid.cols - 1);
  const gy = Math.min(Math.max((point.y - grid.originY) / grid.cell, 0), grid.rows - 1);
  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  const x1 = Math.min(x0 + 1, grid.cols - 1);
  const y1 = Math.min(y0 + 1, grid.rows - 1);
  const tx = gx - x0;
  const ty = gy - y0;
  const { cols } = grid;
  const top = field[y0 * cols + x0] * (1 - tx) + field[y0 * cols + x1] * tx;
  const bottom = field[y1 * cols + x0] * (1 - tx) + field[y1 * cols + x1] * tx;

  return top * (1 - ty) + bottom * ty;
}

/** Whether a tank's center may stand at `point`. */
export function isOpenAt(grid: NavGrid, point: Point) {
  return obstacleDistance(grid, point) >= grid.clearance;
}

/** Index of the cell containing `point`, clamped to the grid. */
export function cellAt(grid: NavGrid, point: Point) {
  const col = Math.min(Math.max(Math.round((point.x - grid.originX) / grid.cell), 0), grid.cols - 1);
  const row = Math.min(Math.max(Math.round((point.y - grid.originY) / grid.cell), 0), grid.rows - 1);
  return row * grid.cols + col;
}

/** World position of a cell's center. */
export function cellCenter(grid: NavGrid, cell: number) {
  return { x: grid.originX + (cell % grid.cols) * grid.cell, y: grid.originY + Math.floor(cell / grid.cols) * grid.cell };
}

/** Whether a tank's center may stand in `cell`. */
export function isOpenCell(grid: NavGrid, cell: number) {
  return grid.distance[cell] >= grid.clearance;
}

/**
 * The open cell nearest to `point` within `radius` cells, searching rings outward; `undefined`
 * when there is none.
 */
export function nearestOpen(grid: NavGrid, point: Point, radius: number) {
  const center = cellAt(grid, point);

  if (isOpenCell(grid, center)) {
    return center;
  }

  const col = center % grid.cols;
  const row = Math.floor(center / grid.cols);
  let best: number | undefined;
  let bestDistance = Infinity;

  for (let ring = 1; ring <= radius; ring++) {
    for (let dy = -ring; dy <= ring; dy++) {
      for (let dx = -ring; dx <= ring; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) {
          continue;
        }

        const x = col + dx;
        const y = row + dy;

        if (x < 0 || y < 0 || x >= grid.cols || y >= grid.rows) {
          continue;
        }

        const cell = y * grid.cols + x;
        const center = cellCenter(grid, cell);
        const distance = Math.hypot(center.x - point.x, center.y - point.y);

        if (isOpenCell(grid, cell) && distance < bestDistance) {
          best = cell;
          bestDistance = distance;
        }
      }
    }

    if (best !== undefined) {
      return best;
    }
  }

  return undefined;
}

/**
 * Visits open cells in order of driving cost from `from`, as Dijkstra's search, until `accept`
 * returns true for one or the cost passes `maxCost` pixels. Use it to find the nearest cell with
 * some property, such as the nearest spot out of the enemy's sight.
 *
 * @param options.cost - Extra cost of entering a cell, as for `findPath`.
 * @returns The accepted cell, or `undefined`.
 */
export function searchNearest(
  grid: NavGrid,
  from: Point,
  maxCost: number,
  accept: (cell: number, cost: number) => boolean,
  options: { cost?: (cell: number) => number } = {}
) {
  const start = nearestOpen(grid, from, 4);

  if (start === undefined) {
    return undefined;
  }

  const costs = new Float32Array(grid.cols * grid.rows).fill(Infinity);
  const heap = createHeap();
  costs[start] = 0;
  heap.push(start, 0);

  while (heap.size > 0) {
    const cell = heap.pop();
    const cost = costs[cell];

    if (cost > maxCost) {
      return undefined;
    }

    if (accept(cell, cost)) {
      return cell;
    }

    forNeighbors(grid, cell, (neighbor, length) => {
      const next = cost + length * (1 + (options.cost?.(neighbor) ?? 0));

      if (next < costs[neighbor]) {
        costs[neighbor] = next;
        heap.push(neighbor, next);
      }
    });
  }

  return undefined;
}

/** Length of a path in pixels. */
export function pathLength(path: readonly Point[]) {
  let length = 0;

  for (let index = 1; index < path.length; index++) {
    length += Math.hypot(path[index].x - path[index - 1].x, path[index].y - path[index - 1].y);
  }

  return length;
}

const CAMPFIRE_RADIUS = 13;
/** Shortest step of a sight trace in pixels, so it crosses thin gaps between obstacles in finite time. */
const MIN_TRACE_STEP = 3;
/** Pixels around a viewer that `sightReach` skips: its own hull. */
const VIEWER_RADIUS = 12;
const SQRT2 = Math.SQRT2;
/** Cells closer to walls than this many pixels beyond the clearance cost a little more, so paths keep off walls when they can. */
const WALL_MARGIN = 16;
const WALL_PENALTY = 0.6;

/** A* over cell indices from `start` to `goal`, with the octile distance as its estimate. */
function searchPath(grid: NavGrid, start: number, goal: number, cost: ((cell: number) => number) | undefined) {
  const count = grid.cols * grid.rows;
  const costs = new Float32Array(count).fill(Infinity);
  const parents = new Int32Array(count).fill(-1);
  const closed = new Uint8Array(count);
  const heap = createHeap();
  const goalCol = goal % grid.cols;
  const goalRow = Math.floor(goal / grid.cols);
  const estimate = (cell: number) => {
    const dx = Math.abs((cell % grid.cols) - goalCol);
    const dy = Math.abs(Math.floor(cell / grid.cols) - goalRow);
    return (Math.max(dx, dy) + (SQRT2 - 1) * Math.min(dx, dy)) * grid.cell;
  };

  costs[start] = 0;
  heap.push(start, estimate(start));

  while (heap.size > 0) {
    const cell = heap.pop();

    if (closed[cell]) {
      continue;
    }

    if (cell === goal) {
      const cells = [cell];

      while (parents[cells[0]] >= 0) {
        cells.unshift(parents[cells[0]]);
      }

      return cells;
    }

    closed[cell] = 1;

    forNeighbors(grid, cell, (neighbor, length) => {
      if (closed[neighbor]) {
        return;
      }

      const margin = grid.distance[neighbor] - grid.clearance;
      const penalty = margin < WALL_MARGIN ? WALL_PENALTY * (1 - margin / WALL_MARGIN) : 0;
      const next = costs[cell] + length * (1 + penalty + (cost?.(neighbor) ?? 0));

      if (next < costs[neighbor]) {
        costs[neighbor] = next;
        parents[neighbor] = cell;
        heap.push(neighbor, next + estimate(neighbor));
      }
    });
  }

  return undefined;
}

/** Calls `visit` with each open neighbor of `cell` and the step length; diagonals may not cut a blocked corner. */
function forNeighbors(grid: NavGrid, cell: number, visit: (neighbor: number, length: number) => void) {
  const col = cell % grid.cols;
  const row = Math.floor(cell / grid.cols);

  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) {
        continue;
      }

      const x = col + dx;
      const y = row + dy;

      if (x < 0 || y < 0 || x >= grid.cols || y >= grid.rows) {
        continue;
      }

      const neighbor = y * grid.cols + x;

      if (!isOpenCell(grid, neighbor)) {
        continue;
      }

      if (dx !== 0 && dy !== 0 && (!isOpenCell(grid, row * grid.cols + x) || !isOpenCell(grid, y * grid.cols + col))) {
        continue;
      }

      visit(neighbor, dx !== 0 && dy !== 0 ? grid.cell * SQRT2 : grid.cell);
    }
  }
}

/** Cost of driving a segment: its length weighted by one plus the extra cost of the cells it crosses, sampled every half cell. */
function costAlong(grid: NavGrid, a: Point, b: Point, cost: (cell: number) => number) {
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  const steps = Math.max(Math.ceil(length / (grid.cell / 2)), 1);
  let total = 0;

  for (let step = 0; step < steps; step++) {
    const t = (step + 0.5) / steps;
    total += 1 + cost(cellAt(grid, { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }));
  }

  return (total * length) / steps;
}

/** Whether every point of the segment keeps at least `margin` pixels from obstacles, sampled every quarter cell. */
function segmentKeeps(grid: NavGrid, a: Point, b: Point, margin: number) {
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  const steps = Math.max(Math.ceil(length / (grid.cell / 4)), 1);

  for (let step = 0; step <= steps; step++) {
    const t = step / steps;

    if (obstacleDistance(grid, { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }) < margin) {
      return false;
    }
  }

  return true;
}

/** Signed distance from `point` to a turned box. */
function boxDistance(point: Point, wall: NonNullable<CombatLayout['walls']>[number]) {
  const angle = wall.rotation ?? 0;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dx = point.x - wall.x;
  const dy = point.y - wall.y;
  const qx = Math.abs(dx * cos + dy * sin) - wall.halfWidth;
  const qy = Math.abs(-dx * sin + dy * cos) - wall.halfHeight;

  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0);
}

/** A binary min-heap of cells keyed by priority. */
function createHeap() {
  const cells: number[] = [];
  const keys: number[] = [];

  return {
    get size() {
      return cells.length;
    },

    push(cell: number, key: number) {
      let index = cells.length;
      cells.push(cell);
      keys.push(key);

      while (index > 0) {
        const parent = (index - 1) >> 1;

        if (keys[parent] <= key) {
          break;
        }

        cells[index] = cells[parent];
        keys[index] = keys[parent];
        index = parent;
      }

      cells[index] = cell;
      keys[index] = key;
    },

    pop() {
      const top = cells[0];
      const lastCell = cells.pop()!;
      const lastKey = keys.pop()!;

      if (cells.length > 0) {
        let index = 0;

        while (true) {
          const left = index * 2 + 1;
          const right = left + 1;
          let smallest = index;
          let smallestKey = lastKey;

          if (left < cells.length && keys[left] < smallestKey) {
            smallest = left;
            smallestKey = keys[left];
          }

          if (right < cells.length && keys[right] < smallestKey) {
            smallest = right;
          }

          if (smallest === index) {
            break;
          }

          cells[index] = cells[smallest];
          keys[index] = keys[smallest];
          index = smallest;
        }

        cells[index] = lastCell;
        keys[index] = lastKey;
      }

      return top;
    }
  };
}
