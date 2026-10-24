import { createField, FAR, type DamageField } from '../damage/field';
import { KIND_FIELD, KIND_RECT, type createRangeRenderer } from '../damage/renderer';
import type { KothMap } from './map';
import type { CaptureState, TeamId } from './rules';

type Renderer = ReturnType<typeof createRangeRenderer>;

/**
 * Markings on the king of the hill floor: each base as a patch of its team's color and the
 * control point as a tinted disc with a ring around its rim. The disc and ring take the owner's
 * color, and a second ring fills clockwise from the top in the capturing team's color as the
 * capture progresses.
 *
 * Reserves three field slots for as long as the renderer lives; the progress ring is uploaded
 * again only when the capture moves visibly.
 */
export function createScenery(renderer: Renderer, map: KothMap, colors: Record<TeamId, readonly number[]>) {
  const { point } = map;
  const disc = upload(createDiscField(point.radius));
  const ring = upload(createRingField(point.radius, 1));
  const progressSlot = reserve();
  let shown = { sweep: -1, capturer: undefined as TeamId | undefined };
  let progressField = createRingField(point.radius, 0);

  return {
    /** Adds the bases and the point to this frame; call between the floor and the bodies. */
    draw(capture: CaptureState) {
      for (const team of ['red', 'blue'] as const) {
        const { zone } = map.bases[team];
        renderer.addBody({
          kind: KIND_RECT,
          x: zone.x,
          y: zone.y,
          angle: 0,
          originX: -zone.halfWidth + 0.5,
          originY: -zone.halfHeight + 0.5,
          cell: 1,
          cols: zone.halfWidth * 2,
          rows: zone.halfHeight * 2,
          color: colors[team],
          alpha: BASE_ALPHA
        });
      }

      const owner = capture.owner ? colors[capture.owner] : NEUTRAL;
      renderer.addBody({ ...fieldDraw(disc.field, disc.slot), x: point.x, y: point.y, angle: 0, color: owner, alpha: DISC_ALPHA, height: 0 });
      renderer.addBody({ ...fieldDraw(ring.field, ring.slot), x: point.x, y: point.y, angle: 0, color: owner, height: 0 });

      const sweep = Math.round(capture.progress * 200) / 200;

      if (sweep !== shown.sweep || capture.capturer !== shown.capturer) {
        shown = { sweep, capturer: capture.capturer };
        progressField = createRingField(point.radius, sweep);
        renderer.uploadField(progressSlot, progressField);
      }

      if (capture.capturer && sweep > 0) {
        renderer.addBody({
          ...fieldDraw(progressField, progressSlot),
          x: point.x,
          y: point.y,
          angle: 0,
          color: colors[capture.capturer],
          height: 0
        });
      }
    }
  };

  function reserve() {
    const slot = renderer.allocateField();

    if (slot === undefined) {
      throw new Error('The scenery ran out of field slots.');
    }

    return slot;
  }

  function upload(field: DamageField) {
    const slot = reserve();
    renderer.uploadField(slot, field);
    return { field, slot };
  }
}

const BASE_ALPHA = 0.28;
const DISC_ALPHA = 0.22;
const NEUTRAL = [0.86, 0.86, 0.84];
/** Width of the rim ring in pixels. */
const RING_WIDTH = 6;
const CELL = 2.5;

/** The whole point as one disc. */
function createDiscField(radius: number) {
  return createField(bounds(radius), CELL, (x, y) => [Math.hypot(x, y) - radius, FAR, FAR, 0]);
}

/**
 * The rim ring of the point, cut to the share `sweep` of a full turn clockwise from the top: 1 is
 * the whole ring, 0 none of it.
 */
function createRingField(radius: number, sweep: number) {
  const middle = radius - RING_WIDTH / 2;

  return createField(bounds(radius), CELL, (x, y) => {
    const band = Math.abs(Math.hypot(x, y) - middle) - RING_WIDTH / 2;
    return [Math.max(band, sectorDistance(x, y, sweep * Math.PI * 2)), FAR, FAR, 0];
  });
}

/**
 * Signed distance to the sector from the top, clockwise on screen, spanning `angle` radians:
 * negative inside, from the nearer of its two edges.
 */
function sectorDistance(x: number, y: number, angle: number) {
  if (angle >= Math.PI * 2 - 1e-6) {
    return -FAR;
  }

  if (angle <= 0) {
    return FAR;
  }

  const radius = Math.hypot(x, y);
  // Clockwise on screen from the top, with y pointing down.
  const turned = (Math.atan2(x, -y) + Math.PI * 2) % (Math.PI * 2);
  const toEdge = (edge: number) => {
    const delta = Math.abs(((turned - edge + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
    return delta < Math.PI / 2 ? radius * Math.sin(delta) : radius;
  };
  const edges = Math.min(toEdge(0), toEdge(angle));

  return turned <= angle ? -edges : edges;
}

function bounds(radius: number) {
  const reach = radius + 3;
  return { minX: -reach, minY: -reach, maxX: reach, maxY: reach };
}

function fieldDraw(field: DamageField, slot: number) {
  return { kind: KIND_FIELD, originX: field.originX, originY: field.originY, cell: field.cell, cols: field.cols, rows: field.rows, slot };
}
