import type { Collider, Rapier, RigidBody } from '../physics/Rapier2D';
import type { World } from '../physics/World';
import { carve, CHANNELS, crack, dent, detachLoosePieces, FAR, raycastField, shatter, solidBoxes, surfaceNormal, type DamageField, type Fragment } from './field';
import { cutRail, traceRail } from './rail';
import { KIND_FIELD, PARTICLE_DUST, PARTICLE_SMOKE, type createRangeRenderer } from './renderer';

type Renderer = ReturnType<typeof createRangeRenderer>;
type Point = { x: number; y: number };
type Bounds = { minX: number; minY: number; maxX: number; maxY: number };

/**
 * Wrecks of destroyed tanks. A wreck keeps the hull's armor as the blast left it, charred, on a
 * Rapier body of its own that tanks cannot push: it stands where the tank died, as heavy as a
 * wall, and is cover from shots and sight. It keeps the hull's shape and painted lines, so a
 * heavy tank's wreck is big and a light one's small, each recognizably of its class.
 *
 * - Shots chip it like armor (`chip`); pieces cut loose fall off as scrap (`onDebris`), and a wreck
 *   shot down to `CRUMBLE_AT` of its armor falls apart.
 * - A ram dents it a little; a hard one, near a tank's full speed, shoves it a few pixels, a wreck
 *   of a heavier tank less (`ram`).
 * - A blast chips the face it meets, which `facesNear` finds; a rail cuts its slit through it as
 *   far as its power takes it (`rail`).
 * - `cast` finds it along a shot and `distance` gives it to navigation; `onChange` reports where a
 *   wreck appeared, moved, changed shape or went.
 * - At most `limit` wrecks stand: when one more comes, the oldest falls apart into a heap of
 *   scrap with a puff of dust.
 *
 * Each wreck holds a renderer field slot while it stands.
 *
 * @param options.limit - Most wrecks standing at once; defaults to `WRECK_LIMIT`.
 * @param options.random - Source of randomness in [0, 1) for craters and breakage.
 * @param options.wallDistance - Distance from a point to the nearest wall as the walls stand, which a
 *   shoved wreck does not slide into.
 * @param options.onDebris - Receives a piece that came off a wreck, with its field centered on its
 *   own center, where that center is in the world, the wreck's angle and the piece's velocity.
 * @param options.onChange - Called with the world bounds of an area where wrecks changed.
 */
export function createWrecks(
  rapier: Rapier,
  world: World,
  renderer: Renderer,
  options: {
    limit?: number;
    random: () => number;
    wallDistance: (point: Point, cap: number) => number;
    onDebris: (piece: { field: DamageField; x: number; y: number; angle: number; vx: number; vy: number; color: readonly number[] }) => void;
    onChange: (bounds: Bounds) => void;
  }
) {
  const limit = options.limit ?? WRECK_LIMIT;
  const wrecks: Wreck[] = [];
  const owners = new Map<number, Wreck>();
  let nextId = 1;
  let made = 0;

  return {
    /** Wrecks standing now, oldest first: where each is, how it is turned and how much armor it has left. */
    get list(): readonly WreckView[] {
      return wrecks.map((wreck) => ({ id: wreck.id, ...wreck.body.translation(), angle: wreck.body.rotation(), team: wreck.team, area: wreck.area }));
    },

    /** Wrecks left since the battle began or was reset, those gone since included. */
    get made() {
      return made;
    },

    /**
     * Leaves a wreck where a tank blew up, with its armor field, which the wreck owns from now on.
     * The blast tears a ragged hole where the core was and cracks the hull out to its edge, and a
     * wedge or two between the cracks fly off along the shot that did it; the rest is charred, its
     * colors darkened. The oldest wreck falls apart if there are more than the limit.
     *
     * @param wreck.color - The tank's color, components 0-1.
     * @param wreck.core - Center of the core in the field's coordinates, where the blast starts.
     * @param wreck.direction - Unit direction of the shot that destroyed the tank.
     * @param wreck.mass - Mass of the tank, 1 for the medium tank's; a heavier wreck takes a harder
     *   ram to shove. Defaults to 1.
     * @returns The id of the wreck left, or `undefined` when none was: without a free field slot
     *   none is, and a hull with less than `MIN_AREA` of armor left falls apart into scrap at once.
     */
    add(wreck: {
      field: DamageField;
      x: number;
      y: number;
      angle: number;
      color: readonly number[];
      team: string | undefined;
      core: Point;
      direction: Point;
      mass?: number;
    }) {
      const slot = renderer.allocateField();

      if (slot === undefined) {
        return undefined;
      }

      blast(wreck.field, wreck.core, options.random);
      char(wreck.field, options.random);
      const body = world.createRigidBody(rapier.RigidBodyDesc.kinematicPositionBased().setTranslation(wreck.x, wreck.y).setRotation(wreck.angle));
      const entry: Wreck = {
        id: nextId++,
        body,
        field: wreck.field,
        slot,
        color: wreck.color.map((channel) => channel * WRECK_SHADE),
        team: wreck.team,
        colliders: [],
        boxes: [],
        area: 0,
        fullArea: 0,
        mass: wreck.mass ?? 1,
        reach: reachOf(wreck.field),
        changed: false,
        flash: 0,
        slide: undefined
      };
      wrecks.push(entry);
      made++;
      entry.push = wreck.direction;

      for (const fragment of detachLoosePieces(entry.field, MIN_PIECE_CELLS)) {
        launch(entry, fragment, BLAST_SPEED);
      }

      rebuild(entry);
      entry.fullArea = entry.area;

      if (entry.area < MIN_AREA || entry.boxes.length === 0) {
        crumble(entry);
        return undefined;
      }

      options.onChange(boundsOf(entry));

      while (wrecks.length > limit) {
        crumble(wrecks[0]);
      }

      return entry.id;
    },

    /**
     * The first wreck along a ray within `maxDistance`, how far along it is and the outward normal
     * of its armor there, which a bounce turns off; `undefined` when the ray meets none.
     *
     * @param direction - Unit direction.
     */
    cast(start: Point, direction: Point, maxDistance: number) {
      let best: { distance: number; wreck: Wreck } | undefined;

      for (const wreck of wrecks) {
        const hit = raycastField(wreck.field, toLocal(wreck.body, start), rotateInto(wreck.body, direction), best?.distance ?? maxDistance);

        if (hit && hit.distance < (best?.distance ?? maxDistance)) {
          best = { distance: hit.distance, wreck };
        }
      }

      return best && { ...best, normal: normalAt(best.wreck, { x: start.x + direction.x * best.distance, y: start.y + direction.y * best.distance }) };
    },

    /**
     * The wrecks within `radius` of `at`, for a blast there: for each, where the line from `at` to
     * the wreck's center first meets its armor, how far away that is, the line's unit direction
     * and the armor's outward normal there.
     */
    facesNear(at: Point, radius: number) {
      const faces: { wreck: Readonly<Wreck>; point: Point; distance: number; direction: Point; normal: Point | undefined }[] = [];

      for (const wreck of wrecks) {
        const center = wreck.body.translation();
        const length = Math.hypot(center.x - at.x, center.y - at.y);

        if (length - wreck.reach > radius) {
          continue;
        }

        const direction = length > 1e-6 ? { x: (center.x - at.x) / length, y: (center.y - at.y) / length } : { x: 1, y: 0 };
        const hit = raycastField(wreck.field, toLocal(wreck.body, at), rotateInto(wreck.body, direction), radius);

        if (hit) {
          const point = { x: at.x + direction.x * hit.distance, y: at.y + direction.y * hit.distance };
          faces.push({ wreck, point, distance: hit.distance, direction, normal: normalAt(wreck, point) });
        }
      }

      return faces;
    },

    /**
     * Runs a rail's line through a wreck from where it met the wreck at `entry` along `direction`
     * (see `traceRail`): it cuts the rail's slit, `slit` px wide with holes of `hole` px, through
     * the wreck's armor as far as `power` px of it take it.
     *
     * @returns Where the line came out of the wreck, or where it stopped inside when `through` is
     *   false, and how many pixels of armor it went through; `undefined` for a wreck gone already.
     */
    rail(wreck: Readonly<Wreck>, entry: Point, direction: Point, cut: { power: number; slit: number; hole: number }) {
      const target = wreck as Wreck;

      if (!wrecks.includes(target)) {
        return undefined;
      }

      // The march starts a hair before the surface the cast found, so it finds the surface itself.
      const back = 1;
      const start = toLocal(target.body, { x: entry.x - direction.x * back, y: entry.y - direction.y * back });
      const inward = rotateInto(target.body, direction);
      const trace = traceRail(target.field, start, inward, { power: cut.power });

      if (!trace) {
        return { end: entry, through: true, armor: 0 };
      }

      cutRail(target.field, start, inward, trace, { slit: cut.slit, hole: cut.hole, seed: options.random() * 1000 });
      target.push = direction;
      target.flash = 1;
      target.changed = true;
      const end = { x: entry.x + direction.x * (trace.end - back), y: entry.y + direction.y * (trace.end - back) };
      return { end, through: trace.through, armor: trace.armor };
    },

    /**
     * Chips a shot's crater into a wreck where it hit, as into armor: a row of holes inward from
     * the surface. Pieces cut loose fall off with the next `refresh`. A wreck gone already is left be.
     *
     * @param blow - The shot's hole radius and how far past the surface its hole reaches, in pixels.
     */
    chip(wreck: Readonly<Wreck>, point: Point, direction: Point, blow: { hole: number; depth: number }) {
      const target = wreck as Wreck;

      // A wreck that fell apart meanwhile, as when a new one took its place, is gone.
      if (!wrecks.includes(target)) {
        return;
      }
      const local = toLocal(target.body, point);
      const inward = rotateInto(target.body, direction);
      const craters = Math.ceil(blow.depth / (blow.hole * 0.5));
      const seed = options.random() * 1000;

      for (let crater = 0; crater <= craters; crater++) {
        const along = 0.6 + (craters > 0 ? (blow.depth * crater) / craters : 0);
        carve(target.field, { x: local.x + inward.x * along, y: local.y + inward.y * along }, blow.hole, 0.35, seed + crater * 7.31);
      }

      dent(target.field, local, inward, 0.9, 4.5);
      target.push = direction;
      target.flash = 1;
      target.changed = true;
    },

    /**
     * A body crashed into a wreck: the wreck dents a little where it was hit, and a blow above
     * `SHOVE_BLOW` per unit of the wreck's mass shoves it along `direction`, turning it if the hit
     * was off its center: a heavy tank shoves a light wreck far, a light tank a heavy one not at all.
     *
     * @param handle - The collider the body touched; nothing happens unless it is a wreck's.
     * @param direction - Unit direction from the rammer into the wreck.
     * @param blow - The rammer's approach speed above the speed that starts a ram, times its mass.
     * @returns How hard the wreck is for the rammer, against steel, and the color of its dust;
     *   `undefined` when the collider is not a wreck's.
     */
    ram(handle: number, point: Point, direction: Point, blow: number) {
      const wreck = owners.get(handle);

      if (!wreck) {
        return undefined;
      }

      if (blow > 0) {
        dent(wreck.field, toLocal(wreck.body, point), rotateInto(wreck.body, direction), Math.min(blow * WRECK_DENT, 3), 7);
        wreck.changed = true;
      }

      if (blow > SHOVE_BLOW * wreck.mass) {
        const center = wreck.body.translation();
        const speed = Math.min((blow / wreck.mass - SHOVE_BLOW) * SHOVE_SPEED, MAX_SHOVE);
        const arm = { x: point.x - center.x, y: point.y - center.y };
        wreck.slide = { vx: direction.x * speed, vy: direction.y * speed, spin: (arm.x * direction.y - arm.y * direction.x) * speed * SHOVE_TURN, from: boundsOf(wreck) };
      }

      return { hardness: WRECK_HARDNESS, color: wreck.color };
    },

    /** Moves shoved wrecks for one physics step of `dt` seconds; call before the world steps. */
    step(dt: number) {
      for (const wreck of wrecks) {
        if (wreck.slide) {
          slide(wreck, dt);
        }
      }
    },

    /** Rebuilds every wreck changed since the last call; drops loose pieces and lets shot-down wrecks fall apart. */
    refresh() {
      for (const wreck of [...wrecks]) {
        if (!wreck.changed) {
          continue;
        }

        wreck.changed = false;

        for (const fragment of detachLoosePieces(wreck.field, MIN_PIECE_CELLS)) {
          launch(wreck, fragment, 50);
        }

        rebuild(wreck);

        if (wreck.area < Math.max(wreck.fullArea * CRUMBLE_AT, MIN_AREA) || wreck.boxes.length === 0) {
          crumble(wreck);
        } else {
          options.onChange(boundsOf(wreck));
        }
      }
    },

    /** Fades the flash of hits over a frame of `dt` seconds. */
    update(dt: number) {
      for (const wreck of wrecks) {
        wreck.flash = Math.max(wreck.flash - dt * 8, 0);
      }
    },

    /**
     * Distance from `point` to the nearest wreck, negative inside one; at most `cap`, which keeps
     * the search near the point.
     */
    distance(point: Point, cap: number) {
      let nearest = cap;

      for (const wreck of wrecks) {
        const center = wreck.body.translation();

        if (Math.hypot(point.x - center.x, point.y - center.y) - wreck.reach >= nearest) {
          continue;
        }

        const local = toLocal(wreck.body, point);

        for (const box of wreck.boxes) {
          nearest = Math.min(nearest, boxDistance(local.x - box.x, local.y - box.y, box.halfWidth, box.halfHeight));
        }
      }

      return nearest;
    },

    /** The wreck nearest to `point` within `reach` px, and how far it is, negative inside it; `undefined` when none is that near. */
    nearest(point: Point, reach: number) {
      let best: { wreck: WreckView; distance: number } | undefined;

      for (const wreck of wrecks) {
        const local = toLocal(wreck.body, point);

        for (const box of wreck.boxes) {
          const distance = boxDistance(local.x - box.x, local.y - box.y, box.halfWidth, box.halfHeight);

          if (distance < reach && distance < (best?.distance ?? Infinity)) {
            best = { wreck: { id: wreck.id, ...wreck.body.translation(), angle: wreck.body.rotation(), team: wreck.team, area: wreck.area }, distance };
          }
        }
      }

      return best;
    },

    /** Lets every wreck within `radius` px of `point` fall apart, as a tank coming back there would push it aside. */
    clear(point: Point, radius: number) {
      for (const wreck of [...wrecks]) {
        const center = wreck.body.translation();

        if (Math.hypot(point.x - center.x, point.y - center.y) < radius) {
          crumble(wreck);
        }
      }
    },

    /**
     * Takes a whole wreck away, as a salvager would.
     *
     * @returns The wreck's armor area in square pixels, or `undefined` when it is gone already.
     */
    take(id: number) {
      const wreck = wrecks.find((candidate) => candidate.id === id);

      if (!wreck) {
        return undefined;
      }

      remove(wreck);
      return wreck.area;
    },

    /** Queues every wreck for drawing. */
    draw() {
      for (const wreck of wrecks) {
        const position = wreck.body.translation();
        renderer.addBody({
          kind: KIND_FIELD,
          x: position.x,
          y: position.y,
          angle: wreck.body.rotation(),
          originX: wreck.field.originX,
          originY: wreck.field.originY,
          cell: wreck.field.cell,
          cols: wreck.field.cols,
          rows: wreck.field.rows,
          slot: wreck.slot,
          color: wreck.color,
          flash: wreck.flash * 0.6,
          height: WRECK_HEIGHT
        });
      }
    },

    /** Takes every wreck away, for a new battle. */
    reset() {
      for (const wreck of [...wrecks]) {
        remove(wreck);
      }

      made = 0;
    }
  };

  /** Outward normal of a wreck's armor at a world point on it, in world axes; `undefined` where the field is flat. */
  function normalAt(wreck: Wreck, point: Point) {
    const local = surfaceNormal(wreck.field, toLocal(wreck.body, point));
    return local && rotateOut(wreck.body, local);
  }

  /** Builds a wreck's colliders and boxes from its field and uploads the field. */
  function rebuild(wreck: Wreck) {
    for (const collider of wreck.colliders) {
      owners.delete(collider.handle);
      world.removeCollider(collider, false);
    }

    const { boxes, area } = solidBoxes(wreck.field, Math.max(Math.round(2 / wreck.field.cell), 1));
    wreck.area = area;
    wreck.boxes = boxes;
    wreck.colliders = boxes.map((box) => {
      const collider = world.createCollider(rapier.ColliderDesc.cuboid(box.halfWidth, box.halfHeight).setTranslation(box.x, box.y), wreck.body);
      owners.set(collider.handle, wreck);
      return collider;
    });
    renderer.uploadField(wreck.slot, wreck.field);
  }

  /** Moves a shoved wreck along its slide, slowing it; it stops at once at a wall. */
  function slide(wreck: Wreck, dt: number) {
    const motion = wreck.slide!;
    const center = wreck.body.translation();
    const next = { x: center.x + motion.vx * dt, y: center.y + motion.vy * dt };
    const angle = wreck.body.rotation() + motion.spin * dt;
    const blocked = cornersOf(wreck, next, angle).some((corner) => options.wallDistance(corner, 8) < 1);
    const drag = Math.exp(-SLIDE_DRAG * dt);
    motion.vx *= drag;
    motion.vy *= drag;
    motion.spin *= drag;

    if (!blocked) {
      wreck.body.setNextKinematicTranslation(next);
      wreck.body.setNextKinematicRotation(angle);
    }

    if (blocked || Math.hypot(motion.vx, motion.vy) < SLIDE_STOP) {
      wreck.slide = undefined;
      options.onChange(union(motion.from, boundsOf(wreck, blocked ? center : next)));
    }
  }

  /**
   * Breaks a wreck into a heap of pieces that tumble a little way and come to rest around where it
   * stood, with a puff of dust, and takes it away.
   */
  function crumble(wreck: Wreck) {
    const center = wreck.body.translation();
    const pieces = Math.min(Math.max(Math.round(wreck.area / 160), 3), 7);

    for (const fragment of shatter(wreck.field, pieces, MIN_PIECE_CELLS, options.random)) {
      launch(wreck, fragment, 45);
    }

    for (let index = 0; index < 14; index++) {
      const angle = options.random() * Math.PI * 2;
      const speed = 20 + options.random() * 60;
      renderer.spawn(PARTICLE_DUST, center.x, center.y, Math.cos(angle) * speed, Math.sin(angle) * speed, 0.5 + options.random() * 0.5, 1.2, DUST_COLOR);
    }

    for (let index = 0; index < 5; index++) {
      const angle = options.random() * Math.PI * 2;
      renderer.spawn(PARTICLE_SMOKE, center.x, center.y, Math.cos(angle) * 18, Math.sin(angle) * 18, 0.7 + options.random() * 0.4, 3 + options.random() * 2, NO_COLOR);
    }

    remove(wreck);
  }

  /** Sends a piece of a wreck off, away from the wreck's center and along the last hit. */
  function launch(wreck: Wreck, fragment: Fragment, speed: number) {
    const away = normalize({ x: fragment.centerX, y: fragment.centerY });
    const kick = (0.4 + options.random() * 0.6) * speed;
    const at = toWorld(wreck.body, { x: fragment.centerX, y: fragment.centerY });
    const outward = rotateOut(wreck.body, away);
    const push = wreck.push ?? { x: 0, y: 0 };

    options.onDebris({
      field: { ...fragment.field, originX: fragment.field.originX - fragment.centerX, originY: fragment.field.originY - fragment.centerY },
      x: at.x,
      y: at.y,
      angle: wreck.body.rotation(),
      vx: outward.x * kick + push.x * speed * 0.6,
      vy: outward.y * kick + push.y * speed * 0.6,
      color: wreck.color
    });
  }

  function remove(wreck: Wreck) {
    const index = wrecks.indexOf(wreck);

    if (index < 0) {
      return;
    }

    const bounds = boundsOf(wreck);
    wrecks.splice(index, 1);

    for (const collider of wreck.colliders) {
      owners.delete(collider.handle);
    }

    world.removeRigidBody(wreck.body);
    renderer.releaseField(wreck.slot);
    options.onChange(bounds);
  }
}

/** Wrecks as returned by `createWrecks`. */
export type Wrecks = ReturnType<typeof createWrecks>;

/** A wreck as `list` shows it: where it stands, how it is turned, whose tank it was and its armor area in square pixels. */
export type WreckView = { id: number; x: number; y: number; angle: number; team: string | undefined; area: number };

/** A wreck standing on the field. */
type Wreck = {
  id: number;
  body: RigidBody;
  field: DamageField;
  slot: number;
  color: readonly number[];
  team: string | undefined;
  colliders: Collider[];
  /** The colliders' boxes in the wreck's local coordinates. */
  boxes: { x: number; y: number; halfWidth: number; halfHeight: number }[];
  /** Solid area now and when left, in square pixels. */
  area: number;
  fullArea: number;
  /** Mass of the tank it was, 1 for the medium tank's. */
  mass: number;
  /** Distance from the center within which all of it lies, in pixels. */
  reach: number;
  changed: boolean;
  flash: number;
  /** Direction of the last hit, which pieces fly along. */
  push?: Point;
  /** A shove under way: velocity, turn rate and where the wreck stood before it. */
  slide: { vx: number; vy: number; spin: number; from: Bounds } | undefined;
};

/** Most wrecks standing at once: enough to change the look and the ways of a battlefield, few enough to keep it open. */
export const WRECK_LIMIT = 6;

/**
 * The blast: a hole of `BLAST_HOLE` px around the core and cracks `CRACK_WIDTH` px wide out to
 * `BLAST_REACH` px from it, past any hull's edge; wedges cut off fly at up to `BLAST_SPEED` px/s.
 */
const BLAST_HOLE = 7;
const BLAST_REACH = 40;
const CRACK_WIDTH = 1.2;
const BLAST_SPEED = 200;
/**
 * A wreck shot down to `CRUMBLE_AT` of its armor falls apart, and so does one with less than
 * `MIN_AREA` square pixels of it, a few percent of a hull, which would be no cover.
 */
export const CRUMBLE_AT = 0.4;
const MIN_AREA = 120;
const MIN_PIECE_CELLS = 6;
/** Wrecks are darker than the tanks they were, and charred all over. */
const WRECK_SHADE = 0.55;
const CHAR = 0.55;
const WRECK_HEIGHT = 6;
/**
 * A ram dents a wreck by `WRECK_DENT` px per unit of blow, and the rammer about as much as against
 * steel. A blow above `SHOVE_BLOW`, close to a medium tank's full speed, shoves the wreck at
 * `SHOVE_SPEED` px/s per unit over, a few pixels before it grinds to a stop.
 */
const WRECK_DENT = 0.02;
const WRECK_HARDNESS = 0.9;
const SHOVE_BLOW = 45;
const SHOVE_SPEED = 6;
/** Fastest shove, about 30 px before the wreck grinds to a stop, however light it is. */
const MAX_SHOVE = 270;
/** Turn rate of a shove per pixel of arm and pixel per second of speed. */
const SHOVE_TURN = 0.0012;
const SLIDE_DRAG = 9;
const SLIDE_STOP = 4;
const DUST_COLOR = [0.3, 0.29, 0.27, 1];
const NO_COLOR = [0, 0, 0, 0];

/**
 * Blows a hull open around its core: a ragged hole where the core was, and one or two pairs of
 * cracks from the hole out past the edge, each pair cutting off a wedge of armor.
 */
function blast(field: DamageField, core: Point, random: () => number) {
  carve(field, core, BLAST_HOLE, 0.45, random() * 1000);
  const wedges = random() < 0.5 ? 1 : 2;
  let angle = random() * Math.PI * 2;

  for (let wedge = 0; wedge < wedges; wedge++) {
    const width = 0.6 + random() * 0.5;

    for (const side of [angle, angle + width]) {
      crack(field, core, { x: core.x + Math.cos(side) * BLAST_REACH, y: core.y + Math.sin(side) * BLAST_REACH }, CRACK_WIDTH);
    }

    angle += width + 0.8 + random() * 1.5;
  }
}

/** Burns a hull out: no core any more and soot all over, thicker in patches. */
function char(field: DamageField, random: () => number) {
  const phase = random() * 100;

  for (let row = 0; row < field.rows; row++) {
    for (let col = 0; col < field.cols; col++) {
      const index = (row * field.cols + col) * CHANNELS;
      const x = field.originX + col * field.cell;
      const y = field.originY + row * field.cell;
      const patch = 0.5 + 0.5 * Math.sin(x * 0.31 + phase) * Math.cos(y * 0.27 + phase * 1.7);
      field.data[index + 2] = FAR;
      field.data[index + 3] = Math.max(field.data[index + 3], CHAR + 0.3 * patch);
    }
  }
}

/** World bounds of a wreck, at its position or at `at`, with a little room. */
function boundsOf(wreck: Wreck, at = wreck.body.translation()): Bounds {
  return { minX: at.x - wreck.reach, minY: at.y - wreck.reach, maxX: at.x + wreck.reach, maxY: at.y + wreck.reach };
}

/** Distance from a field's local origin within which all of its grid lies, in pixels. */
function reachOf(field: DamageField) {
  const x = Math.max(Math.abs(field.originX), Math.abs(field.originX + field.cols * field.cell));
  const y = Math.max(Math.abs(field.originY), Math.abs(field.originY + field.rows * field.cell));
  return Math.hypot(x, y);
}

/**
 * Corners of a wreck's solid boxes, as they would be with its center at `at` turned by `angle`;
 * just `at` for a wreck without boxes.
 */
function cornersOf(wreck: Wreck, at: Point, angle: number) {
  if (wreck.boxes.length === 0) {
    return [at];
  }

  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const box of wreck.boxes) {
    minX = Math.min(minX, box.x - box.halfWidth);
    minY = Math.min(minY, box.y - box.halfHeight);
    maxX = Math.max(maxX, box.x + box.halfWidth);
    maxY = Math.max(maxY, box.y + box.halfHeight);
  }

  return [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: minX, y: maxY },
    { x: maxX, y: maxY }
  ].map((corner) => ({ x: at.x + corner.x * cos - corner.y * sin, y: at.y + corner.x * sin + corner.y * cos }));
}

function union(a: Bounds, b: Bounds): Bounds {
  return { minX: Math.min(a.minX, b.minX), minY: Math.min(a.minY, b.minY), maxX: Math.max(a.maxX, b.maxX), maxY: Math.max(a.maxY, b.maxY) };
}

/** Signed distance to an axis-aligned box of half size `halfX` x `halfY` around the origin. */
function boxDistance(x: number, y: number, halfX: number, halfY: number) {
  const qx = Math.abs(x) - halfX;
  const qy = Math.abs(y) - halfY;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0);
}

function toLocal(body: RigidBody, point: Point) {
  const center = body.translation();
  return rotateInto(body, { x: point.x - center.x, y: point.y - center.y });
}

function toWorld(body: RigidBody, local: Point) {
  const center = body.translation();
  const out = rotateOut(body, local);
  return { x: center.x + out.x, y: center.y + out.y };
}

function rotateOut(body: RigidBody, vector: Point) {
  const angle = body.rotation();
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return { x: vector.x * cos - vector.y * sin, y: vector.x * sin + vector.y * cos };
}

function rotateInto(body: RigidBody, vector: Point) {
  const angle = body.rotation();
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return { x: vector.x * cos + vector.y * sin, y: -vector.x * sin + vector.y * cos };
}

function normalize(vector: Point) {
  const length = Math.hypot(vector.x, vector.y) || 1;
  return { x: vector.x / length, y: vector.y / length };
}
