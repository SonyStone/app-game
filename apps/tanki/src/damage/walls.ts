import type { Collider, Rapier } from '../physics/Rapier2D';
import type { World } from '../physics/World';
import type { CombatLayout, WallMaterial, WallPlacement } from './combat';
import { carve, CHANNELS, createField, detachLoosePieces, FAR, shatter, solidBoxes, type DamageField, type Fragment } from './field';
import { KIND_BLOCK, KIND_FIELD, type createRangeRenderer } from './renderer';

type Renderer = ReturnType<typeof createRangeRenderer>;
type Point = { x: number; y: number };

/**
 * The walls of a battlefield on one fixed Rapier body: the border around the floor, the stones of
 * campfires and the layout's walls.
 *
 * Steel walls stand forever and are drawn from a formula. Walls of every other material are cut
 * into tiles of at most `TILE` pixels a side, each with its own distance field in a renderer slot
 * and its own colliders built from the field, so a hit changes only the tiles it touches:
 *
 * - `chip` cuts a crater into every tile around the hit point, its size set by the material.
 * - `refresh` then rebuilds each changed tile: pieces cut off from the rest of the wall fly away
 *   as debris, and a tile that has lost the material's `collapse` share falls apart altogether,
 *   leaving a gap a tank can drive through. Its colliders are built anew from the field and the
 *   field is uploaded again; `onChange` reports the area so navigation can follow.
 *
 * Every tile's field holds the distance to the whole wall, two pixels past the tile's own edges,
 * and every crater is cut into each tile it reaches, so tiles draw as one wall without seams; when
 * a tile falls, its neighbors are cut back to their own edges, which then get an outline.
 *
 * @param options.random - Source of randomness in [0, 1) for crater outlines and breakage.
 * @param options.onDebris - Receives a piece of wall knocked loose, with its field centered on
 *   its own center, where that center is in the world, the wall's angle and the piece's velocity.
 * @param options.onChange - Called with the world bounds of a tile whose shape changed.
 */
export function createWalls(
  rapier: Rapier,
  world: World,
  renderer: Renderer,
  layout: CombatLayout,
  options: {
    random: () => number;
    onDebris: (piece: { field: DamageField; x: number; y: number; angle: number; vx: number; vy: number; color: readonly number[] }) => void;
    onChange: (bounds: Bounds) => void;
  }
) {
  const body = world.createRigidBody(rapier.RigidBodyDesc.fixed());
  const walls = layout.walls ?? [];
  const steel = walls.filter((wall) => materialOf(wall) === 'steel');
  const tiles = walls.filter((wall) => materialOf(wall) !== 'steel').flatMap((wall) => cutIntoTiles(wall));
  const owners = new Map<number, Tile>();
  const buckets = new Map<number, Tile[]>();
  const steelDraws = steel.map(steelDraw);
  const damage = { hits: 0, collapsed: 0 };

  createFixedColliders();

  for (const tile of tiles) {
    for (const key of bucketKeys(tile.bounds)) {
      buckets.set(key, [...(buckets.get(key) ?? []), tile]);
    }

    build(tile);
  }

  return {
    /** The fixed body all walls belong to. */
    body,

    /** Tiles of breakable walls, live: their bounds, material and whether they fell. */
    tiles: tiles as readonly Readonly<Tile>[],

    /** How many hits chipped walls and how many tiles fell since the walls were built or reset. */
    get damage() {
      return { ...damage };
    },

    /**
     * The first wall along a ray within `maxDistance`, with the tile hit, if the wall is breakable;
     * `undefined` when the ray meets no wall.
     *
     * @param direction - Unit direction.
     */
    cast(start: Point, direction: Point, maxDistance: number) {
      const hit = world.castRay(
        new rapier.Ray(start, direction),
        maxDistance,
        true,
        undefined,
        undefined,
        undefined,
        undefined,
        (collider) => collider.parent() === body
      );

      return hit ? { distance: hit.timeOfImpact, tile: owners.get(hit.collider.handle) } : undefined;
    },

    /**
     * Chips a crater where a hit met a breakable wall: a row of holes reaching inward from `point`
     * along `direction`, cut into every tile they reach. Steel and the border never change.
     *
     * @param scale - Size of the blow against a shell's, which chips the material's full crater.
     * @returns The material hit, for the dust it throws.
     */
    chip(point: Point, direction: Point, tile: Tile, scale = 1) {
      const crater = tile.material.crater;

      if (!crater || tile.fallen) {
        return tile.material;
      }

      const hole = crater.hole * scale;
      const depth = crater.depth * scale;
      const craters = Math.ceil(depth / (hole * 0.5));
      const seed = options.random() * 1000;
      const reach = hole * 1.4 + depth + 4;
      damage.hits++;

      for (const near of tilesNear({ minX: point.x - reach, minY: point.y - reach, maxX: point.x + reach, maxY: point.y + reach })) {
        if (near.fallen || !near.material.crater) {
          continue;
        }

        const local = toLocal(near.wall, point);
        const inward = rotateInto(near.wall, direction);

        for (let index = 0; index <= craters; index++) {
          const along = 0.6 + (craters > 0 ? (depth * index) / craters : 0);
          carve(near.field, { x: local.x + inward.x * along, y: local.y + inward.y * along }, hole, 0.35, seed + index * 7.31);
        }

        near.changed = true;
        near.pristine = false;
        near.push = direction;
      }

      return tile.material;
    },

    /**
     * Rebuilds every tile changed since the last call: drops loose pieces and fallen tiles as
     * debris, rebuilds colliders, uploads fields and reports each changed area.
     */
    refresh() {
      for (let pass = 0; pass < 4 && tiles.some((tile) => tile.changed); pass++) {
        for (const tile of tiles) {
          if (tile.changed) {
            update(tile);
          }
        }
      }
    },

    /** Queues every wall for drawing. */
    draw() {
      for (const draw of steelDraws) {
        renderer.addBody(draw);
      }

      for (const tile of tiles) {
        if (!tile.fallen && tile.slot !== undefined) {
          renderer.addBody({
            kind: KIND_FIELD,
            x: tile.wall.x,
            y: tile.wall.y,
            angle: tile.wall.rotation ?? 0,
            originX: tile.field.originX,
            originY: tile.field.originY,
            cell: tile.field.cell,
            cols: tile.field.cols,
            rows: tile.field.rows,
            slot: tile.slot,
            color: tile.material.color,
            height: tile.material.height
          });
        }
      }
    },

    /**
     * Distance from `point` to the nearest wall, the border or a campfire's stones, as the walls
     * stand now, negative inside one; at most `cap`, which keeps the search near the point.
     */
    distance(point: Point, cap: number) {
      let nearest = Math.min(layout.halfWidth - Math.abs(point.x), layout.halfHeight - Math.abs(point.y), cap);

      for (const wall of steel) {
        nearest = Math.min(nearest, wallDistance(wall, point, wall.halfWidth, wall.halfHeight));
      }

      for (const campfire of layout.campfires ?? []) {
        nearest = Math.min(nearest, Math.hypot(point.x - campfire.x, point.y - campfire.y) - CAMPFIRE_RADIUS);
      }

      for (const tile of tilesNear({ minX: point.x - cap, minY: point.y - cap, maxX: point.x + cap, maxY: point.y + cap })) {
        if (tile.fallen) {
          continue;
        }

        const local = toLocal(tile.wall, point);

        for (const box of tile.boxes) {
          nearest = Math.min(nearest, boxDistance(local.x - box.x, local.y - box.y, box.halfWidth, box.halfHeight));
        }
      }

      return nearest;
    },

    /** Puts every tile back as it was built. */
    reset() {
      damage.hits = 0;
      damage.collapsed = 0;

      for (const tile of tiles) {
        tile.changed = false;

        if (tile.fallen || !tile.pristine) {
          tile.field = createTileField(tile);
          tile.fallen = false;
          tile.pristine = true;
          build(tile);
          options.onChange(tile.bounds);
        }
      }
    }
  };

  /** The border walls just outside the floor, steel walls and campfire stones, which never change. */
  function createFixedColliders() {
    const thickness = 40;
    const { halfWidth, halfHeight } = layout;

    for (const [x, y, hw, hh] of [
      [0, -halfHeight - thickness, halfWidth + thickness * 2, thickness],
      [0, halfHeight + thickness, halfWidth + thickness * 2, thickness],
      [-halfWidth - thickness, 0, thickness, halfHeight],
      [halfWidth + thickness, 0, thickness, halfHeight]
    ]) {
      world.createCollider(rapier.ColliderDesc.cuboid(hw, hh).setTranslation(x, y), body);
    }

    for (const wall of steel) {
      world.createCollider(
        rapier.ColliderDesc.cuboid(wall.halfWidth, wall.halfHeight)
          .setTranslation(wall.x, wall.y)
          .setRotation(wall.rotation ?? 0),
        body
      );
    }

    for (const campfire of layout.campfires ?? []) {
      world.createCollider(rapier.ColliderDesc.ball(CAMPFIRE_RADIUS).setTranslation(campfire.x, campfire.y), body);
    }
  }

  /** Gives a standing tile a field slot, uploads its field and builds its colliders. */
  function build(tile: Tile) {
    tile.slot ??= renderer.allocateField();

    if (tile.slot === undefined) {
      throw new Error('The walls ran out of field slots.');
    }

    renderer.uploadField(tile.slot, tile.field);
    rebuildColliders(tile);
  }

  /** Rebuilds a changed tile; a tile that lost too much falls, and its neighbors are cut back. */
  function update(tile: Tile) {
    tile.changed = false;

    if (tile.fallen) {
      return;
    }

    const loose = detachLoosePieces(tile.field, MIN_PIECE_CELLS, (cell) => isAnchored(tile, cell));

    for (const fragment of loose) {
      launch(tile, fragment, 40);
    }

    if (ownArea(tile) < tile.fullArea * (1 - tile.material.collapse)) {
      fall(tile);
      return;
    }

    renderer.uploadField(tile.slot!, tile.field);
    rebuildColliders(tile);
    options.onChange(tile.bounds);
  }

  /** Breaks a tile into pieces that fly off, frees its slot and cuts its neighbors back to their own edges. */
  function fall(tile: Tile) {
    damage.collapsed++;
    tile.fallen = true;
    // The margin belongs to the neighbors; only the tile's own part falls.
    clip(tile.field, (x, y) => rectDistance(tile.rect, x, y));
    const pieces = Math.min(Math.max(Math.round(ownArea(tile) / 500), 3), 8);

    for (const fragment of shatter(tile.field, pieces, MIN_PIECE_CELLS, options.random)) {
      launch(tile, fragment, 90);
    }

    removeColliders(tile);
    renderer.releaseField(tile.slot!);
    tile.slot = undefined;

    for (const neighbor of tile.neighbors) {
      if (!neighbor.fallen) {
        clip(neighbor.field, (x, y) => -rectDistance(tile.rect, x, y));
        neighbor.changed = true;
        neighbor.pristine = false;
      }
    }

    options.onChange(tile.bounds);
  }

  /** Sends a piece of `tile` flying, away from the tile's center and along the last hit. */
  function launch(tile: Tile, fragment: Fragment, speed: number) {
    const center = { x: (tile.rect.minX + tile.rect.maxX) / 2, y: (tile.rect.minY + tile.rect.maxY) / 2 };
    const away = normalize({ x: fragment.centerX - center.x, y: fragment.centerY - center.y });
    const kick = (0.4 + options.random() * 0.6) * speed;
    const at = toWorld(tile.wall, { x: fragment.centerX, y: fragment.centerY });
    const outward = rotateOut(tile.wall, away);

    options.onDebris({
      field: { ...fragment.field, originX: fragment.field.originX - fragment.centerX, originY: fragment.field.originY - fragment.centerY },
      x: at.x,
      y: at.y,
      angle: tile.wall.rotation ?? 0,
      vx: outward.x * kick + tile.push.x * speed * 0.8,
      vy: outward.y * kick + tile.push.y * speed * 0.8,
      color: tile.material.color
    });
  }

  /**
   * Whether a cell of `tile`'s field lies in a standing neighbor of the same wall: material there
   * belongs to the rest of the wall, so it holds the tile's pieces that touch it in place.
   */
  function isAnchored(tile: Tile, cell: number) {
    const x = tile.field.originX + (cell % tile.field.cols) * tile.field.cell;
    const y = tile.field.originY + Math.floor(cell / tile.field.cols) * tile.field.cell;

    if (inside(tile.rect, x, y)) {
      return false;
    }

    return tile.neighbors.some((neighbor) => !neighbor.fallen && inside(neighbor.rect, x, y));
  }

  function rebuildColliders(tile: Tile) {
    removeColliders(tile);
    const { boxes } = solidBoxes(tile.field, 1);
    const angle = tile.wall.rotation ?? 0;
    tile.boxes = boxes;
    tile.colliders = boxes.map((box) => {
      const center = toWorld(tile.wall, box);
      const collider = world.createCollider(
        rapier.ColliderDesc.cuboid(box.halfWidth, box.halfHeight).setTranslation(center.x, center.y).setRotation(angle),
        body
      );
      owners.set(collider.handle, tile);
      return collider;
    });
  }

  function removeColliders(tile: Tile) {
    for (const collider of tile.colliders) {
      owners.delete(collider.handle);
      world.removeCollider(collider, false);
    }

    tile.colliders = [];
    tile.boxes = [];
  }

  /** Tiles whose bounds overlap `bounds`, each once. */
  function tilesNear(bounds: Bounds) {
    const found = new Set<Tile>();

    for (const key of bucketKeys(bounds)) {
      for (const tile of buckets.get(key) ?? []) {
        if (overlaps(tile.bounds, bounds)) {
          found.add(tile);
        }
      }
    }

    return found;
  }
}

/** Walls as returned by `createWalls`. */
export type Walls = ReturnType<typeof createWalls>;

/** An axis-aligned box in world pixels. */
export type Bounds = { minX: number; minY: number; maxX: number; maxY: number };

/** How a wall material looks and stands up to hits; see `WALL_MATERIALS`. */
export type WallMaterialSpec = {
  /** Fill color, components 0-1. */
  color: readonly number[];
  /** Height above the floor for shadows, in pixels. */
  height: number;
  /**
   * The crater a shell's hit chips: holes of radius `hole` from the surface up to `depth` pixels
   * deep. Steel has none.
   */
  crater?: { hole: number; depth: number };
  /** Share of a tile's material whose loss brings the whole tile down. */
  collapse: number;
};

/**
 * The wall materials. A wooden fence 14 px thick is shot through in two hits, a brick wall 24 px
 * thick in four, a concrete wall 30 px thick in eight, and a tile of a fence falls after about
 * three hits; steel stands forever. Wood is drawn with planks, brick with courses of bricks,
 * concrete as slabs and steel hatched.
 */
export const WALL_MATERIALS: Record<WallMaterial, WallMaterialSpec> = {
  steel: { color: [0.31, 0.33, 0.37], height: 10, collapse: 0 },
  concrete: { color: [0.62, 0.62, 0.6], height: 10, crater: { hole: 3.5, depth: 0 }, collapse: 0.5 },
  brick: { color: [0.68, 0.39, 0.3], height: 10, crater: { hole: 5, depth: 2 }, collapse: 0.35 },
  wood: { color: [0.64, 0.47, 0.29], height: 7, crater: { hole: 7, depth: 3 }, collapse: 0.3 }
};

/**
 * A piece of a breakable wall with its own field, in the wall's local coordinates. Its field
 * covers its own rectangle and two pixels around it.
 */
export type Tile = {
  wall: WallPlacement;
  material: WallMaterialSpec;
  /** The tile's own part of the wall, in the wall's local coordinates. */
  rect: Bounds;
  /** World bounds of the tile's field. */
  bounds: Bounds;
  field: DamageField;
  slot: number | undefined;
  colliders: Collider[];
  /** The colliders' boxes in the wall's local coordinates. */
  boxes: { x: number; y: number; halfWidth: number; halfHeight: number }[];
  /** Tiles of the same wall that share an edge with this one. */
  neighbors: Tile[];
  /** Solid area of the tile's own rectangle when built, in square pixels. */
  fullArea: number;
  /** Direction of the last hit, which pieces fly along. */
  push: Point;
  /** Never hit since built. */
  pristine: boolean;
  changed: boolean;
  fallen: boolean;
};

/** Largest side of a tile in pixels: a fallen tile leaves a gap about this wide. */
const TILE = 72;
/** Pixels of field around a tile's own rectangle, shared with its neighbors. */
const MARGIN = 2;
const MIN_PIECE_CELLS = 12;
const CAMPFIRE_RADIUS = 13;
/** Size of the buckets that index tiles by place, in pixels. */
const BUCKET = 128;
/** Half width of the lines of a material's pattern, in pixels. */
const LINE = 0.4;

function materialOf(wall: WallPlacement): WallMaterial {
  return wall.material ?? 'steel';
}

/** Cuts a wall into a grid of tiles of at most `TILE` pixels a side, on whole pixels from its corner. */
function cutIntoTiles(wall: WallPlacement): Tile[] {
  const material = WALL_MATERIALS[materialOf(wall)];
  const cols = Math.ceil((wall.halfWidth * 2) / TILE);
  const rows = Math.ceil((wall.halfHeight * 2) / TILE);
  const edgesX = Array.from({ length: cols + 1 }, (_, index) => -wall.halfWidth + Math.round((index * wall.halfWidth * 2) / cols));
  const edgesY = Array.from({ length: rows + 1 }, (_, index) => -wall.halfHeight + Math.round((index * wall.halfHeight * 2) / rows));
  const grid: Tile[][] = [];

  for (let row = 0; row < rows; row++) {
    grid.push([]);

    for (let col = 0; col < cols; col++) {
      const rect = { minX: edgesX[col], minY: edgesY[row], maxX: edgesX[col + 1], maxY: edgesY[row + 1] };
      const tile: Tile = {
        wall,
        material,
        rect,
        bounds: worldBounds(wall, rect, MARGIN),
        field: undefined!,
        slot: undefined,
        colliders: [],
        boxes: [],
        neighbors: [],
        fullArea: 0,
        push: { x: 0, y: 0 },
        pristine: true,
        changed: false,
        fallen: false
      };
      tile.field = createTileField(tile);
      tile.fullArea = ownArea(tile);
      grid[row].push(tile);
    }
  }

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      grid[row][col].neighbors = [grid[row - 1]?.[col], grid[row + 1]?.[col], grid[row][col - 1], grid[row][col + 1]].filter(Boolean);
    }
  }

  return grid.flat();
}

/** The field of a tile: the distance to its whole wall and the wall's pattern, over the tile and its margin. */
function createTileField(tile: Tile) {
  const { wall, rect } = tile;
  const bounds = { minX: rect.minX - MARGIN, minY: rect.minY - MARGIN, maxX: rect.maxX + MARGIN, maxY: rect.maxY + MARGIN };
  const pattern = patternOf(wall);

  return createField(bounds, 1, (x, y) => [boxDistance(x, y, wall.halfWidth, wall.halfHeight), pattern(x, y), FAR, 0]);
}

/**
 * The painted lines of a wall's material in its local coordinates, as a distance negative on a
 * line: planks across a wooden wall, courses of bricks along a brick one, slabs with a seam inside
 * the edge on concrete.
 */
function patternOf(wall: WallPlacement): (x: number, y: number) => number {
  const material = materialOf(wall);
  const along = wall.halfWidth >= wall.halfHeight;
  // Coordinates along the wall's length and across it.
  const split = (x: number, y: number) => (along ? { u: x, v: y } : { u: y, v: x });

  if (material === 'wood') {
    return (x, y) => stripes(split(x, y).u, PLANK) - LINE;
  }

  if (material === 'brick') {
    return (x, y) => {
      const { u, v } = split(x, y);
      const course = Math.floor(v / BRICK_HEIGHT);
      return Math.min(stripes(v, BRICK_HEIGHT), stripes(u + (course % 2) * (BRICK_LENGTH / 2), BRICK_LENGTH)) - LINE;
    };
  }

  return (x, y) => {
    const seam = Math.abs(boxDistance(x, y, wall.halfWidth - SLAB_SEAM, wall.halfHeight - SLAB_SEAM)) - LINE;
    const joint = Math.max(stripes(split(x, y).u, SLAB), boxDistance(x, y, wall.halfWidth - SLAB_SEAM, wall.halfHeight - SLAB_SEAM)) - LINE;
    return Math.min(seam, joint);
  };
}

const PLANK = 7;
const BRICK_HEIGHT = 8;
const BRICK_LENGTH = 16;
const SLAB = 48;
const SLAB_SEAM = 3;

/** Distance to the nearest of the lines at every multiple of `spacing`. */
function stripes(value: number, spacing: number) {
  const phase = value / spacing - Math.floor(value / spacing);
  return Math.min(phase, 1 - phase) * spacing;
}

/** Solid area within a tile's own rectangle, in square pixels. */
function ownArea(tile: Tile) {
  const { field, rect } = tile;
  let cells = 0;

  for (let row = 0; row < field.rows; row++) {
    for (let col = 0; col < field.cols; col++) {
      const x = field.originX + col * field.cell;
      const y = field.originY + row * field.cell;

      if (inside(rect, x, y) && field.data[(row * field.cols + col) * CHANNELS] < 0) {
        cells++;
      }
    }
  }

  return cells * field.cell * field.cell;
}

/** Removes material wherever `outside` is positive: the armor distance becomes at least that. */
function clip(field: DamageField, outside: (x: number, y: number) => number) {
  for (let row = 0; row < field.rows; row++) {
    for (let col = 0; col < field.cols; col++) {
      const index = (row * field.cols + col) * CHANNELS;
      field.data[index] = Math.max(field.data[index], outside(field.originX + col * field.cell, field.originY + row * field.cell));
    }
  }
}

/** The quad of a steel wall, drawn from a formula with room for its edge around it. */
function steelDraw(wall: WallPlacement) {
  const margin = 2;

  return {
    kind: KIND_BLOCK,
    x: wall.x,
    y: wall.y,
    angle: wall.rotation ?? 0,
    originX: -wall.halfWidth - margin + 0.5,
    originY: -wall.halfHeight - margin + 0.5,
    cell: 1,
    cols: (wall.halfWidth + margin) * 2,
    rows: (wall.halfHeight + margin) * 2,
    color: WALL_MATERIALS.steel.color,
    height: WALL_MATERIALS.steel.height,
    margin
  };
}

/** Keys of the buckets a box overlaps. */
function bucketKeys(bounds: Bounds) {
  const keys: number[] = [];

  for (let row = Math.floor(bounds.minY / BUCKET); row <= Math.floor(bounds.maxY / BUCKET); row++) {
    for (let col = Math.floor(bounds.minX / BUCKET); col <= Math.floor(bounds.maxX / BUCKET); col++) {
      keys.push((row + 1024) * 4096 + col + 1024);
    }
  }

  return keys;
}

/** World bounds of a local rectangle of a wall grown by `margin`. */
function worldBounds(wall: WallPlacement, rect: Bounds, margin: number): Bounds {
  const corners = [
    { x: rect.minX - margin, y: rect.minY - margin },
    { x: rect.maxX + margin, y: rect.minY - margin },
    { x: rect.minX - margin, y: rect.maxY + margin },
    { x: rect.maxX + margin, y: rect.maxY + margin }
  ].map((corner) => toWorld(wall, corner));

  return {
    minX: Math.min(...corners.map((corner) => corner.x)),
    minY: Math.min(...corners.map((corner) => corner.y)),
    maxX: Math.max(...corners.map((corner) => corner.x)),
    maxY: Math.max(...corners.map((corner) => corner.y))
  };
}

function overlaps(a: Bounds, b: Bounds) {
  return a.minX <= b.maxX && b.minX <= a.maxX && a.minY <= b.maxY && b.minY <= a.maxY;
}

function inside(rect: Bounds, x: number, y: number) {
  return x > rect.minX && x < rect.maxX && y > rect.minY && y < rect.maxY;
}

/** Signed distance to a rectangle, negative inside. */
function rectDistance(rect: Bounds, x: number, y: number) {
  return boxDistance(x - (rect.minX + rect.maxX) / 2, y - (rect.minY + rect.maxY) / 2, (rect.maxX - rect.minX) / 2, (rect.maxY - rect.minY) / 2);
}

/** Signed distance from a world point to a box of the given half size around a wall's center, in the wall's frame. */
function wallDistance(wall: WallPlacement, point: Point, halfWidth: number, halfHeight: number) {
  const local = toLocal(wall, point);
  return boxDistance(local.x, local.y, halfWidth, halfHeight);
}

/** Signed distance to an axis-aligned box of half size `halfX` x `halfY` around the origin. */
function boxDistance(x: number, y: number, halfX: number, halfY: number) {
  const qx = Math.abs(x) - halfX;
  const qy = Math.abs(y) - halfY;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0);
}

function toLocal(wall: WallPlacement, point: Point) {
  return rotateInto(wall, { x: point.x - wall.x, y: point.y - wall.y });
}

function toWorld(wall: WallPlacement, local: Point) {
  const out = rotateOut(wall, local);
  return { x: wall.x + out.x, y: wall.y + out.y };
}

/** Rotates a world vector into a wall's local axes. */
function rotateInto(wall: WallPlacement, vector: Point) {
  const angle = wall.rotation ?? 0;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return { x: vector.x * cos + vector.y * sin, y: -vector.x * sin + vector.y * cos };
}

/** Rotates a local vector of a wall into world axes. */
function rotateOut(wall: WallPlacement, vector: Point) {
  const angle = wall.rotation ?? 0;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return { x: vector.x * cos - vector.y * sin, y: vector.x * sin + vector.y * cos };
}

function normalize(vector: Point) {
  const length = Math.hypot(vector.x, vector.y) || 1;
  return { x: vector.x / length, y: vector.y / length };
}
