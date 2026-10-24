import type { Tank } from '../arena/bodies';
import type { Combat } from '../damage/combat';
import type { Role } from './brain';
import type { KothMap } from './map';
import { cellCenter, sightReach, traceClear, type NavGrid } from './navigation';
import { rivalOf, type CaptureState, type TeamId } from './rules';

type Point = { x: number; y: number };

/** A seat in the match: a human or a bot, with whichever tank it drives at the moment. */
export type Member = {
  /** Unique across both teams. */
  id: number;
  team: TeamId;
  /** Seat within the team, from 0. */
  index: number;
  name: string;
  human: boolean;
  /** The member's tank; `undefined` while it waits to respawn. */
  tank: Tank | undefined;
  /** Job the team gave the member; humans always count as assault. */
  role: Role;
  /** Match time at which a destroyed tank comes back. */
  respawnAt: number | undefined;
  /** Match time a shot last hit the tank or flew close by, and whose shot it was. */
  shotAt: number;
  attacker: Tank | undefined;
  kills: number;
  deaths: number;
};

/** What a team knows about an enemy tank it has seen. */
export type Sighting = {
  tank: Tank;
  position: Point;
  velocity: Point;
  /** Hull heading and turret direction, radians. */
  heading: number;
  turret: number;
  /** Match time of the last sighting. */
  seenAt: number;
};

/**
 * A team's shared board, the part of its bots' minds they have in common, refreshed a few times a
 * second:
 *
 * - Knowledge: every enemy any member saw lately, plus any enemy on the point, which the capture
 *   display gives away, and the shooter of every shot at a member.
 * - Danger: how exposed each grid cell is to the known enemies' guns, from line-of-sight traces
 *   through walls and crates. Bots route around danger and look for cover where it is zero.
 * - Roles: an assault, a flanker, a support and another assault, filled from the living members
 *   and kept stable; a human always plays assault.
 * - Intent: push for the point, hold it, or regroup when too many members are down.
 * - A coordinated push: when the enemy defends the point, the team first gathers at staging spots
 *   in different lanes and then goes in together, so the point is hit from several sides.
 * - Focus fire on the enemy most worth killing; each support covers an ally, and each ally under
 *   fire gets a helper.
 */
export function createTeamBoard(
  team: TeamId,
  members: readonly Member[],
  context: {
    combat: Combat;
    grid: NavGrid;
    map: KothMap;
    rivals: readonly Member[];
    clock: () => number;
    capture: () => CaptureState;
    /** Seconds of holding the point that win the match. */
    holdTime: number;
  }
) {
  const { combat, grid, map } = context;
  const sightings = new Map<Tank, Sighting>();
  const cellCount = grid.cols * grid.rows;
  /** Distance to walls and crates for sight traces. */
  const sight = new Float32Array(cellCount);
  const danger = new Float32Array(cellCount);
  /** Extra path cost of cells taken by crates, which tanks can shove but slowly. */
  const crateCost = new Float32Array(cellCount);
  const help = new Map<Member, { ally: Member; attacker: Tank }>();
  const covers = new Map<Member, Member>();
  const staging = new Map<Member, { arrived: boolean; at: number }>();
  let intent: 'push' | 'hold' | 'regroup' = 'push';
  let push: { phase: 'none' | 'gather' | 'go'; since: number; lane: 'north' | 'south' } = { phase: 'none', since: 0, lane: 'north' };
  let focus: Tank | undefined;
  // Teams update half an interval apart, so their work falls on different steps.
  let nextUpdate = team === 'red' ? 0 : UPDATE_INTERVAL / 2;

  return {
    /** The team this board belongs to. */
    team,

    /** The team's seats. */
    members,

    /** What the team wants now: to push for the point, hold it, or regroup to wait for respawns. */
    get intent() {
      return intent;
    },

    /** Stage of the coordinated push: none needed, gathering at staging spots, or going in. */
    get phase() {
      return push.phase;
    },

    /** The enemy everyone should shoot at when they can, while it lives. */
    get focus() {
      return focus && alive(focus) ? focus : undefined;
    },

    /** Enemies seen within the last few seconds that are still alive. */
    known() {
      return [...sightings.values()].filter((sighting) => alive(sighting.tank));
    },

    /** The team's latest sighting of `tank`, if it is fresh and the tank lives. */
    sightingOf(tank: Tank) {
      return alive(tank) ? sightings.get(tank) : undefined;
    },

    /** Records that a member sees `tank` now. */
    see(tank: Tank) {
      record(tank);
    },

    /** Exposure of a cell to known enemies' guns: 0 out of their sight, about 1 per enemy that sees it. */
    danger(cell: number) {
      return danger[cell];
    },

    /** Whether a tank in `cell` would be out of every known enemy's sight, its whole hull included. */
    isHidden(cell: number) {
      const col = cell % grid.cols;

      return (
        danger[cell] === 0 &&
        (col === 0 || danger[cell - 1] === 0) &&
        (col === grid.cols - 1 || danger[cell + 1] === 0) &&
        (cell < grid.cols || danger[cell - grid.cols] === 0) &&
        (cell >= cellCount - grid.cols || danger[cell + grid.cols] === 0)
      );
    },

    /** Extra path cost of a cell taken by a crate. */
    crateCost(cell: number) {
      return crateCost[cell];
    },

    /** Distance to walls and crates per grid cell, for sight traces. */
    sightField: sight as Readonly<Float32Array>,

    /** Whether a straight line between two points passes no wall or crate, by the grid. */
    canSee(from: Point, to: Point) {
      return traceClear(grid, sight, from, to);
    },

    /** The ally this member was asked to help and the enemy shooting at it, while both live. */
    helpFor(member: Member) {
      const request = help.get(member);
      return request && request.ally.tank && alive(request.attacker) ? request : undefined;
    },

    /** The ally a support member covers. */
    coverOf(member: Member) {
      return covers.get(member);
    },

    /**
     * Called every step by a bot waiting at its staging spot for the push.
     *
     * @param arrived - The bot is at its spot.
     */
    stage(member: Member, arrived: boolean) {
      staging.set(member, { arrived, at: context.clock() });
    },

    /** The member's spot on the point, on its own side and spread out from the others. */
    pointSpot(member: Member) {
      const side = team === 'red' ? Math.PI : 0;
      const spread = member.index % 2 === 0 ? 1 : -1;
      let angle = side + spread * 0.45;

      if (member.role === 'support') {
        angle = side + spread * 1.1;
      } else if (member.role === 'flank') {
        angle = (push.lane === 'north' ? -Math.PI / 2 : Math.PI / 2) + (team === 'red' ? -spread * 0.4 : spread * 0.4);
      }

      return { x: map.point.x + Math.cos(angle) * POINT_SPOT, y: map.point.y + Math.sin(angle) * POINT_SPOT };
    },

    /** Where the member waits before a coordinated push: assaults and supports in the middle lane, the flanker in a side lane. */
    stagingSpot(member: Member): Point {
      const lanes = map.lanes[team];
      const back = team === 'red' ? -1 : 1;

      if (member.role === 'flank') {
        return lanes[push.lane];
      }

      if (member.role === 'support') {
        return { x: lanes.center.x + back * 70, y: lanes.center.y + (member.index % 2 === 0 ? 60 : -60) };
      }

      return { x: lanes.center.x, y: lanes.center.y + (member.index % 2 === 0 ? 75 : -75) };
    },

    /** Where the team regroups. */
    rally() {
      return map.lanes[team].center;
    },

    /** The member's own spot in the base. */
    baseSpot(member: Member) {
      const spawn = map.bases[team].spawns[member.index % map.bases[team].spawns.length];
      return { x: spawn.x, y: spawn.y };
    },

    /** Refreshes knowledge, danger, roles, intent, the push, focus and help a few times a second. */
    update() {
      const now = context.clock();

      if (now < nextUpdate) {
        return;
      }

      nextUpdate = now + UPDATE_INTERVAL;
      forget(now);
      revealPoint();
      buildSightField();
      buildDanger();
      assignRoles();
      decideIntent(now);
      chooseFocus();
      assignCovers();
      assignHelp(now);
    },

    /** Forgets everything, for a new match. */
    reset() {
      sightings.clear();
      help.clear();
      covers.clear();
      staging.clear();
      danger.fill(0);
      intent = 'push';
      push = { phase: 'none', since: 0, lane: 'north' };
      focus = undefined;
      nextUpdate = team === 'red' ? 0 : UPDATE_INTERVAL / 2;
    }
  };

  function alive(tank: Tank) {
    return combat.armorOf(tank) !== undefined;
  }

  function record(tank: Tank) {
    const position = tank.hull.translation();
    const velocity = tank.hull.linvel();
    sightings.set(tank, {
      tank,
      position: { x: position.x, y: position.y },
      velocity: { x: velocity.x, y: velocity.y },
      heading: tank.hull.rotation(),
      turret: tank.turretAngle,
      seenAt: context.clock()
    });
  }

  function forget(now: number) {
    const alive = new Set(combat.tanks);

    for (const [tank, sighting] of sightings) {
      if (!alive.has(tank) || now - sighting.seenAt > MEMORY) {
        sightings.delete(tank);
      }
    }

    // Shots give their shooter away.
    for (const member of members) {
      if (member.attacker && alive.has(member.attacker) && now - member.shotAt < 0.3) {
        record(member.attacker);
      }
    }
  }

  /** The capture display tells everyone who stands on the point. */
  function revealPoint() {
    for (const rival of context.rivals) {
      if (rival.tank && distanceTo(rival.tank.hull.translation(), map.point) <= map.point.radius) {
        record(rival.tank);
      }
    }
  }

  function buildSightField() {
    sight.set(grid.distance);
    crateCost.fill(0);

    for (const crate of combat.crates) {
      const cos = Math.cos(crate.rotation);
      const sin = Math.sin(crate.rotation);
      const reach = CRATE_HALF.y + grid.clearance + grid.cell;
      const minCol = Math.max(Math.floor((crate.x - reach - grid.originX) / grid.cell), 0);
      const maxCol = Math.min(Math.ceil((crate.x + reach - grid.originX) / grid.cell), grid.cols - 1);
      const minRow = Math.max(Math.floor((crate.y - reach - grid.originY) / grid.cell), 0);
      const maxRow = Math.min(Math.ceil((crate.y + reach - grid.originY) / grid.cell), grid.rows - 1);

      for (let row = minRow; row <= maxRow; row++) {
        for (let col = minCol; col <= maxCol; col++) {
          const cell = row * grid.cols + col;
          const center = cellCenter(grid, cell);
          const dx = center.x - crate.x;
          const dy = center.y - crate.y;
          const qx = Math.abs(dx * cos + dy * sin) - CRATE_HALF.x;
          const qy = Math.abs(-dx * sin + dy * cos) - CRATE_HALF.y;
          const distance = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0);
          sight[cell] = Math.min(sight[cell], distance);

          if (distance < grid.clearance) {
            crateCost[cell] = Math.max(crateCost[cell], CRATE_COST);
          }
        }
      }
    }
  }

  /**
   * Adds every known enemy's view to the danger map: the outline of what it can see, from rays
   * cast through walls and crates, and every open cell within range and inside that outline,
   * weighted more in front of its gun.
   */
  function buildDanger() {
    danger.fill(0);

    for (const threat of sightings.values()) {
      const reach = sightReach(grid, sight, threat.position, DANGER_RANGE, SIGHT_RAYS);
      const minCol = Math.max(Math.floor((threat.position.x - DANGER_RANGE - grid.originX) / grid.cell), 0);
      const maxCol = Math.min(Math.ceil((threat.position.x + DANGER_RANGE - grid.originX) / grid.cell), grid.cols - 1);
      const minRow = Math.max(Math.floor((threat.position.y - DANGER_RANGE - grid.originY) / grid.cell), 0);
      const maxRow = Math.min(Math.ceil((threat.position.y + DANGER_RANGE - grid.originY) / grid.cell), grid.rows - 1);

      for (let row = minRow; row <= maxRow; row++) {
        for (let col = minCol; col <= maxCol; col++) {
          const cell = row * grid.cols + col;

          if (grid.distance[cell] < grid.clearance) {
            continue;
          }

          const dx = grid.originX + col * grid.cell - threat.position.x;
          const dy = grid.originY + row * grid.cell - threat.position.y;
          const distance = Math.hypot(dx, dy);

          if (distance > DANGER_RANGE) {
            continue;
          }

          const bin = ((Math.atan2(dy, dx) / (Math.PI * 2)) * SIGHT_RAYS + SIGHT_RAYS) % SIGHT_RAYS;
          const free = Math.min(reach[Math.floor(bin) % SIGHT_RAYS], reach[Math.ceil(bin) % SIGHT_RAYS]);

          if (distance > free) {
            continue;
          }

          const facing = distance > 1 ? (dx * Math.cos(threat.turret) + dy * Math.sin(threat.turret)) / distance : 1;
          danger[cell] += 0.5 + 0.5 * Math.max(facing, 0);
        }
      }
    }
  }

  /**
   * Fills the roles assault, flank, support, assault in that order from the living members.
   * A member keeps its role while that role is still wanted; the rest take the missing roles.
   */
  function assignRoles() {
    const living = members.filter((member) => member.tank);
    const wanted = ROLE_ORDER.slice(0, living.length);
    const open = [...wanted];
    const unassigned: Member[] = [];

    for (const member of [...living].sort((a, b) => Number(b.human) - Number(a.human))) {
      const role = member.human ? 'assault' : member.role;
      const index = open.indexOf(role);

      if (index >= 0) {
        open.splice(index, 1);
        member.role = role;
      } else {
        unassigned.push(member);
      }
    }

    for (const member of unassigned) {
      member.role = open.shift() ?? 'assault';
    }
  }

  function decideIntent(now: number) {
    const capture = context.capture();
    const alive = members.filter((member) => member.tank).length;
    const rivalsAlive = context.rivals.filter((member) => member.tank).length;
    const enemyClock = capture.held[rivalOf(team)] / context.holdTime;

    if (capture.owner === team) {
      intent = 'hold';
    } else if (alive <= rivalsAlive - 2 && enemyClock < 0.8) {
      intent = 'regroup';
    } else if (intent !== 'regroup' || alive >= rivalsAlive - 1) {
      intent = 'push';
    }

    const defended =
      capture.owner === rivalOf(team) || [...sightings.values()].some((sighting) => distanceTo(sighting.position, map.point) < DEFENDED_RADIUS);

    if (intent !== 'push' || !defended) {
      push = { ...push, phase: 'none' };
      staging.clear();
      return;
    }

    if (push.phase === 'none') {
      push = { phase: 'gather', since: now, lane: quieterLane() };
      staging.clear();
    }

    if (push.phase === 'gather') {
      const waiting = [...staging.entries()].filter(([member, entry]) => member.tank && now - entry.at < 0.5);
      const arrived = waiting.filter(([, entry]) => entry.arrived).length;
      const everyone = waiting.length > 0 && arrived === waiting.length && (waiting.length >= 2 || now - push.since > 3);

      // No waiting while the enemy is about to take a point nobody holds.
      const hurry = capture.capturer === rivalOf(team) && capture.owner !== rivalOf(team) && capture.progress > HURRY_PROGRESS;

      if (everyone || hurry || now - push.since > GATHER_TIMEOUT) {
        push = { ...push, phase: 'go', since: now };
      }
    } else if (push.phase === 'go' && now - push.since > PUSH_WINDOW) {
      push = { ...push, phase: 'none' };
    }
  }

  /** The side lane with less danger at its staging spot, for the flanker. */
  function quieterLane() {
    const lanes = map.lanes[team];
    const exposure = (point: Point) =>
      [...sightings.values()].reduce((total, sighting) => total + 1 / Math.max(distanceTo(sighting.position, point), 100), 0);

    return exposure(lanes.north) <= exposure(lanes.south) ? 'north' : 'south';
  }

  /** Scores the known enemies: on the point, with an open core, damaged, shooting at us, close to the team. */
  function chooseFocus() {
    let best: { tank: Tank; score: number } | undefined;

    for (const sighting of sightings.values()) {
      const tank = sighting.tank;
      const nearest = Math.min(
        ...members.flatMap((member) => (member.tank ? [distanceTo(member.tank.hull.translation(), sighting.position)] : [])),
        Infinity
      );
      const shooting = members.some((member) => member.attacker === tank && context.clock() - member.shotAt < 2);
      const score =
        (distanceTo(sighting.position, map.point) <= map.point.radius ? 3 : 0) +
        (combat.isCoreOpen(tank) ? 4 : 0) +
        (1 - combat.armorLeft(tank)) * 4 +
        (shooting ? 2 : 0) -
        nearest / 300 +
        (tank === focus ? 1 : 0);

      if (!best || score > best.score) {
        best = { tank, score };
      }
    }

    focus = best?.tank;
  }

  /** Each support covers the human, if the team has one alive, or the assault nearest the point. */
  function assignCovers() {
    covers.clear();

    for (const support of members.filter((member) => member.tank && member.role === 'support' && !member.human)) {
      const human = members.find((member) => member.human && member.tank);
      const assault = members
        .filter((member) => member !== support && member.tank && member.role === 'assault')
        .sort((a, b) => distanceTo(a.tank!.hull.translation(), map.point) - distanceTo(b.tank!.hull.translation(), map.point))[0];
      const ally = human ?? assault;

      if (ally) {
        covers.set(support, ally);
      }
    }
  }

  /** Gives every ally under fire one helper: its support if it has one, else the nearest bot free to help. */
  function assignHelp(now: number) {
    help.clear();
    const alive = new Set(combat.tanks);
    const victims = members
      .filter((member) => member.tank && member.attacker && alive.has(member.attacker) && now - member.shotAt < HELP_WINDOW)
      .sort((a, b) => b.shotAt - a.shotAt);

    for (const victim of victims) {
      const at = victim.tank!.hull.translation();
      const candidates = members.filter(
        (member) =>
          member !== victim &&
          !member.human &&
          member.tank &&
          !help.has(member) &&
          !combat.isCoreOpen(member.tank) &&
          distanceTo(member.tank.hull.translation(), at) < HELP_RANGE
      );
      const helper =
        candidates.find((member) => covers.get(member) === victim) ??
        candidates.sort((a, b) => distanceTo(a.tank!.hull.translation(), at) - distanceTo(b.tank!.hull.translation(), at))[0];

      if (helper) {
        help.set(helper, { ally: victim, attacker: victim.attacker! });
      }
    }
  }
}

/** A team's board as returned by `createTeamBoard`. */
export type TeamBoard = ReturnType<typeof createTeamBoard>;

/** Roles in the order living members fill them. */
const ROLE_ORDER: Role[] = ['assault', 'flank', 'support', 'assault'];
const UPDATE_INTERVAL = 0.25;
/** Seconds the team remembers an enemy it no longer sees. */
const MEMORY = 4;
/** Directions in which an enemy's view is traced for the danger map. */
const SIGHT_RAYS = 360;
/** Enemies beyond this many pixels are no danger: too far to aim at. */
export const DANGER_RANGE = 650;
/** The point counts as defended when an enemy was seen this close to it. */
const DEFENDED_RADIUS = 350;
/** Seconds the team waits for stragglers before it pushes anyway, and how long a push lasts. */
const GATHER_TIMEOUT = 6;
/** Capture progress of the enemy on a free point at which the team stops gathering and goes. */
const HURRY_PROGRESS = 0.35;
const PUSH_WINDOW = 14;
/** Seconds after a hit during which an ally counts as under fire, and how far a helper may be. */
const HELP_WINDOW = 1.5;
const HELP_RANGE = 700;
/** Distance of the members' spots from the point's center. */
const POINT_SPOT = 45;
/** Half size of a crate's armor. */
const CRATE_HALF = { x: 21.25, y: 46.25 };
const CRATE_COST = 3;

function distanceTo(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
