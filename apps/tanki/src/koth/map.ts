import type { CombatLayout, Placement, WallPlacement } from '../damage/combat';
import type { TeamId } from './rules';

type Point = { x: number; y: number };

/** A team's base: the zone where its tanks spawn and mend their armor, and the spots they spawn on. */
export type KothBase = {
  /** Axis-aligned zone around its center. */
  zone: { x: number; y: number; halfWidth: number; halfHeight: number };
  spawns: readonly Placement[];
};

/**
 * Places a team gathers at before a coordinated push: behind cover in each of the three lanes on
 * its own side of the point.
 */
export type KothLanes = { center: Point; north: Point; south: Point };

/** Everything the match needs to know about a map. */
export type KothMap = CombatLayout & {
  point: Point & { radius: number };
  bases: Record<TeamId, KothBase>;
  lanes: Record<TeamId, KothLanes>;
};

/**
 * The king of the hill map, laid out after the king of the hill maps of Team Fortress 2 and
 * scaled to a hull of 40 px: about ten seconds of driving from a spawn to the point, as there.
 *
 * - Each team spawns in a room at a short end with three doors: two lead into the hall toward the
 *   point, behind a shield that hides the room from the hall, and one leads to the north street.
 * - Three routes lead to the point: the hall and the approach in the middle, and the north and
 *   south streets, which are longer. The north street joins the approach; the south street enters
 *   the plaza from below, through an entry the teams share.
 * - Buildings, teeth jutting into the streets and pillars in the hall break up the lines of fire:
 *   no straight line across the drivable ground is much longer than the 700 px a shell flies,
 *   except lines across the point itself.
 * - The point is open, with a fin between the teams' bays north of it, a post at the edge of each
 *   bay and walls beside and below it for cover.
 *
 * The teams' halves are mirror images. The north and south of a half differ, so that the entries
 * of the two teams never face each other across the point. Kept as plain data so a map from the
 * editor can replace it later.
 */
export const KOTH_MAP: KothMap = createMap();

function createMap(): KothMap {
  // Red's half; blue's is its mirror image.
  const red: WallPlacement[] = [
    // Spawn room: a pillar beside its north door, the building below it, the front wall with the
    // middle and south doors, and the shield in front of the doors.
    block(-1810, -835, -1700, -200),
    block(-1810, 200, -1460, 835),
    block(-1600, -230, -1575, -50),
    block(-1600, 50, -1575, 100),
    block(-1480, -110, -1455, 110),
    // Caps over the passages from the spawn to the streets.
    block(-1810, -835, -1550, -690),
    block(-1470, 680, -1260, 835),
    // Buildings along the hall in front of the spawn, and the teeth and pillar in the hall.
    block(-1600, -560, -660, -220),
    block(-1340, 220, -650, 560),
    block(-1350, 60, -1290, 230),
    block(-1190, -230, -1130, -40),
    block(-1000, -110, -940, 110),
    block(-860, -230, -800, -40),
    // Approach: the block south of it and the block north of it.
    block(-700, -110, -385, 560),
    block(-540, -835, -300, -290),
    // Teeth in the north street.
    block(-1350, -835, -1200, -670),
    block(-1120, -715, -1000, -550),
    block(-880, -835, -730, -670),
    // Teeth in the south street.
    block(-1250, 670, -1100, 835),
    block(-950, 550, -830, 715),
    block(-650, 670, -530, 835),
    block(-350, 550, -230, 715),
    // Block west of the south entry, cover beside the point that ends at the south shield, and a
    // post at the near edge of the bay.
    block(-385, 330, -150, 560),
    block(-260, 10, -235, 215),
    block(-150, -110, -120, -15)
  ];
  // Pieces on the middle column, symmetric by themselves.
  const middle: WallPlacement[] = [
    // Block north of the plaza with a fin down toward the point.
    block(-300, -835, 300, -290),
    block(-15, -300, 15, -110),
    // Wall between the teams' south entries and the shield in front of them.
    block(-30, 330, 30, 835),
    block(-240, 190, 240, 215)
  ];
  const redCrates: Placement[] = [{ x: -1000, y: 640, rotation: Math.PI / 2 }];
  const redSpawns = [-105, -35, 35, 105].map((y) => ({ x: -1700, y, rotation: 0 }));
  const redLanes = { center: { x: -750, y: 0 }, north: { x: -600, y: -420 }, south: { x: -700, y: 620 } };

  return {
    halfWidth: 1800,
    halfHeight: 825,
    walls: [...red, ...red.map(mirrorWall), ...middle],
    crates: [...redCrates, ...redCrates.map(mirrorPlacement)],
    point: { x: 0, y: 0, radius: 90 },
    bases: {
      red: { zone: { x: -1700, y: 0, halfWidth: 100, halfHeight: 200 }, spawns: redSpawns },
      blue: { zone: { x: 1700, y: 0, halfWidth: 100, halfHeight: 200 }, spawns: redSpawns.map(mirrorPlacement) }
    },
    lanes: {
      red: redLanes,
      blue: { center: mirrorPoint(redLanes.center), north: mirrorPoint(redLanes.north), south: mirrorPoint(redLanes.south) }
    }
  };
}

/** Whether `point` lies inside a base's zone. */
export function inBase(base: KothBase, point: Point) {
  return Math.abs(point.x - base.zone.x) <= base.zone.halfWidth && Math.abs(point.y - base.zone.y) <= base.zone.halfHeight;
}

/** Whether `point` lies on the control point. */
export function onPoint(map: KothMap, point: Point) {
  return Math.hypot(point.x - map.point.x, point.y - map.point.y) <= map.point.radius;
}

/** A wall or building filling the axis-aligned box between two corners. */
function block(left: number, top: number, right: number, bottom: number): WallPlacement {
  return { x: (left + right) / 2, y: (top + bottom) / 2, halfWidth: (right - left) / 2, halfHeight: (bottom - top) / 2 };
}

function mirrorPoint(point: Point) {
  return { x: -point.x, y: point.y };
}

function mirrorWall(wall: WallPlacement): WallPlacement {
  return { ...wall, x: -wall.x, rotation: -(wall.rotation ?? 0) };
}

/** Mirrors a placement across the middle line, turning its heading to face the other way. */
function mirrorPlacement(placement: Placement): Placement {
  return { x: -placement.x, y: placement.y, rotation: Math.PI - placement.rotation };
}
