import { createField, FAR, type DamageField } from '../damage/field';
import { KIND_FIELD, type createRangeRenderer } from '../damage/renderer';
import type { Point3 } from './legs';
import { BUILDS, type Spider } from './spider';
import type { Gait } from './variants';

type Renderer = ReturnType<typeof createRangeRenderer>;

/**
 * Draws a spider in the style of the tanks: a body in the team's color with a black outline,
 * dark eyes and a stripe on its back, over four legs of two bones each. The renderer draws
 * bodies flat, so every bone is drawn as two halves at their own heights, which lets the sun
 * throw its shadow from the high knee down to the foot on the floor.
 *
 * The body's shape is uploaded once per build; each half bone is a capsule whose length follows
 * the bone as the camera sees it from above, uploaded again every frame. Reserves a field slot
 * for each build's body and for every bone, for as long as the renderer lives. The bones are
 * shared, so it draws one spider per frame.
 */
export function createSpiderDraw(renderer: Renderer) {
  const bodies = { low: uploadBody('low'), tall: uploadBody('tall') };
  const bones = Array.from({ length: 8 }, () => ({ slot: reserve(renderer), field: undefined as DamageField | undefined }));

  return {
    /**
     * Adds `spider` to this frame, its legs below its body.
     *
     * @param color - Body color, components 0-1; the legs take a darker shade of it.
     * @param alpha - Overall opacity, which also thins its shadow. The parts overlap, so a
     *   translucent spider shows darker joints.
     */
    draw(spider: Spider, color: readonly number[], alpha = 1) {
      const build = spider.build;
      const legColor = color.map((channel) => channel * LEG_SHADE);

      for (const [index, leg] of spider.pose().entries()) {
        addBone(bones[index * 2], leg.hip, leg.knee, build.femurRadius, legColor, alpha);
        addBone(bones[index * 2 + 1], leg.knee, leg.foot, build.tibiaRadius, legColor, alpha);
      }

      const position = spider.position;
      const shape = bodies[spider.gait];
      renderer.addBody({
        ...fieldDraw(shape.field, shape.slot),
        x: position.x,
        y: position.y,
        angle: spider.facing,
        color,
        alpha,
        height: drawnHeight(spider.height)
      });
    }
  };

  /** Draws the bone from `from` to `to` as two capsules, each at the height of its middle. */
  function addBone(bone: (typeof bones)[number], from: Point3, to: Point3, radius: number, color: readonly number[], alpha: number) {
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    const half = length / 2;
    bone.field = createCapsuleField(half, radius);
    renderer.uploadField(bone.slot, bone.field);
    const angle = Math.atan2(to.y - from.y, to.x - from.x);

    for (const part of [0, 1]) {
      const start = { x: from.x + (to.x - from.x) * part * 0.5, y: from.y + (to.y - from.y) * part * 0.5 };
      const middle = from.z + (to.z - from.z) * (part * 0.5 + 0.25);
      renderer.addBody({ ...fieldDraw(bone.field, bone.slot), x: start.x, y: start.y, angle, color, alpha, height: drawnHeight(middle) });
    }
  }

  function uploadBody(gait: Gait) {
    const slot = reserve(renderer);
    const field = createBodyField(gait);
    renderer.uploadField(slot, field);
    return { slot, field };
  }
}

/** Shade of the body color the legs take. */
const LEG_SHADE = 0.55;
/**
 * The renderer throws sun shadows from bodies no taller than 10 px; anything higher is drawn at
 * that height, so a knee over a hull still casts its full shadow.
 */
const MAX_DRAWN_HEIGHT = 10;

function drawnHeight(height: number) {
  return Math.min(Math.max(height, 0.5), MAX_DRAWN_HEIGHT);
}

function reserve(renderer: Renderer) {
  const slot = renderer.allocateField();

  if (slot === undefined) {
    throw new Error('The sandbox ran out of field slots for its spiders.');
  }

  return slot;
}

/**
 * A spider's body, front along +x: a round head and a larger oval abdomen behind it, melted
 * together, with two dark eyes and a stripe down the abdomen.
 */
function createBodyField(gait: Gait) {
  const { head, abdomen } = BUILDS[gait];
  const headX = head * 0.8;
  const abdomenX = -abdomen.x * 0.95;
  const reach = { minX: abdomenX - abdomen.x - 2, maxX: headX + head + 2, half: abdomen.y + 2 };

  return createField({ minX: reach.minX, minY: -reach.half, maxX: reach.maxX, maxY: reach.half }, 0.4, (x, y) => {
    const front = Math.hypot(x - headX, y) - head;
    const back = ellipse(x - abdomenX, y, abdomen.x, abdomen.y);
    const armor = smoothUnion(front, back, head * 0.5);
    const eyes = Math.min(Math.hypot(x - headX - head * 0.45, y - head * 0.42), Math.hypot(x - headX - head * 0.45, y + head * 0.42)) - head * 0.27;
    const stripe = Math.abs(y) + Math.max(Math.abs(x - abdomenX) - abdomen.x * 0.55, 0) - abdomen.y * 0.16;

    return [armor, Math.min(eyes, stripe), FAR, 0];
  });
}

/** A capsule of `radius` along +x from 0 to `length`. */
function createCapsuleField(length: number, radius: number) {
  const margin = radius + 1;

  return createField({ minX: -margin, minY: -margin, maxX: length + margin, maxY: margin }, 0.4, (x, y) => {
    const along = Math.min(Math.max(x, 0), length);
    return [Math.hypot(x - along, y) - radius, FAR, FAR, 0];
  });
}

/** Approximate signed distance to an ellipse of half axes `rx` and `ry`, after Inigo Quilez. */
function ellipse(x: number, y: number, rx: number, ry: number) {
  const k0 = Math.hypot(x / rx, y / ry);
  const k1 = Math.hypot(x / (rx * rx), y / (ry * ry));
  return k1 > 1e-6 ? (k0 * (k0 - 1)) / k1 : -Math.min(rx, ry);
}

function smoothUnion(a: number, b: number, k: number) {
  const h = Math.min(Math.max(0.5 + (0.5 * (b - a)) / k, 0), 1);
  return b + (a - b) * h - k * h * (1 - h);
}

function fieldDraw(field: DamageField, slot: number) {
  return { kind: KIND_FIELD, originX: field.originX, originY: field.originY, cell: field.cell, cols: field.cols, rows: field.rows, slot };
}
