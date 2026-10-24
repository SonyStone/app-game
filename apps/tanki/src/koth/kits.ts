import type { Tank } from '../arena/bodies';
import type { Combat } from '../damage/combat';
import { createField, FAR, type DamageField } from '../damage/field';
import { KIND_FIELD, type createRangeRenderer } from '../damage/renderer';
import type { HullSpec } from '../damage/shapes';
import type { KitPlacement } from './map';

type Renderer = ReturnType<typeof createRangeRenderer>;

/**
 * Repair kits lying about the map, after the health kits of Team Fortress 2: a tank whose hull
 * touches one has its armor mended at once, by `KIT_REPAIR` of its damage, and the kit comes back
 * `KIT_RESPAWN` seconds later. The side of the hull that touched the kit mends more and the far
 * side less, about as much in all, so a tank can back its holed rear onto a kit. A tank with whole
 * armor drives over a kit without taking it. Each kit is a green box with a white cross on a pale
 * pad that stays while the kit is away.
 *
 * Reserves five field slots for as long as the renderer lives.
 */
export function createKits(renderer: Renderer, placements: readonly KitPlacement[], combat: Combat) {
  const kits: Kit[] = placements.map((placement) => ({ ...placement, readyAt: 0 }));
  const pad = upload(createDiscField(PAD_RADIUS));
  const looks = {
    small: { box: upload(createBoxField(KIT_SIZE.small)), cross: upload(createCrossField(KIT_SIZE.small)) },
    large: { box: upload(createBoxField(KIT_SIZE.large)), cross: upload(createCrossField(KIT_SIZE.large)) }
  };
  let pickups = 0;

  return {
    /** Every kit, live: where it lies, its size and the match time it is back, 0 while it lies there. */
    kits: kits as readonly Readonly<Kit>[],

    /** Kits taken since the match began. */
    get pickups() {
      return pickups;
    },

    /**
     * Lets every damaged tank on a kit take it, at match time `time`.
     *
     * @returns The tanks that took a kit.
     */
    step(time: number, tanks: readonly Tank[]) {
      const takers: Tank[] = [];

      for (const kit of kits) {
        if (kit.readyAt > time) {
          continue;
        }

        const taker = tanks.find((tank) => touches(tank, combat.hullOf(tank), kit) && combat.armorLeft(tank) < WHOLE);

        if (taker) {
          combat.repair(taker, KIT_REPAIR[kit.size], kit);
          kit.readyAt = time + KIT_RESPAWN;
          pickups++;
          takers.push(taker);
        }
      }

      return takers;
    },

    /** Adds the pads and the kits lying on them to this frame; call between the floor and the bodies. */
    draw(time: number) {
      for (const [index, kit] of kits.entries()) {
        renderer.addBody({ ...fieldDraw(pad.field, pad.slot), x: kit.x, y: kit.y, angle: 0, color: PAD_COLOR, alpha: PAD_ALPHA, height: 0 });

        if (kit.readyAt <= time) {
          const look = looks[kit.size];
          // Kits turn slowly, so they catch the eye.
          const angle = time * TURN_SPEED + index;
          renderer.addBody({ ...fieldDraw(look.box.field, look.box.slot), x: kit.x, y: kit.y, angle, color: KIT_COLOR, height: KIT_HEIGHT });
          renderer.addBody({ ...fieldDraw(look.cross.field, look.cross.slot), x: kit.x, y: kit.y, angle, color: CROSS_COLOR, height: KIT_HEIGHT });
        }
      }
    },

    /** Lays every kit out again and forgets the pickups, for a new match. */
    reset() {
      pickups = 0;

      for (const kit of kits) {
        kit.readyAt = 0;
      }
    }
  };

  function upload(field: DamageField) {
    const slot = renderer.allocateField();

    if (slot === undefined) {
      throw new Error('The repair kits ran out of field slots.');
    }

    renderer.uploadField(slot, field);
    return { field, slot };
  }
}

/** Repair kits as returned by `createKits`. */
export type Kits = ReturnType<typeof createKits>;

/** A repair kit on the map and the match time it is back, 0 while it lies there. */
export type Kit = KitPlacement & { readyAt: number };

/**
 * Share of a tank's damage a kit mends: a small kit closes a hole onto the core and a good part of
 * the rest, about what a few hits chip; a large kit mends half, as Team Fortress 2's medium kit
 * heals, so only the base makes a tank whole again.
 */
export const KIT_REPAIR = { small: 0.3, large: 0.5 };

/** Seconds until a taken kit is back, as in Team Fortress 2. */
export const KIT_RESPAWN = 10;

/**
 * A tank takes a kit when the outline of its hull, of whatever class, comes within `PICKUP_REACH`
 * px of the kit's center, as close as the edge of a large kit's box.
 */
export const PICKUP_REACH = 9;

/** Armor share at and above which a tank leaves a kit lying. */
const WHOLE = 0.999;
/** Side of a kit's box in pixels. */
const KIT_SIZE = { small: 15, large: 22 };
const PAD_RADIUS = 20;
const PAD_ALPHA = 0.3;
const KIT_HEIGHT = 3;
const TURN_SPEED = 0.6;
const KIT_COLOR = [0.3, 0.62, 0.32];
const CROSS_COLOR = [0.97, 0.97, 0.93];
const PAD_COLOR = [0.9, 0.95, 0.88];

/** Whether the outline of `tank`'s hull, of `hull`'s size, touches `kit`; a destroyed tank's never does. */
function touches(tank: Tank, hull: HullSpec | undefined, kit: KitPlacement) {
  if (!hull) {
    return false;
  }

  const center = tank.hull.translation();
  const angle = tank.hull.rotation();
  const dx = kit.x - center.x;
  const dy = kit.y - center.y;
  const along = dx * Math.cos(angle) + dy * Math.sin(angle);
  const across = -dx * Math.sin(angle) + dy * Math.cos(angle);
  return roundedBox(along, across, hull.halfLength, hull.halfWidth, 0) < PICKUP_REACH;
}

/** A box of side `size` with rounded corners. */
function createBoxField(size: number) {
  const half = size / 2;
  return createField(bounds(half + 2), CELL, (x, y) => [roundedBox(x, y, half, half, 2), FAR, FAR, 0]);
}

/** The cross on top of a box of side `size`: two bars, each a fifth of the box wide. */
function createCrossField(size: number) {
  const arm = size * 0.32;
  const bar = size * 0.1;
  return createField(bounds(size / 2 + 2), CELL, (x, y) => [Math.min(roundedBox(x, y, arm, bar, 0.5), roundedBox(x, y, bar, arm, 0.5)), FAR, FAR, 0]);
}

function createDiscField(radius: number) {
  return createField(bounds(radius + 2), 1, (x, y) => [Math.hypot(x, y) - radius, FAR, FAR, 0]);
}

const CELL = 0.5;

function bounds(reach: number) {
  return { minX: -reach, minY: -reach, maxX: reach, maxY: reach };
}

/** Signed distance to a box of half size `halfX` x `halfY` with rounded corners. */
function roundedBox(x: number, y: number, halfX: number, halfY: number, radius: number) {
  const qx = Math.abs(x) - halfX + radius;
  const qy = Math.abs(y) - halfY + radius;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - radius;
}

function fieldDraw(field: DamageField, slot: number) {
  return { kind: KIND_FIELD, originX: field.originX, originY: field.originY, cell: field.cell, cols: field.cols, rows: field.rows, slot };
}
