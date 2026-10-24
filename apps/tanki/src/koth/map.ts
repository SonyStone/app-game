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
 * The king of the hill map, laid out by hand after the damage range: two bases at the short
 * ends, three lanes between them and the control point in the middle, with concrete walls and
 * crates for cover. Red's half is described here and mirrored for blue, so both sides play the
 * same; walls and crates on the middle line exist once.
 *
 * Kept as plain data so a map from the editor can replace it later.
 */
export const KOTH_MAP: KothMap = createMap();

function createMap(): KothMap {
  const redWalls: WallPlacement[] = [
    // Sides of the spawn room and a shield that hides the spawn from the point.
    { x: -660, y: -235, halfWidth: 12, halfHeight: 95 },
    { x: -660, y: 235, halfWidth: 12, halfHeight: 95 },
    { x: -590, y: 0, halfWidth: 12, halfHeight: 55 },
    // A pillar in the middle lane and the walls that split off the side lanes.
    { x: -400, y: 0, halfWidth: 34, halfHeight: 34 },
    { x: -430, y: -250, halfWidth: 120, halfHeight: 12 },
    { x: -430, y: 250, halfWidth: 120, halfHeight: 12 },
    // Short walls beside the point.
    { x: -215, y: -100, halfWidth: 12, halfHeight: 45 },
    { x: -215, y: 100, halfWidth: 12, halfHeight: 45 },
    // Blocks at the outer edge of the side lanes.
    { x: -250, y: -425, halfWidth: 30, halfHeight: 30 },
    { x: -250, y: 425, halfWidth: 30, halfHeight: 30 }
  ];
  const middleWalls: WallPlacement[] = [
    { x: 0, y: -300, halfWidth: 100, halfHeight: 12 },
    { x: 0, y: 300, halfWidth: 100, halfHeight: 12 }
  ];
  const redCrates: Placement[] = [
    { x: -310, y: -150, rotation: 0.25 },
    { x: -310, y: 150, rotation: -0.25 },
    { x: -140, y: -400, rotation: Math.PI / 2 },
    { x: -140, y: 400, rotation: Math.PI / 2 },
    { x: -520, y: -120, rotation: 0.35 },
    { x: -520, y: 120, rotation: -0.35 }
  ];
  const middleCrates: Placement[] = [
    { x: 0, y: -128, rotation: Math.PI / 2 },
    { x: 0, y: 128, rotation: Math.PI / 2 }
  ];
  const redSpawns = [-105, -35, 35, 105].map((y) => ({ x: -790, y, rotation: 0 }));
  const redLanes = { center: { x: -470, y: 0 }, north: { x: -330, y: -360 }, south: { x: -330, y: 360 } };

  return {
    halfWidth: 850,
    halfHeight: 520,
    walls: [...redWalls, ...redWalls.map(mirrorWall), ...middleWalls],
    crates: [...redCrates, ...redCrates.map(mirrorPlacement), ...middleCrates],
    point: { x: 0, y: 0, radius: 90 },
    bases: {
      red: { zone: { x: -760, y: 0, halfWidth: 90, halfHeight: 170 }, spawns: redSpawns },
      blue: { zone: { x: 760, y: 0, halfWidth: 90, halfHeight: 170 }, spawns: redSpawns.map(mirrorPlacement) }
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
