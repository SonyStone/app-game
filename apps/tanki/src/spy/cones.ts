import { CHANNELS, FAR, type DamageField } from '../damage/field';
import { KIND_FIELD, SLOT_CELLS, type createRangeRenderer } from '../damage/renderer';
import type { SightFan } from './visibility';

type Renderer = ReturnType<typeof createRangeRenderer>;

/**
 * Draws what tanks see as translucent fans on the floor, cut off where walls and crates stop
 * their sight: pale while the tank sees nothing, warming toward red as its suspicion rises, red
 * while it sees the spider. The fans lie under everything on the floor.
 *
 * Each fan is a distance field rebuilt every frame in the tank's slot, its cells as coarse as the
 * fan's size needs to fit a slot. Reserves `count` field slots for as long as the renderer lives.
 */
export function createConeDraw(renderer: Renderer, count: number) {
  const slots = Array.from({ length: count }, () => {
    const slot = renderer.allocateField();

    if (slot === undefined) {
      throw new Error('The sandbox ran out of field slots for its sight cones.');
    }

    return { slot, data: new Float32Array(SLOT_CELLS * CHANNELS) };
  });

  return {
    /**
     * Adds tank `index`'s fan to this frame; call between the floor and the bodies.
     *
     * @param suspicion - How sure the tank is that it sees the spider, 0-1.
     * @param seeing - The tank sees the spider right now.
     */
    draw(index: number, fan: SightFan, suspicion: number, seeing: boolean) {
      const { slot, data } = slots[index];
      const field = fillFan(fan, data);
      renderer.uploadField(slot, field);
      const warmth = seeing ? 1 : suspicion * 0.7;
      const color = CALM.map((channel, at) => channel + (SEEING[at] - channel) * warmth);
      const facing = fan.angles[0] + fan.half;
      renderer.addBody({
        kind: KIND_FIELD,
        originX: field.originX,
        originY: field.originY,
        cell: field.cell,
        cols: field.cols,
        rows: field.rows,
        slot,
        x: fan.center.x,
        y: fan.center.y,
        angle: facing,
        color,
        alpha: CALM_ALPHA + (SEEING_ALPHA - CALM_ALPHA) * warmth,
        height: 0
      });
    }
  };
}

const CALM = [1, 0.96, 0.78];
const SEEING = [1, 0.28, 0.22];
const CALM_ALPHA = 0.14;
const SEEING_ALPHA = 0.3;

/**
 * Writes the distance field of `fan` into `data`, in the fan's own axes: +x along the middle of
 * the fan, the apex at the origin. Inside the fan the distance is to the nearer of its sides and
 * the end of the ray at that bearing, interpolated between rays; good enough to draw.
 */
function fillFan(fan: SightFan, data: Float32Array): DamageField {
  const facing = fan.angles[0] + fan.half;
  let minX = 0;
  let maxX = 0;
  let minY = 0;
  let maxY = 0;

  for (const [index, angle] of fan.angles.entries()) {
    const x = Math.cos(angle - facing) * fan.reaches[index];
    const y = Math.sin(angle - facing) * fan.reaches[index];
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }

  const margin = 4;
  const area = (maxX - minX + margin * 2) * (maxY - minY + margin * 2);
  const cell = Math.max(MIN_CELL, Math.sqrt(area / (SLOT_CELLS * 0.95)));
  const cols = Math.min(Math.ceil((maxX - minX + margin * 2) / cell), SLOT_CELLS);
  const rows = Math.min(Math.ceil((maxY - minY + margin * 2) / cell), Math.floor(SLOT_CELLS / cols));
  const originX = minX - margin + cell / 2;
  const originY = minY - margin + cell / 2;
  const last = fan.angles.length - 1;
  const allAround = fan.half >= Math.PI - 1e-6;

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x = originX + col * cell;
      const y = originY + row * cell;
      const radius = Math.hypot(x, y);
      const bearing = Math.atan2(y, x);
      const side = allAround ? -FAR : radius * Math.sin(Math.min(Math.max(Math.abs(bearing) - fan.half, -Math.PI / 2), Math.PI / 2));
      const along = Math.min(Math.max(((bearing + fan.half) / (fan.half * 2)) * last, 0), last);
      const below = Math.floor(along);
      const above = Math.min(below + 1, last);
      const reach = fan.reaches[below] + (fan.reaches[above] - fan.reaches[below]) * (along - below);
      const offset = (row * cols + col) * CHANNELS;
      data[offset] = Math.max(side, radius - reach);
      data[offset + 1] = FAR;
      data[offset + 2] = FAR;
      data[offset + 3] = 0;
    }
  }

  return { cols, rows, cell, originX, originY, data: data.subarray(0, cols * rows * CHANNELS) };
}

/** Finest cell of a fan's field, in pixels: sharp enough on the floor and cheap to rebuild. */
const MIN_CELL = 2;
