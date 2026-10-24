import type { WallMaterial } from './combat';
import { CHANNELS, createField, FAR, sampleField, type DamageField } from './field';
import { KIND_FIELD, KIND_SCRAP, KIND_TURRET, packColor, type createRangeRenderer } from './renderer';

type Renderer = ReturnType<typeof createRangeRenderer>;
type Point = { x: number; y: number };

/**
 * Pieces knocked off armor and walls, and turrets blown off tanks. A piece flies off with the
 * speed of the blow, spinning, drops to the ground after a moment, slides to a stop and stays
 * there as scrap until it is taken with `take` or the battle is reset. Scrap is for the look of
 * a battle that leaves its marks, and a resource: `pieces`, `near` and `take` tell where it lies,
 * how much material each piece holds and let a collector pick it up.
 *
 * What it costs: a flying piece holds a renderer field slot of its own. A piece that came to rest
 * gives its slot back and is baked into the scrap layer: the floor is cut into chunks of `CHUNK`
 * px, and each chunk that has scrap on it holds one field slot, in which all its pieces are drawn
 * as one body (`KIND_SCRAP`), each in its own color. However many pieces lie about, scrap takes a
 * slot per chunk in use and nothing in physics: tanks drive over it. Crumbs smaller than
 * `MIN_AREA` and pieces that land inside a wall turn to dust. The layer takes at most `MAX_CHUNKS`
 * slots: when a piece needs one more, the chunk whose scrap lies there longest is cleared away.
 *
 * @param options.random - Source of randomness in [0, 1) for flight times.
 * @param options.bounds - Half size of the floor around the origin, which pieces do not leave.
 * @param options.buried - Whether a piece landing at a point would lie inside something solid,
 *   such as a wall, where it would never be seen.
 */
export function createScrap(
  renderer: Renderer,
  options: { random: () => number; bounds: { halfWidth: number; halfHeight: number }; buried?: (point: Point) => boolean }
) {
  const flying: Flying[] = [];
  const lying: Piece[] = [];
  const chunks = new Map<number, Chunk>();
  let nextId = 1;

  return {
    /** Pieces lying on the ground, oldest first, live. */
    pieces: lying as readonly ScrapPiece[],

    /** Pieces still in the air. */
    get flying() {
      return flying.length;
    },

    /** Chunks of the scrap layer in use, each holding a field slot. */
    get chunks() {
      return chunks.size;
    },

    /**
     * Sends a piece flying from where it is, at `vx`, `vy` px/s, spinning at `spin` rad/s.
     *
     * @param piece.shape - The piece's field, centered on the piece's center, or `'turret'` for a
     *   turret blown off, which is drawn from its formula while it flies. A piece with a field
     *   takes a field slot while it flies; without a free slot it lands where it is at once.
     * @param piece.color - Fill color, components 0-1.
     */
    launch(piece: {
      shape: DamageField | 'turret';
      x: number;
      y: number;
      angle: number;
      vx: number;
      vy: number;
      spin: number;
      color: readonly number[];
      material: ScrapMaterial;
    }) {
      const slot = piece.shape === 'turret' ? undefined : renderer.allocateField();
      const entry: Flying = { ...piece, slot, age: 0, air: AIR_TIME.min + options.random() * (AIR_TIME.max - AIR_TIME.min) };

      if (piece.shape !== 'turret' && slot === undefined) {
        settle(entry);
        return;
      }

      if (piece.shape !== 'turret') {
        renderer.uploadField(slot!, piece.shape);
      }

      flying.push(entry);
    },

    /**
     * Pieces lying within `radius` px of `point`, nearest first, counting from each piece's center.
     */
    near(point: Point, radius: number) {
      const found = new Set<Piece>();

      for (const chunk of chunksOver({ minX: point.x - radius, minY: point.y - radius, maxX: point.x + radius, maxY: point.y + radius })) {
        chunk.pieces.forEach((piece) => found.add(piece));
      }

      return [...found]
        .filter((piece) => Math.hypot(piece.x - point.x, piece.y - point.y) <= radius)
        .sort((a, b) => Math.hypot(a.x - point.x, a.y - point.y) - Math.hypot(b.x - point.x, b.y - point.y)) as ScrapPiece[];
    },

    /**
     * Picks up a lying piece: it is gone from the ground at once.
     *
     * @returns The piece taken, with its material and area, or `undefined` if it is gone already.
     */
    take(id: number): ScrapPiece | undefined {
      const index = lying.findIndex((piece) => piece.id === id);

      if (index < 0) {
        return undefined;
      }

      const [piece] = lying.splice(index, 1);
      removeFromChunks(piece);
      return piece;
    },

    /** Moves flying pieces over a frame of `dt` seconds and lays down those that came to rest. */
    update(dt: number) {
      for (let index = flying.length - 1; index >= 0; index--) {
        const piece = flying[index];
        piece.age += dt;
        const inAir = piece.age < piece.air;
        const drag = Math.exp(-(inAir ? AIR_DRAG : GROUND_DRAG) * dt);
        piece.x = clamp(piece.x + piece.vx * dt, options.bounds.halfWidth - EDGE);
        piece.y = clamp(piece.y + piece.vy * dt, options.bounds.halfHeight - EDGE);
        piece.angle += piece.spin * dt;
        piece.vx *= drag;
        piece.vy *= drag;
        piece.spin *= inAir ? drag : Math.exp(-GROUND_SPIN_DRAG * dt);

        if ((!inAir && Math.hypot(piece.vx, piece.vy) < REST_SPEED) || piece.age > MAX_FLIGHT) {
          flying.splice(index, 1);
          settle(piece);
        }
      }

      for (const chunk of chunks.values()) {
        if (chunk.dirty) {
          chunk.dirty = false;
          renderer.uploadField(chunk.slot, chunk.field);
        }
      }
    },

    /** Queues the scrap layer, then the pieces in the air, for drawing. */
    draw() {
      for (const chunk of chunks.values()) {
        renderer.addBody({
          kind: KIND_SCRAP,
          x: 0,
          y: 0,
          angle: 0,
          originX: chunk.field.originX,
          originY: chunk.field.originY,
          cell: chunk.field.cell,
          cols: chunk.field.cols,
          rows: chunk.field.rows,
          slot: chunk.slot,
          color: NO_COLOR,
          height: LYING_HEIGHT
        });
      }

      for (const piece of flying) {
        // A piece drops from the height it was knocked off at to the ground.
        const height = LYING_HEIGHT + (FLIGHT_HEIGHT - LYING_HEIGHT) * Math.max(1 - piece.age / piece.air, 0);

        if (piece.shape === 'turret') {
          renderer.addBody({ ...TURRET_DRAW, x: piece.x, y: piece.y, angle: piece.angle, color: piece.color, height: Math.max(height, TURRET_LYING) });
        } else {
          const field = piece.shape;
          renderer.addBody({
            kind: KIND_FIELD,
            x: piece.x,
            y: piece.y,
            angle: piece.angle,
            originX: field.originX,
            originY: field.originY,
            cell: field.cell,
            cols: field.cols,
            rows: field.rows,
            slot: piece.slot,
            color: piece.color,
            height
          });
        }
      }
    },

    /**
     * Gives up a field slot for something that needs one more: the oldest flying piece lands at
     * once and hands over its slot, or, with nothing in the air, the chunk whose scrap lies there
     * longest is cleared away.
     *
     * @returns The slot, now the caller's, or `undefined` when scrap holds none.
     */
    reclaimSlot() {
      const index = flying.findIndex((piece) => piece.slot !== undefined);

      if (index >= 0) {
        const [piece] = flying.splice(index, 1);
        const slot = piece.slot;
        piece.slot = undefined;
        settle(piece);
        return slot;
      }

      return evictOldest();
    },

    /** Clears every piece away and frees every slot, for a new battle. */
    reset() {
      for (const piece of flying.splice(0)) {
        if (piece.slot !== undefined) {
          renderer.releaseField(piece.slot);
        }
      }

      for (const chunk of chunks.values()) {
        renderer.releaseField(chunk.slot);
      }

      chunks.clear();
      lying.length = 0;
    }
  };

  /**
   * Lays a piece down where it came to rest: it gives back its field slot and joins the scrap
   * layer, or crumbles away when the layer has no room for it.
   */
  function settle(piece: Flying) {
    if (piece.slot !== undefined) {
      renderer.releaseField(piece.slot);
      piece.slot = undefined;
    }

    const field = piece.shape === 'turret' ? turretField() : piece.shape;
    const area = solidArea(field);

    if (area < MIN_AREA || options.buried?.(piece)) {
      return;
    }

    const packed = packColor(piece.color);
    // Lying pieces carry their color where the core would be, which the layer draws.
    const data = field.data.slice();

    for (let index = 2; index < data.length; index += CHANNELS) {
      data[index] = packed;
    }

    const stored: Piece = {
      id: nextId++,
      x: piece.x,
      y: piece.y,
      angle: piece.angle,
      material: piece.material,
      area,
      radius: Math.hypot(Math.max(Math.abs(field.originX), Math.abs(field.originX + field.cols * field.cell)), Math.max(Math.abs(field.originY), Math.abs(field.originY + field.rows * field.cell))),
      field: { ...field, data },
      chunks: []
    };
    const over = chunkKeysOver(boundsOf(stored));

    for (const key of over) {
      const chunk = chunks.get(key) ?? openChunk(key);

      if (!chunk) {
        // No room in the layer: what is baked so far is undone and the piece is gone.
        removeFromChunks(stored);
        return;
      }

      chunk.pieces.add(stored);
      stored.chunks.push(chunk);
      bake(chunk.field, stored);
      chunk.dirty = true;
    }

    lying.push(stored);
  }

  /**
   * A new chunk of the layer with its own slot. When the layer is full or no slot is free, the
   * chunk whose scrap lies there longest is cleared away for it; `undefined` when there is none.
   */
  function openChunk(key: number) {
    const slot = (chunks.size < MAX_CHUNKS ? renderer.allocateField() : undefined) ?? evictOldest();

    if (slot === undefined) {
      return undefined;
    }

    const col = (key % CHUNK_KEY) - CHUNK_OFFSET;
    const row = Math.floor(key / CHUNK_KEY) - CHUNK_OFFSET;
    const chunk: Chunk = { key, slot, field: emptyChunkField(col * CHUNK, row * CHUNK), pieces: new Set(), dirty: true };
    chunks.set(key, chunk);
    return chunk;
  }

  /** Takes a piece out of the chunks it lies on, which are baked again without it; empty chunks free their slots. */
  function removeFromChunks(piece: Piece, keep?: Chunk) {
    for (const chunk of piece.chunks) {
      chunk.pieces.delete(piece);

      if (chunk === keep) {
        continue;
      }

      if (chunk.pieces.size === 0) {
        chunks.delete(chunk.key);
        renderer.releaseField(chunk.slot);
        continue;
      }

      clearChunk(chunk.field);
      chunk.pieces.forEach((other) => bake(chunk.field, other));
      chunk.dirty = true;
    }

    piece.chunks = [];
  }

  /** Clears away the chunk whose newest piece is the oldest, with every piece on it; returns its slot, now the caller's. */
  function evictOldest() {
    let oldest: Chunk | undefined;
    let oldestId = Infinity;

    for (const chunk of chunks.values()) {
      let newest = 0;
      chunk.pieces.forEach((piece) => (newest = Math.max(newest, piece.id)));

      if (newest < oldestId) {
        oldest = chunk;
        oldestId = newest;
      }
    }

    if (!oldest) {
      return undefined;
    }

    for (const piece of [...oldest.pieces]) {
      lying.splice(lying.indexOf(piece), 1);
      removeFromChunks(piece, oldest);
    }

    chunks.delete(oldest.key);
    return oldest.slot;
  }

  function chunksOver(bounds: Bounds) {
    return chunkKeysOver(bounds).flatMap((key) => chunks.get(key) ?? []);
  }
}

/** The scrap layer as returned by `createScrap`. */
export type Scrap = ReturnType<typeof createScrap>;

/** What a piece of scrap is made of: armor plate off a tank, or the stuff of a wall. */
export type ScrapMaterial = 'metal' | WallMaterial;

/** A piece of scrap lying on the ground. */
export type ScrapPiece = {
  /** Unique within the battle, for `take`. */
  readonly id: number;
  /** Where the piece's center lies and how it is turned. */
  readonly x: number;
  readonly y: number;
  readonly angle: number;
  readonly material: ScrapMaterial;
  /** Area of the piece in square pixels, how much material it holds; a whole medium tank's hull is about 1000. */
  readonly area: number;
  /** Distance from the center within which all of the piece lies, in pixels. */
  readonly radius: number;
};

/** A lying piece with its field, colors packed into the core channel, and the chunks it is baked into. */
type Piece = ScrapPiece & { field: DamageField; chunks: Chunk[] };

/** A piece in the air; `air` is the seconds until it touches the ground. */
type Flying = {
  shape: DamageField | 'turret';
  slot: number | undefined;
  x: number;
  y: number;
  angle: number;
  vx: number;
  vy: number;
  spin: number;
  color: readonly number[];
  material: ScrapMaterial;
  age: number;
  air: number;
};

/** A square of the floor with the scrap on it baked into one field, in world coordinates. */
type Chunk = { key: number; slot: number; field: DamageField; pieces: Set<Piece>; dirty: boolean };

type Bounds = { minX: number; minY: number; maxX: number; maxY: number };

/**
 * Side of a chunk of the scrap layer in pixels, on 1 px cells: its field fills most of a slot. The
 * layer takes at most `MAX_CHUNKS` slots, leaving room for walls, bodies and flying pieces.
 */
const CHUNK = 72;
const MAX_CHUNKS = 160;
/** Pieces smaller than this many square pixels are crumbs, which turn to dust as they land. */
const MIN_AREA = 8;
const CHUNK_KEY = 4096;
const CHUNK_OFFSET = 1024;
/**
 * Flight: a piece touches the ground after `AIR_TIME` s, slowed by `AIR_DRAG` per second, then
 * slides, slowed by `GROUND_DRAG`, until it is slower than `REST_SPEED` px/s; none flies longer
 * than `MAX_FLIGHT` s.
 */
const AIR_TIME = { min: 0.25, max: 0.6 };
const AIR_DRAG = 0.8;
const GROUND_DRAG = 7;
const GROUND_SPIN_DRAG = 9;
const REST_SPEED = 6;
const MAX_FLIGHT = 5;
/** Pixels from the floor's edge that pieces stay within. */
const EDGE = 4;
/** Heights for shadows: a piece is knocked off at hull height and lies flat; a turret stays a little taller. */
const FLIGHT_HEIGHT = 6;
const LYING_HEIGHT = 1;
const TURRET_LYING = 3;
const NO_COLOR = [0, 0, 0];
/** Draw fields of a turret, as the battle draws turrets: a quad from (-11, -11) to (31, 11). */
const TURRET_DRAW = { kind: KIND_TURRET, originX: -10.5, originY: -10.5, cell: 1, cols: 42, rows: 22 };

let turret: DamageField | undefined;
/** Soot on a turret lying on the ground, which the blast that threw it off burnt. */
const TURRET_SOOT = 0.45;

/** The field of a turret lying on the ground, the shape `KIND_TURRET` draws: a cupola and a barrel along +x. */
function turretField() {
  turret ??= createField({ minX: -11, minY: -11, maxX: 31, maxY: 11 }, 0.5, (x, y) => {
    const qx = Math.abs(x - 18.55) - 11.25 + 1;
    const qy = Math.abs(y) - 3.75 + 1;
    const barrel = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - 1;
    return [Math.min(barrel, Math.hypot(x, y) - 9.6), FAR, FAR, TURRET_SOOT];
  });

  return turret;
}

/** An empty chunk whose top left corner is at `left`, `top`. */
function emptyChunkField(left: number, top: number): DamageField {
  return clearChunk(createField({ minX: left, minY: top, maxX: left + CHUNK, maxY: top + CHUNK }, 1, () => [FAR, FAR, 0, 0]));
}

/** Empties a chunk's field: far from any piece, no color, no soot. */
function clearChunk(field: DamageField) {
  for (let index = 0; index < field.data.length; index += CHANNELS) {
    field.data[index] = FAR;
    field.data[index + 1] = FAR;
    field.data[index + 2] = 0;
    field.data[index + 3] = 0;
  }

  return field;
}

/**
 * Bakes a piece into a world-aligned field: each cell near the piece takes the piece's channels
 * where the piece's outline is nearer than whatever the cell held, so overlapping pieces join and
 * each cell keeps the color of the piece it lies in or nearest to.
 */
function bake(target: DamageField, piece: Piece) {
  const bounds = boundsOf(piece);
  const cos = Math.cos(piece.angle);
  const sin = Math.sin(piece.angle);
  const minCol = Math.max(Math.floor(bounds.minX - target.originX), 0);
  const maxCol = Math.min(Math.ceil(bounds.maxX - target.originX), target.cols - 1);
  const minRow = Math.max(Math.floor(bounds.minY - target.originY), 0);
  const maxRow = Math.min(Math.ceil(bounds.maxY - target.originY), target.rows - 1);

  for (let row = minRow; row <= maxRow; row++) {
    for (let col = minCol; col <= maxCol; col++) {
      const dx = target.originX + col * target.cell - piece.x;
      const dy = target.originY + row * target.cell - piece.y;
      const sample = sampleNear(piece.field, dx * cos + dy * sin, -dx * sin + dy * cos);
      const index = (row * target.cols + col) * CHANNELS;

      if (sample[0] < target.data[index]) {
        target.data.set(sample, index);
      }
    }
  }
}

const scratch = new Float32Array(CHANNELS);

/**
 * Samples a field like `sampleField`, but a point outside its grid reads the nearest point of the
 * grid plus the distance to it, so the distance keeps growing smoothly past the grid's edge.
 */
function sampleNear(field: DamageField, x: number, y: number) {
  const minX = field.originX;
  const minY = field.originY;
  const maxX = field.originX + (field.cols - 1) * field.cell;
  const maxY = field.originY + (field.rows - 1) * field.cell;
  const inX = Math.min(Math.max(x, minX), maxX);
  const inY = Math.min(Math.max(y, minY), maxY);
  sampleField(field, inX, inY, scratch);
  scratch[0] += Math.hypot(x - inX, y - inY);
  return scratch;
}

/** World bounds of a lying piece, with room for its outline. */
function boundsOf(piece: Piece): Bounds {
  const reach = piece.radius + 2;
  return { minX: piece.x - reach, minY: piece.y - reach, maxX: piece.x + reach, maxY: piece.y + reach };
}

function chunkKeysOver(bounds: Bounds) {
  const keys: number[] = [];

  for (let row = Math.floor(bounds.minY / CHUNK); row <= Math.floor(bounds.maxY / CHUNK); row++) {
    for (let col = Math.floor(bounds.minX / CHUNK); col <= Math.floor(bounds.maxX / CHUNK); col++) {
      keys.push((row + CHUNK_OFFSET) * CHUNK_KEY + col + CHUNK_OFFSET);
    }
  }

  return keys;
}

/** Area of the armor in a field, in square pixels. */
function solidArea(field: DamageField) {
  let cells = 0;

  for (let index = 0; index < field.data.length; index += CHANNELS) {
    if (field.data[index] < 0) {
      cells++;
    }
  }

  return cells * field.cell * field.cell;
}

function clamp(value: number, limit: number) {
  return Math.min(Math.max(value, -limit), limit);
}
