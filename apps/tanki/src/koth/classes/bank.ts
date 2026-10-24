import type { WallPlacement } from '../../damage/combat';
import { sightClear, type NavGrid } from '../navigation';

type Point = { x: number; y: number };

/**
 * A bank shot for a grenade from `from` to `to`, off one face of one of `walls`, as a Demoman
 * banks pipes around a corner: the direction to throw in and how far, `reach`, to throw so that
 * the grenade, slowed by its bounce to `rebound` of its speed, comes down at `to`. Only faces
 * that both points lie in front of count, and both legs must pass every wall. Returns the bank
 * with the shortest throw within `maxReach`, or `undefined` when there is none.
 */
export function findBankShot(grid: NavGrid, walls: readonly WallPlacement[], from: Point, to: Point, maxReach: number, rebound: number) {
  let best: { angle: number; reach: number; at: Point } | undefined;

  for (const wall of walls) {
    if (Math.hypot(wall.x - from.x, wall.y - from.y) - Math.max(wall.halfWidth, wall.halfHeight) > maxReach) {
      continue;
    }

    for (const face of facesOf(wall)) {
      const ahead = (point: Point) => (point.x - face.a.x) * face.normal.x + (point.y - face.a.y) * face.normal.y;
      const fromAhead = ahead(from);
      const toAhead = ahead(to);

      if (fromAhead <= 0 || toAhead <= 0) {
        continue;
      }

      // Aim at the target's mirror image behind the face; the throw meets the face on the way.
      const mirror = { x: to.x - 2 * toAhead * face.normal.x, y: to.y - 2 * toAhead * face.normal.y };
      const t = fromAhead / (fromAhead + toAhead);
      const at = { x: from.x + (mirror.x - from.x) * t, y: from.y + (mirror.y - from.y) * t };
      const along = (at.x - face.a.x) * face.tangent.x + (at.y - face.a.y) * face.tangent.y;

      if (along < FACE_MARGIN || along > face.length - FACE_MARGIN) {
        continue;
      }

      const off = { x: at.x + face.normal.x * CLEARANCE, y: at.y + face.normal.y * CLEARANCE };
      const first = Math.hypot(at.x - from.x, at.y - from.y);
      const second = Math.hypot(to.x - at.x, to.y - at.y);
      const reach = first + second / rebound;

      if (reach > maxReach || (best && reach >= best.reach) || !sightClear(grid, from, off) || !sightClear(grid, off, to)) {
        continue;
      }

      best = { angle: Math.atan2(at.y - from.y, at.x - from.x), reach, at };
    }
  }

  return best;
}

/** The four faces of a wall box, each from `a` along `tangent` for `length` pixels, with its outward normal. */
function facesOf(wall: WallPlacement) {
  const angle = wall.rotation ?? 0;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const toWorld = (x: number, y: number) => ({ x: wall.x + x * cos - y * sin, y: wall.y + x * sin + y * cos });
  const corners = [toWorld(-wall.halfWidth, -wall.halfHeight), toWorld(wall.halfWidth, -wall.halfHeight), toWorld(wall.halfWidth, wall.halfHeight), toWorld(-wall.halfWidth, wall.halfHeight)];

  return corners.map((a, index) => {
    const b = corners[(index + 1) % 4];
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    const tangent = { x: (b.x - a.x) / length, y: (b.y - a.y) / length };
    // Corners run clockwise on screen, y down, so the outward normal is the tangent turned back a quarter.
    return { a, length, tangent, normal: { x: tangent.y, y: -tangent.x } };
  });
}

/** A bank must meet a face at least this far from its ends, where a grenade could clip the corner. */
const FACE_MARGIN = 12;
/** How far off the face the legs of a bank are checked against walls, past the face itself. */
const CLEARANCE = 6;
