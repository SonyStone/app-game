import { BARRIER_HALF_WIDTH, type SpyArena } from './arena';
import type { Gait } from './variants';

type Point = { x: number; y: number };

/**
 * A grid over the arena for the bot spider to plan on. Walls and the arena's edge always block
 * it, barriers only the low spider; crates and tanks move, so each plan marks them anew. Each
 * cell also has a cost of standing in it, raised where tanks look.
 *
 * `plan` runs Dijkstra from one cell over the whole grid at once, so a single plan answers how
 * far every cell is and how to get there.
 *
 * @param clearance - How far from a wall a cell's center must be, about the spider's radius.
 */
export function createNavGrid(arena: SpyArena, gait: Gait, clearance: number, cell = NAV_CELL) {
  const cols = Math.ceil((arena.halfWidth * 2) / cell);
  const rows = Math.ceil((arena.halfHeight * 2) / cell);
  const fixed = new Uint8Array(cols * rows);
  const blocked = new Uint8Array(cols * rows);
  const cost = new Float32Array(cols * rows);
  const distance = new Float32Array(cols * rows);
  const previous = new Int32Array(cols * rows);

  for (let index = 0; index < fixed.length; index++) {
    const center = centerOf(index);
    const edge = Math.min(arena.halfWidth - Math.abs(center.x), arena.halfHeight - Math.abs(center.y));
    const wall = arena.walls.some((wall) => boxDistance(center, wall, wall.halfWidth, wall.halfHeight, wall.rotation ?? 0) < clearance);
    const barrier =
      gait === 'low' &&
      arena.obstacles.some(
        (obstacle) => obstacle.kind === 'barrier' && boxDistance(center, obstacle, obstacle.halfLength, BARRIER_HALF_WIDTH, obstacle.rotation) < clearance
      );
    fixed[index] = edge < clearance || wall || barrier ? 1 : 0;
  }

  return {
    cols,
    rows,
    cell,

    /** Index of the cell holding `point`, clamped to the grid. */
    indexOf(point: Point) {
      const col = Math.min(Math.max(Math.floor((point.x + arena.halfWidth) / cell), 0), cols - 1);
      const row = Math.min(Math.max(Math.floor((point.y + arena.halfHeight) / cell), 0), rows - 1);
      return row * cols + col;
    },

    centerOf,

    /** Whether the cell is blocked in the current plan. */
    isBlocked(index: number) {
      return blocked[index] === 1;
    },

    /** Cost of standing in the cell in the current plan, 0 where no tank looks. */
    dangerOf(index: number) {
      return cost[index];
    },

    /** Distance along the current plan from its start to the cell; `Infinity` if out of reach. */
    distanceTo(index: number) {
      return distance[index];
    },

    /**
     * Plans from `start` over the grid as it stands now.
     *
     * @param boxes - Moving things that block cells this time: crates and tanks, as turned boxes.
     * @param danger - Extra cost of passing through a cell's center, in pixels of detour.
     */
    plan(start: Point, boxes: readonly MovingBox[], danger: (point: Point) => number) {
      blocked.set(fixed);

      for (const box of boxes) {
        markBox(box);
      }

      for (let index = 0; index < cost.length; index++) {
        cost[index] = blocked[index] ? 0 : danger(centerOf(index));
      }

      const from = this.indexOf(start);
      blocked[from] = 0;
      dijkstra(from);
    },

    /** The cell centers from the plan's start to `index`, start excluded; empty when out of reach. */
    pathTo(index: number) {
      if (!Number.isFinite(distance[index])) {
        return [];
      }

      const path: Point[] = [];

      for (let at = index; previous[at] >= 0; at = previous[at]) {
        path.push(centerOf(at));
      }

      return path.reverse();
    },

    /** The open cell nearest `point`, searched outward ring by ring; `point`'s own cell when open. */
    nearestOpen(point: Point) {
      const origin = this.indexOf(point);
      const col0 = origin % cols;
      const row0 = Math.floor(origin / cols);

      for (let ring = 0; ring < 8; ring++) {
        let best: number | undefined;
        let bestDistance = Infinity;

        for (let row = row0 - ring; row <= row0 + ring; row++) {
          for (let col = col0 - ring; col <= col0 + ring; col++) {
            if (row < 0 || col < 0 || row >= rows || col >= cols || blocked[row * cols + col]) {
              continue;
            }

            const center = centerOf(row * cols + col);
            const gap = Math.hypot(center.x - point.x, center.y - point.y);

            if (gap < bestDistance) {
              bestDistance = gap;
              best = row * cols + col;
            }
          }
        }

        if (best !== undefined) {
          return best;
        }
      }

      return origin;
    }
  };

  function centerOf(index: number) {
    return { x: -arena.halfWidth + ((index % cols) + 0.5) * cell, y: -arena.halfHeight + (Math.floor(index / cols) + 0.5) * cell };
  }

  function markBox(box: MovingBox) {
    const reach = Math.hypot(box.halfWidth, box.halfHeight) + clearance;
    const minCol = Math.max(Math.floor((box.x - reach + arena.halfWidth) / cell), 0);
    const maxCol = Math.min(Math.floor((box.x + reach + arena.halfWidth) / cell), cols - 1);
    const minRow = Math.max(Math.floor((box.y - reach + arena.halfHeight) / cell), 0);
    const maxRow = Math.min(Math.floor((box.y + reach + arena.halfHeight) / cell), rows - 1);

    for (let row = minRow; row <= maxRow; row++) {
      for (let col = minCol; col <= maxCol; col++) {
        const index = row * cols + col;

        if (boxDistance(centerOf(index), box, box.halfWidth, box.halfHeight, box.rotation) < clearance) {
          blocked[index] = 1;
        }
      }
    }
  }

  /** Dijkstra over the 8-connected grid; diagonal moves may not cut a blocked corner. */
  function dijkstra(from: number) {
    distance.fill(Infinity);
    previous.fill(-1);
    distance[from] = 0;
    const heap = createHeap();
    heap.push(from, 0);

    while (heap.size > 0) {
      const priority = heap.topPriority;
      const at = heap.pop();

      if (priority > distance[at]) {
        continue;
      }

      const col = at % cols;
      const row = Math.floor(at / cols);

      for (const [dc, dr, length] of NEIGHBORS) {
        const nextCol = col + dc;
        const nextRow = row + dr;

        if (nextCol < 0 || nextRow < 0 || nextCol >= cols || nextRow >= rows) {
          continue;
        }

        const next = nextRow * cols + nextCol;

        if (blocked[next] || (dc !== 0 && dr !== 0 && (blocked[row * cols + nextCol] || blocked[nextRow * cols + col]))) {
          continue;
        }

        const through = distance[at] + length * cell + cost[next];

        if (through < distance[next]) {
          distance[next] = through;
          previous[next] = at;
          heap.push(next, through);
        }
      }
    }
  }
}

/** The planning grid from `createNavGrid`. */
export type NavGrid = ReturnType<typeof createNavGrid>;

/** Something that moves and blocks the spider's way this plan: a box around its center, turned by `rotation`. */
export type MovingBox = Point & { halfWidth: number; halfHeight: number; rotation: number };

/** Cell size of the planning grid, in pixels. */
const NAV_CELL = 16;

const NEIGHBORS = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, Math.SQRT2],
  [1, -1, Math.SQRT2],
  [-1, 1, Math.SQRT2],
  [-1, -1, Math.SQRT2]
] as const;

/** Distance from `point` to a box of half size `halfX` x `halfY` around `center`, turned by `rotation`; 0 inside. */
function boxDistance(point: Point, center: Point, halfX: number, halfY: number, rotation: number) {
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  const qx = Math.abs(dx * cos + dy * sin) - halfX;
  const qy = Math.abs(-dx * sin + dy * cos) - halfY;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
}

/** A binary min-heap of cell indices by priority. An index may be pushed again with a lower priority; the caller skips the stale entry by its priority. */
function createHeap() {
  const items: number[] = [];
  const priorities: number[] = [];

  return {
    get size() {
      return items.length;
    },

    /** Priority of the item `pop` returns next. */
    get topPriority() {
      return priorities[0];
    },

    push(item: number, priority: number) {
      items.push(item);
      priorities.push(priority);
      let index = items.length - 1;

      while (index > 0) {
        const parent = (index - 1) >> 1;

        if (priorities[parent] <= priorities[index]) {
          break;
        }

        swap(index, parent);
        index = parent;
      }
    },

    pop() {
      const top = items[0];
      const lastItem = items.pop()!;
      const lastPriority = priorities.pop()!;

      if (items.length > 0) {
        items[0] = lastItem;
        priorities[0] = lastPriority;
        let index = 0;

        for (;;) {
          const left = index * 2 + 1;
          const right = left + 1;
          let smallest = index;

          if (left < items.length && priorities[left] < priorities[smallest]) {
            smallest = left;
          }

          if (right < items.length && priorities[right] < priorities[smallest]) {
            smallest = right;
          }

          if (smallest === index) {
            break;
          }

          swap(index, smallest);
          index = smallest;
        }
      }

      return top;
    }
  };

  function swap(a: number, b: number) {
    [items[a], items[b]] = [items[b], items[a]];
    [priorities[a], priorities[b]] = [priorities[b], priorities[a]];
  }
}
