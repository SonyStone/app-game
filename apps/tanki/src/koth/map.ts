import type { CombatLayout, Placement, WallMaterial, WallPlacement } from '../damage/combat';
import type { TeamId } from './rules';

type Point = { x: number; y: number };

/** A team's base: the zone where its tanks spawn and mend their armor, and the spots they spawn on. */
export type KothBase = {
  /** Axis-aligned zone around its center. */
  zone: { x: number; y: number; halfWidth: number; halfHeight: number };
  spawns: readonly Placement[];
  /** Where the base's turret stands, on the room's wall above a corner (see `createBaseTurrets`); a base without one has none. */
  turret?: Point;
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
  /** Spots where repair kits lie, picked up by driving over them. */
  kits: readonly KitPlacement[];
};

/** Where a repair kit lies, and whether it is a small or a large one. */
export type KitPlacement = Point & { size: 'small' | 'large' };

/**
 * The king of the hill map, laid out after the king of the hill maps of Team Fortress 2 but
 * compact, as top-down shooters keep theirs: 2600 x 920 px, about five seconds of driving from a
 * spawn to the point, about two screens of the way.
 *
 * - Each team spawns in a room of steel, which no shot breaks, at a short end. It has a door to
 *   the north street and one to the hall behind a shield that hides the room from the hall, and
 *   a turret on its wall above a corner that guards it.
 * - Three routes lead to the point: the hall in the middle, which winds between teeth and a
 *   pillar, and the north and south streets, which are longer. The south street is reached from
 *   the yard in front of the room. The streets enter the plaza by doorways beside its edge.
 * - Buildings, teeth jutting into the streets from either side in turn and the pillars break up
 *   the lines of fire: no straight line across the drivable ground is longer than the 700 px a
 *   shell flies, except lines across the point itself. Shots break them up less in time: wood
 *   breaks after a few hits, brick after more, concrete after many.
 * - Alleys between the buildings beside the hall are shut by a wooden fence in the north and a
 *   brick wall in the south: shooting one open joins the hall to a street.
 * - The point is open, with posts north and south of it and low walls on either side of the way
 *   in from the hall for cover.
 * - Large repair kits lie in the streets and small ones in the plaza by the doorways.
 *
 * The teams' halves are mirror images. Kept as plain data so a map from the editor can replace
 * it later.
 */
export const KOTH_MAP: KothMap = createMap();

function createMap(): KothMap {
  // Red's half; blue's is its mirror image.
  const red: WallPlacement[] = [
    // Spawn room of steel with doors to the north and the east, the shield in front of the east
    // door, and the annex below the room, which leaves a passage from the yard to the south street.
    block(-1300, -200, -1200, -170, 'steel'),
    block(-1300, 170, -1110, 200, 'steel'),
    block(-1110, -200, -1080, -35, 'steel'),
    block(-1110, 35, -1080, 200, 'steel'),
    block(-990, -60, -960, 60, 'steel'),
    block(-1300, 200, -1080, 460, 'steel'),
    block(-1080, 125, -1000, 460, 'steel'),
    // North buildings with a fenced alley between them, and a nub at the corner by the spawn that
    // hides the space north of the room from the street.
    block(-1080, -280, -650, -125, 'concrete'),
    block(-1080, -360, -1050, -280, 'brick'),
    block(-650, -210, -570, -196, 'wood'),
    block(-570, -280, -330, -125, 'brick'),
    // South buildings with a walled alley between them.
    block(-910, 125, -600, 280, 'brick'),
    block(-600, 196, -520, 220, 'brick'),
    block(-520, 125, -330, 280, 'concrete'),
    // Teeth and a pillar in the hall.
    block(-720, -125, -690, 20, 'brick'),
    block(-610, -50, -550, 50, 'concrete'),
    block(-450, -20, -420, 125, 'brick'),
    // Teeth in the streets, from either side in turn.
    block(-920, -460, -870, -365, 'wood'),
    block(-760, -375, -710, -280, 'brick'),
    block(-570, -460, -520, -365, 'brick'),
    block(-400, -375, -360, -280, 'wood'),
    block(-860, 365, -810, 460, 'brick'),
    block(-720, 280, -670, 375, 'wood'),
    block(-540, 365, -490, 460, 'wood'),
    block(-400, 280, -360, 375, 'brick'),
    // Edge of the plaza beside the doorways from the streets, and low walls on either side of the
    // way from the hall to the point.
    block(-340, -280, -300, -250, 'concrete'),
    block(-340, 250, -300, 280, 'concrete'),
    block(-300, -145, -140, -85, 'brick'),
    block(-300, 85, -140, 145, 'brick')
  ];
  // Pieces on the middle column, symmetric by themselves.
  const middle: WallPlacement[] = [
    block(-220, -460, 220, -250, 'concrete'),
    block(-220, 250, 220, 460, 'brick'),
    block(-30, -160, 30, -92, 'concrete'),
    block(-30, 92, 30, 160, 'concrete')
  ];
  const redCrates: Placement[] = [{ x: -1200, y: -340, rotation: 0 }];
  // On the north wall, above the room's back corner, where it sees the whole room and both doors.
  const redTurret = { x: -1278, y: -185 };
  const redSpawns = [-105, -35, 35, 105].map((y) => ({ x: -1205, y, rotation: 0 }));
  const redLanes = { center: { x: -660, y: 0 }, north: { x: -815, y: -410 }, south: { x: -765, y: 330 } };
  const redKits: KitPlacement[] = [
    { x: -650, y: -400, size: 'large' },
    { x: -620, y: 330, size: 'large' },
    { x: -260, y: -215, size: 'small' },
    { x: -260, y: 215, size: 'small' }
  ];

  return {
    halfWidth: 1300,
    halfHeight: 460,
    walls: [...red, ...red.map(mirrorWall), ...middle],
    crates: [...redCrates, ...redCrates.map(mirrorPlacement)],
    point: { x: 0, y: 0, radius: 90 },
    bases: {
      red: { zone: { x: -1205, y: 0, halfWidth: 95, halfHeight: 170 }, spawns: redSpawns, turret: redTurret },
      blue: { zone: { x: 1205, y: 0, halfWidth: 95, halfHeight: 170 }, spawns: redSpawns.map(mirrorPlacement), turret: mirrorPoint(redTurret) }
    },
    lanes: {
      red: redLanes,
      blue: { center: mirrorPoint(redLanes.center), north: mirrorPoint(redLanes.north), south: mirrorPoint(redLanes.south) }
    },
    kits: [...redKits, ...redKits.map((kit) => ({ ...kit, x: -kit.x }))]
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

/** A wall or building of `material` filling the axis-aligned box between two corners. */
function block(left: number, top: number, right: number, bottom: number, material: WallMaterial): WallPlacement {
  return { x: (left + right) / 2, y: (top + bottom) / 2, halfWidth: (right - left) / 2, halfHeight: (bottom - top) / 2, material };
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
