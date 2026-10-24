import type { createBurning } from './burning';
import { createField, FAR } from './field';
import { KIND_FIELD, type createRangeRenderer } from './renderer';

type Renderer = ReturnType<typeof createRangeRenderer>;

/**
 * A campfire for testing light and shadow: a ring of stones around crossed logs that burn for
 * good. The fire itself, with its smoke and flickering light, comes from `burning`; its light
 * hangs at flame height, lower than turrets, so tanks around the fire throw long shadows.
 *
 * Reserves two field slots for its stones and logs for as long as the renderer lives.
 *
 * @param at - Center of the fire in world coordinates.
 */
export function createCampfire(renderer: Renderer, burning: ReturnType<typeof createBurning>, at: { x: number; y: number }) {
  const stones = createStonesField();
  const logs = createLogsField();
  const stonesSlot = renderer.allocateField();
  const logsSlot = renderer.allocateField();

  if (stonesSlot === undefined || logsSlot === undefined) {
    throw new Error('The campfire ran out of field slots.');
  }

  renderer.uploadField(stonesSlot, stones);
  renderer.uploadField(logsSlot, logs);
  burning.ignite(at, FLAME_SPREAD, Infinity, LIGHT_RADIUS, LIGHT_INTENSITY);

  return {
    /** Adds the stones and the logs to this frame; call after the floor. */
    draw() {
      renderer.addBody({ ...fieldDraw(stones, stonesSlot), x: at.x, y: at.y, angle: 0, color: STONE_COLOR, height: 3 });
      renderer.addBody({ ...fieldDraw(logs, logsSlot), x: at.x, y: at.y, angle: 0, color: LOG_COLOR, height: 4 });
    }
  };
}

/** Light reach in world pixels. */
const LIGHT_RADIUS = 170;
const LIGHT_INTENSITY = 0.42;
/** Flames stay on the logs. */
const FLAME_SPREAD = 4;
const STONE_COLOR = [0.4, 0.4, 0.39];
const LOG_COLOR = [0.47, 0.3, 0.17];

/** Seven stones in a ring around the fire. */
function createStonesField() {
  const stones = Array.from({ length: 7 }, (_, index) => {
    const angle = (index / 7) * Math.PI * 2 + 0.3;
    return { x: Math.cos(angle) * 11, y: Math.sin(angle) * 11, radius: 3 + (index % 3) * 0.4 };
  });

  return createField({ minX: -16, minY: -16, maxX: 16, maxY: 16 }, 0.5, (x, y) => {
    const armor = Math.min(...stones.map((stone) => Math.hypot(x - stone.x, y - stone.y) - stone.radius));
    return [armor, FAR, FAR, 0];
  });
}

/** Two crossed logs, charred toward the middle where they burn. */
function createLogsField() {
  return createField({ minX: -12, minY: -12, maxX: 12, maxY: 12 }, 0.5, (x, y) => {
    const armor = Math.min(log(x, y, 0.5), log(x, y, -0.6));
    const char = Math.max(1 - Math.hypot(x, y) / 7, 0);
    return [armor, FAR, FAR, char];
  });
}

/** Signed distance to a log 18 x 4.4 px turned by `angle`. */
function log(x: number, y: number, angle: number) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const u = Math.abs(x * cos + y * sin) - 9 + 2;
  const v = Math.abs(-x * sin + y * cos) - 2.2 + 2;
  return Math.hypot(Math.max(u, 0), Math.max(v, 0)) + Math.min(Math.max(u, v), 0) - 2;
}

function fieldDraw(field: ReturnType<typeof createField>, slot: number) {
  return { kind: KIND_FIELD, originX: field.originX, originY: field.originY, cell: field.cell, cols: field.cols, rows: field.rows, slot };
}
