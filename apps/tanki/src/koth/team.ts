import type { Tank } from '../arena/bodies';
import { SIGHT_OVER_RUBBLE, type Combat } from '../damage/combat';
import type { Role } from './brain';
import type { Trigger, Weapon } from './classes/weapon';
import type { KothMap } from './map';
import { findPerches, type Perch } from './classes/perch';
import { findPosts, type Post } from './front';
import type { Kit } from './kits';
import { createRadio, type CalloutOptions, type RadioLine } from './radio';
import { TACTICS } from './classes/tactics';
import { cellAt, cellCenter, isOpenCell, sightReach, traceClear, type NavGrid } from './navigation';
import { rivalOf, type CaptureState, type TeamId } from './rules';
import type { TankClass, TankClassId } from './tanks';

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
  /** The class of the member's tank, or of its next one while it waits. */
  tankClass: TankClass;
  /** The class the member asked for, which it takes at its next respawn. */
  nextClass: TankClassId | undefined;
  /** The weapon of the member's tank, while it has one. */
  weapon: Weapon | undefined;
  /** How the member works the trigger this step; the match fires and then lets go. */
  trigger: Trigger;
  /** Where a casemate gun's hull began to turn in place, while it turns. */
  pivot: Point | undefined;
  /** Job the member does for the team, from its class. */
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
 *   through walls, wrecks, crates and rubble, as shells see them: an enemy right behind rubble
 *   sees and shoots over it. Bots route around danger and look for cover where it is zero.
 * - Roles: an assault, a flanker, a support and another assault, filled from the living members
 *   and kept stable; a human always plays assault.
 * - Intent: push for the point, hold it, or regroup when too many members are down.
 * - Jobs while the team holds the point: one bot keeps to the point and the others take posts in
 *   front of it, one on each way the enemy comes back by (see `findPosts`), so the enemy is met
 *   before it reaches the point and the team is not all standing in the open on it. The Heavy
 *   takes the hall, the busiest way; a Sniper keeps its perch.
 * - A coordinated push: when the enemy defends the point, the team first gathers at staging spots
 *   in different lanes and then goes in together, so the point is hit from several sides.
 * - Focus fire on the enemy most worth killing; each support covers an ally, and each ally under
 *   fire gets a helper.
 * - The radio (see `./radio`): its bots say what they are about to do, and the board has them
 *   call out the team's plan as it changes: gathering for a push, the countdown and the go, the
 *   point taken, a regroup, a newly seen enemy sniper, a call for help, a repair kit that turned
 *   out to be a trap.
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
    /** The repair kits on the map, live. */
    kits: readonly Readonly<Kit>[];
  }
) {
  const { combat, grid, map } = context;
  const sightings = new Map<Tank, Sighting>();
  const cellCount = grid.cols * grid.rows;
  /** Distance to walls, wrecks, crates and rubble for sight traces. */
  const sight = new Float32Array(cellCount);
  /** The same without rubble, which a tank right behind it sees and shoots over. */
  const overRubble = new Float32Array(cellCount);
  const rubbleSight = { field: overRubble, reach: SIGHT_OVER_RUBBLE };
  const danger = new Float32Array(cellCount);
  /** Extra path cost of cells taken by crates, which tanks can shove but slowly. */
  const crateCost = new Float32Array(cellCount);
  const help = new Map<Member, { ally: Member; attacker: Tank }>();
  const covers = new Map<Member, Member>();
  const staging = new Map<Member, { arrived: boolean; at: number }>();
  let intent: 'push' | 'hold' | 'regroup' = 'push';
  let push: { phase: 'none' | 'gather' | 'go'; since: number; lane: 'north' | 'south' } = { phase: 'none', since: 0, lane: 'north' };
  let focus: Tank | undefined;
  const radio = createRadio(context.clock);
  /** When the gathered team goes in, once everyone is at their staging spot. */
  let launchAt: number | undefined;
  /** Members who called for help and still need it, so each call is made once. */
  const calling = new Set<Member>();
  let focusCalledAt = -Infinity;
  /** Members that were alive when the push went in, and since when each latecomer waits for company. */
  const pushers = new Set<Member>();
  const lateSince = new Map<Member, number>();
  /** Where members were destroyed lately, and until when such a spot counts as deadly. */
  const losses: { x: number; y: number; until: number }[] = [];
  let perches = findPerches(grid, map, team, TACTICS.sniper.perch!);
  let posts = findPosts(grid, map, team);
  let postsRevision = grid.revision;
  let postsAt = 0;
  /** Each member's job while the team holds the point: the point itself or a post in front of it. */
  const jobs = new Map<Member, Post | 'point'>();
  /** Open cells well inside the point, and the one the bot keeping the point stands on. */
  const pointCells = Array.from({ length: cellCount }, (_, cell) => cell).filter(
    (cell) => isOpenCell(grid, cell) && distanceTo(cellCenter(grid, cell), map.point) < map.point.radius - KEEPER_MARGIN
  );
  let keeperCell: number | undefined;
  const perchOf = new Map<Member, Perch>();
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

    /** Lines the team's bots are saying, and the markers they put on the map. */
    get callouts() {
      return radio.callouts;
    },

    /** Has `member` say `line` on the team's radio; see `Radio.say`. */
    say(member: Member, line: RadioLine, options?: CalloutOptions) {
      return radio.say(member, line, options);
    },

    /**
     * Records that a member was destroyed at `position` now. Destroyed at a repair kit, it warns
     * the team off that kit (see `isDeadly`), and a bot of the team says so.
     */
    noteLoss(position: Point) {
      losses.push({ x: position.x, y: position.y, until: context.clock() + DEADLY_TIME });
      const kit = context.kits.find((candidate) => distanceTo(candidate, position) < DEADLY_RADIUS);
      const speaker = kit && nearestBot(kit);

      if (kit && speaker) {
        radio.say(speaker, 'kitTrap', { priority: 2, marker: { kind: 'danger', x: kit.x, y: kit.y } });
      }
    },

    /**
     * Whether a member was destroyed within `DEADLY_RADIUS` px of `point` in the last
     * `DEADLY_TIME` s: a repair kit there is a trap the enemy watches, so the team keeps away.
     */
    isDeadly(point: Point) {
      const now = context.clock();
      return losses.some((loss) => loss.until > now && distanceTo(loss, point) < DEADLY_RADIUS);
    },

    /**
     * Records that `member` sees `tank` now. An enemy sniper the team did not know of is called
     * out with a marker where it is.
     */
    see(tank: Tank, member: Member) {
      const known = sightings.has(tank);
      record(tank);
      const rival = context.rivals.find((other) => other.tank === tank);

      if (!known && rival?.tankClass.id === 'sniper') {
        const at = tank.hull.translation();
        radio.say(member, 'sniper', { priority: 2, tankClass: 'sniper', marker: { kind: 'enemy', x: at.x, y: at.y } });
      }
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

    /** Distance to walls, wrecks, crates and rubble per grid cell, for sight traces. */
    sightField: sight as Readonly<Float32Array>,

    /**
     * Whether a straight line between two points passes no wall, wreck, crate or rubble, by the
     * grid, as a tank at `from` sees: over rubble right in front of it.
     */
    canSee(from: Point, to: Point) {
      return traceClear(grid, sight, from, to, rubbleSight);
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

    /**
     * The member's spot on the point, on its own side and spread out from the others: the lead
     * near its middle, and a sniper on its perch, from where it watches the point. The bot that
     * keeps the point while the team holds it stands where the fewest known enemies see it,
     * close to cover (see `chooseKeeperCell`).
     */
    pointSpot(member: Member) {
      const side = team === 'red' ? Math.PI : 0;

      if (jobs.get(member) === 'point' && keeperCell !== undefined) {
        return cellCenter(grid, keeperCell);
      }

      const spread = member.index % 2 === 0 ? 1 : -1;
      let angle = side + spread * 0.45;

      if (member.role === 'sniper') {
        return perchSpot(member);
      }

      if (member.role === 'lead') {
        return { x: map.point.x + Math.cos(side + spread * 0.3) * POINT_SPOT * 0.4, y: map.point.y + Math.sin(side + spread * 0.3) * POINT_SPOT * 0.4 };
      }

      if (member.role === 'support') {
        angle = side + spread * 1.1;
      } else if (member.role === 'flank') {
        angle = (push.lane === 'north' ? -Math.PI / 2 : Math.PI / 2) + (team === 'red' ? -spread * 0.4 : spread * 0.4);
      }

      return { x: map.point.x + Math.cos(angle) * POINT_SPOT, y: map.point.y + Math.sin(angle) * POINT_SPOT };
    },

    /**
     * Where the member waits before a coordinated push: assaults and supports in the middle lane,
     * the flanker in a side lane, a sniper on its perch.
     */
    stagingSpot(member: Member): Point {
      const lanes = map.lanes[team];
      const back = team === 'red' ? -1 : 1;

      if (member.role === 'sniper') {
        return perchSpot(member);
      }

      if (member.role === 'flank') {
        return lanes[push.lane];
      }

      if (member.role === 'support') {
        return { x: lanes.center.x + back * 70, y: lanes.center.y + (member.index % 2 === 0 ? 60 : -60) };
      }

      return { x: lanes.center.x, y: lanes.center.y + (member.index % 2 === 0 ? 75 : -75) };
    },

    /**
     * Where a sniper watches from, and where it looks while nothing is in sight: its perch,
     * kept until an enemy comes close or an enemy Sniper sees it, then the best safe one.
     */
    perchSpot(member: Member): Perch {
      return perchSpot(member);
    },

    /**
     * The tank that leads the team's push, its armor first into the fire: a living Heavy bot with
     * at least `LEAD_ARMOR` of its armor; `undefined` without one.
     */
    spearhead() {
      return members.find((member) => member.tank && !member.human && member.role === 'lead' && combat.armorLeft(member.tank) >= LEAD_ARMOR);
    },

    /**
     * Whether `member` should wait at its staging spot rather than go in: it came back after the
     * push went in, is still more than `LATE_FAR` px from the point and has no ally within
     * `LATE_BUDDY` px, so going in now would be alone. It waits `LATE_WAIT` s at most, enough for
     * the next wave of respawns, and goes in as soon as an ally comes by.
     */
    mustWait(member: Member) {
      const at = member.tank?.hull.translation();

      if (push.phase !== 'go' || pushers.has(member) || member.human || !at || distanceTo(at, map.point) < LATE_FAR) {
        return false;
      }

      const company = members.some((other) => other !== member && other.tank && distanceTo(other.tank.hull.translation(), at) < LATE_BUDDY);
      const since = lateSince.get(member) ?? context.clock();
      lateSince.set(member, since);

      if (company) {
        pushers.add(member);
        return false;
      }

      return context.clock() - since < LATE_WAIT;
    },

    /** Whether `member` keeps the point while the team holds it. */
    keepsPoint(member: Member) {
      return jobs.get(member) === 'point';
    },

    /**
     * The post `member` holds in front of the point while the team holds it, `undefined` when it
     * has none: it keeps to the point, has no job yet, or the team does not hold the point.
     */
    postOf(member: Member) {
      const job = jobs.get(member);
      return job === 'point' ? undefined : job;
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
      // Old losses no longer warn of anything.
      losses.splice(0, losses.length, ...losses.filter((loss) => loss.until > now));
      revealPoint();
      buildSightField();
      buildDanger();
      assignRoles();
      decideIntent(now);
      refreshPosts(now);
      assignJobs();
      chooseKeeperCell();
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
      losses.length = 0;
      radio.reset();
      launchAt = undefined;
      calling.clear();
      focusCalledAt = -Infinity;
      pushers.clear();
      lateSince.clear();
      perchOf.clear();
      // The walls stand as built again, and the Sniper's perch distance may have changed since.
      perches = findPerches(grid, map, team, TACTICS.sniper.perch!);
      posts = findPosts(grid, map, team);
      postsRevision = grid.revision;
      postsAt = 0;
      jobs.clear();
      keeperCell = undefined;
      nextUpdate = team === 'red' ? 0 : UPDATE_INTERVAL / 2;
    }
  };

  function alive(tank: Tank) {
    return combat.armorOf(tank) !== undefined;
  }

  /**
   * The perch `member` watches from: the one it has for as long as it is safe there, else the
   * best safe perch no teammate has, the nearer the better. A perch is not safe once a known enemy
   * comes within `PERCH_THREAT` px of it or a known enemy Sniper sees it; a Sniper that has to
   * move says so on the radio.
   */
  function perchSpot(member: Member): Perch {
    const current = perchOf.get(member);

    if (current && !threatened(current)) {
      return current;
    }

    const at = member.tank?.hull.translation() ?? current ?? map.lanes[team].center;
    const taken = new Set([...perchOf.entries()].filter(([other]) => other !== member && other.tank).map(([, spot]) => spot));
    const value = (perch: Perch) => perch.score - distanceTo(perch, at) / PERCH_TRAVEL - danger[cellAt(grid, perch)] * PERCH_EXPOSURE - (threatened(perch) ? PERCH_UNSAFE : 0);
    const best = perches.filter((perch) => !taken.has(perch)).sort((a, b) => value(b) - value(a))[0] ?? { ...map.lanes[team].center, watch: map.point, score: 0 };
    perchOf.set(member, best);

    if (current && best !== current && member.tank) {
      radio.say(member, 'relocate', { priority: 2, marker: { kind: 'hold', x: best.x, y: best.y } });
    }

    return best;
  }

  /** Whether a known enemy is close to `perch` or a known enemy Sniper sees it. */
  function threatened(perch: Point) {
    return [...sightings.values()].some((sighting) => {
      const range = distanceTo(sighting.position, perch);
      const sniper = context.rivals.find((rival) => rival.tank === sighting.tank)?.tankClass.id === 'sniper';
      return range < PERCH_THREAT || (sniper && range < SNIPER_SIGHT && traceClear(grid, sight, sighting.position, perch, rubbleSight));
    });
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

    overRubble.set(sight);

    for (const tile of combat.walls.tiles) {
      if (tile.rubble) {
        addRubble(tile);
      }
    }
  }

  /** Adds a heap of rubble to the sight field: tanks drive over it, but it stops shells and sight. */
  function addRubble(tile: (typeof combat.walls.tiles)[number]) {
    const angle = tile.wall.rotation ?? 0;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const minCol = Math.max(Math.floor((tile.bounds.minX - grid.originX) / grid.cell) - 1, 0);
    const maxCol = Math.min(Math.ceil((tile.bounds.maxX - grid.originX) / grid.cell) + 1, grid.cols - 1);
    const minRow = Math.max(Math.floor((tile.bounds.minY - grid.originY) / grid.cell) - 1, 0);
    const maxRow = Math.min(Math.ceil((tile.bounds.maxY - grid.originY) / grid.cell) + 1, grid.rows - 1);

    for (let row = minRow; row <= maxRow; row++) {
      for (let col = minCol; col <= maxCol; col++) {
        const cell = row * grid.cols + col;
        const center = cellCenter(grid, cell);
        const dx = center.x - tile.wall.x;
        const dy = center.y - tile.wall.y;
        const x = dx * cos + dy * sin;
        const y = -dx * sin + dy * cos;

        for (const box of tile.boxes) {
          sight[cell] = Math.min(sight[cell], boxDistance(x - box.x, y - box.y, box.halfWidth, box.halfHeight));
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
      const reach = sightReach(grid, sight, threat.position, DANGER_RANGE, SIGHT_RAYS, rubbleSight);
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

  /** Gives every member the role of its class: see `ROLE_OF_CLASS`. */
  function assignRoles() {
    for (const member of members) {
      member.role = ROLE_OF_CLASS[member.tankClass.id];
    }
  }

  /**
   * Decides what the team wants and runs the coordinated push: gathering, a short countdown once
   * everyone is at their staging spot, then going in together. The team's leader calls each
   * change out on the radio.
   */
  function decideIntent(now: number) {
    const capture = context.capture();
    const alive = members.filter((member) => member.tank).length;
    const rivalsAlive = context.rivals.filter((member) => member.tank).length;
    const enemyClock = capture.held[rivalOf(team)] / context.holdTime;
    const before = intent;

    if (capture.owner === team) {
      intent = 'hold';
    } else if (alive <= rivalsAlive - 2 && enemyClock < 0.8) {
      intent = 'regroup';
    } else if (intent !== 'regroup' || alive >= rivalsAlive - 1) {
      intent = 'push';
    }

    if (intent !== before) {
      announceIntent();
    }

    const defended =
      capture.owner === rivalOf(team) || [...sightings.values()].some((sighting) => distanceTo(sighting.position, map.point) < DEFENDED_RADIUS);

    if (intent !== 'push' || !defended) {
      push = { ...push, phase: 'none' };
      staging.clear();
      launchAt = undefined;
      return;
    }

    if (push.phase === 'none') {
      push = { phase: 'gather', since: now, lane: quieterLane() };
      staging.clear();
      launchAt = undefined;
      say(leader(), 'gather', { priority: 2, lane: 'center', marker: { kind: 'gather', ...map.lanes[team].center } });
    }

    if (push.phase === 'gather') {
      const waiting = [...staging.entries()].filter(([member, entry]) => member.tank && now - entry.at < 0.5);
      const arrived = waiting.filter(([, entry]) => entry.arrived).length;
      const everyone = waiting.length > 0 && arrived === waiting.length && (waiting.length >= 2 || now - push.since > 3);

      // No waiting while the enemy is about to take a point nobody holds.
      const hurry = capture.capturer === rivalOf(team) && capture.owner !== rivalOf(team) && capture.progress > HURRY_PROGRESS;

      if (everyone) {
        launchAt ??= now + COUNTDOWN;
      }

      if (launchAt !== undefined && now < launchAt && !hurry) {
        say(leader(), 'countdown', { priority: 2, seconds: Math.ceil(launchAt - now) });
      }

      if ((launchAt !== undefined && now >= launchAt) || hurry || now - push.since > GATHER_TIMEOUT) {
        push = { ...push, phase: 'go', since: now };
        launchAt = undefined;
        pushers.clear();
        lateSince.clear();
        members.filter((member) => member.tank).forEach((member) => pushers.add(member));
        const caller = leader();
        say(caller, caller?.role === 'lead' ? 'followMe' : 'go', { priority: 2, marker: { kind: 'attack', x: map.point.x, y: map.point.y } });
      }
    } else if (push.phase === 'go' && now - push.since > PUSH_WINDOW) {
      push = { ...push, phase: 'none' };
    }
  }

  /** Calls out a new intent: the point taken, or a regroup. */
  function announceIntent() {
    if (intent === 'hold') {
      const holder = members
        .filter((member) => member.tank && !member.human)
        .sort((a, b) => distanceTo(a.tank!.hull.translation(), map.point) - distanceTo(b.tank!.hull.translation(), map.point))[0];
      say(holder, 'captured', { priority: 2 });
    } else if (intent === 'regroup') {
      say(leader(), 'regroup', { priority: 2, marker: { kind: 'gather', ...map.lanes[team].center } });
    }
  }

  /**
   * The bot that calls the team's plan: the Heavy, which leads a push, else a Soldier, a Demoman,
   * a Scout and last a Sniper, the nearest to the rally point among equals.
   */
  function leader() {
    const rally = map.lanes[team].center;
    return members
      .filter((member) => member.tank && !member.human)
      .sort((a, b) => LEAD_ORDER.indexOf(a.tankClass.id) - LEAD_ORDER.indexOf(b.tankClass.id) || distanceTo(a.tank!.hull.translation(), rally) - distanceTo(b.tank!.hull.translation(), rally))[0];
  }

  /** The living bot of the team nearest to `point`. */
  function nearestBot(point: Point) {
    return members
      .filter((member) => member.tank && !member.human)
      .sort((a, b) => distanceTo(a.tank!.hull.translation(), point) - distanceTo(b.tank!.hull.translation(), point))[0];
  }

  /** Has `member`, if any, say `line`. */
  function say(member: Member | undefined, line: RadioLine, options?: CalloutOptions) {
    if (member) {
      radio.say(member, line, options);
    }
  }

  /** Finds the posts again a while after walls fell or rose, so they stand beside the walls that still stand. */
  function refreshPosts(now: number) {
    if (grid.revision !== postsRevision && now - postsAt > POST_REFRESH) {
      posts = findPosts(grid, map, team);
      postsRevision = grid.revision;
      postsAt = now;
      jobs.clear();
    }
  }

  /**
   * The spot on the point its keeper stands on: in the least danger from known enemies and as
   * close to cover as can be, kept until another is clearly better, so the keeper does not dither.
   */
  function chooseKeeperCell() {
    if (![...jobs.values()].includes('point')) {
      keeperCell = undefined;
      return;
    }

    const score = (cell: number) => danger[cell] * KEEPER_DANGER + Math.max(sight[cell] - grid.clearance, 0) / KEEPER_HUG;
    const best = pointCells.reduce<number | undefined>((chosen, cell) => (chosen === undefined || score(cell) < score(chosen) ? cell : chosen), undefined);

    if (keeperCell === undefined || (best !== undefined && score(best) + KEEPER_SWITCH < score(keeperCell))) {
      keeperCell = best;
    }
  }

  /**
   * While the team holds the point, gives its bots their jobs: one keeps to the point, by
   * `POINT_KEEPERS` order of class, and the rest take the posts, the hall's first, each the one
   * it is best at (`POST_ORDER`) and nearest to; a Sniper keeps its perch and bots beyond the posts
   * stay by the point. A bot keeps its job for as long as it lives and the team holds the point.
   */
  function assignJobs() {
    if (intent !== 'hold') {
      jobs.clear();
      return;
    }

    const bots = members.filter((member) => member.tank && !member.human && member.role !== 'sniper');

    for (const member of [...jobs.keys()]) {
      if (!bots.includes(member)) {
        jobs.delete(member);
      }
    }

    const free = () => bots.filter((member) => !jobs.has(member));
    const taken = new Set(jobs.values());

    if (!taken.has('point')) {
      const keeper = free().sort((a, b) => POINT_KEEPERS.indexOf(a.tankClass.id) - POINT_KEEPERS.indexOf(b.tankClass.id) || nearPoint(a) - nearPoint(b))[0];

      if (keeper) {
        jobs.set(keeper, 'point');
      }
    }

    for (const post of posts.filter((candidate) => !taken.has(candidate))) {
      const order = POST_ORDER[post.lane];
      const guard = free().sort(
        (a, b) =>
          order.indexOf(a.tankClass.id) - order.indexOf(b.tankClass.id) ||
          distanceTo(a.tank!.hull.translation(), post.at) - distanceTo(b.tank!.hull.translation(), post.at)
      )[0];

      if (guard) {
        jobs.set(guard, post);
      }
    }
  }

  function nearPoint(member: Member) {
    return distanceTo(member.tank!.hull.translation(), map.point);
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

    const previous = focus;
    focus = best?.tank;
    const now = context.clock();

    // A new focus is called by the bot nearest to it, now and then, so the team hears whom to shoot.
    if (focus && focus !== previous && now - focusCalledAt > FOCUS_CALL) {
      const at = sightings.get(focus)!.position;
      const speaker = nearestBot(at);
      const rival = context.rivals.find((other) => other.tank === focus);

      if (speaker && rival && radio.say(speaker, 'focus', { priority: 2, tankClass: rival.tankClass.id, marker: { kind: 'enemy', x: at.x, y: at.y } })) {
        focusCalledAt = now;
      }
    }
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

    for (const member of [...calling]) {
      if (!victims.includes(member)) {
        calling.delete(member);
      }
    }

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

      // A bot whose core lies open calls for help once while it is under fire and a helper is free to come.
      if (helper && !calling.has(victim) && combat.isCoreOpen(victim.tank!)) {
        calling.add(victim);
        radio.say(victim, 'needHelp', { priority: 2, marker: { kind: 'help', x: at.x, y: at.y } });
      }
    }
  }
}

/** A team's board as returned by `createTeamBoard`. */
export type TeamBoard = ReturnType<typeof createTeamBoard>;

/**
 * The job of each class, after its part in a Team Fortress 2 team: the Scout flanks, the Soldier
 * assaults the point, the Heavy leads the push and soaks up fire, the Demoman supports the
 * others with grenades and the Sniper shoots from afar.
 */
export const ROLE_OF_CLASS: Record<TankClassId, Role> = { scout: 'flank', soldier: 'assault', heavy: 'lead', demoman: 'support', sniper: 'sniper' };
const UPDATE_INTERVAL = 0.25;
/** Seconds the team remembers an enemy it no longer sees. */
const MEMORY = 4;
/** Directions in which an enemy's view is traced for the danger map. */
const SIGHT_RAYS = 360;
/** Enemies beyond this many pixels are no danger: too far to see a tank to aim at. */
export const DANGER_RANGE = 520;
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
/**
 * A member back after the push went in waits for company if it is farther than `LATE_FAR` px from
 * the point, until an ally comes within `LATE_BUDDY` px or `LATE_WAIT` s have passed.
 */
const LATE_FAR = 700;
const LATE_BUDDY = 350;
const LATE_WAIT = 6;
/** Share of its armor a Heavy needs to lead a push. */
const LEAD_ARMOR = 0.5;
/** Classes in the order they keep to the point while the team holds it. */
const POINT_KEEPERS: readonly TankClassId[] = ['demoman', 'soldier', 'heavy', 'scout'];
/**
 * Classes in the order they take each post: the Heavy holds the hall, the busiest way in; a Scout
 * takes a post last, as it would rather hunt.
 */
const POST_ORDER: Record<Post['lane'], readonly TankClassId[]> = {
  center: ['heavy', 'soldier', 'demoman', 'scout'],
  north: ['soldier', 'demoman', 'scout', 'heavy'],
  south: ['soldier', 'demoman', 'scout', 'heavy']
};
/**
 * The point's keeper stands at least `KEEPER_MARGIN` px inside its edge; a spot scores
 * `KEEPER_DANGER` per known enemy that sees it and one per `KEEPER_HUG` px from cover, and the
 * keeper moves only for a spot `KEEPER_SWITCH` better.
 */
const KEEPER_MARGIN = 20;
const KEEPER_DANGER = 10;
const KEEPER_HUG = 30;
const KEEPER_SWITCH = 2;
/** Seconds after walls changed before the team looks for its posts again. */
const POST_REFRESH = 3;
/** Classes in the order they lead the team's push and call its plan. */
const LEAD_ORDER: readonly TankClassId[] = ['heavy', 'soldier', 'demoman', 'scout', 'sniper'];
/** Seconds of countdown from everyone at their staging spot to going in. */
const COUNTDOWN = 2;
/** Seconds between the team's calls of a new focus. */
const FOCUS_CALL = 8;
/** Seconds a spot where a member was destroyed counts as deadly, and how far around it. */
const DEADLY_TIME = 20;
const DEADLY_RADIUS = 110;
/**
 * A Sniper leaves its perch when a known enemy comes within `PERCH_THREAT` px or an enemy Sniper
 * within `SNIPER_SIGHT` px sees it. Choosing another, a perch scores `PERCH_EXPOSURE` less per
 * enemy that sees it, one less per `PERCH_TRAVEL` px away, and `PERCH_UNSAFE` less if not safe.
 */
const PERCH_THREAT = 320;
const SNIPER_SIGHT = 900;
const PERCH_EXPOSURE = 10;
const PERCH_TRAVEL = 40;
const PERCH_UNSAFE = 1000;
/** Half size of a crate's armor. */
const CRATE_HALF = { x: 21.25, y: 46.25 };
const CRATE_COST = 3;

/** Signed distance to an axis-aligned box of half size `halfX` x `halfY` around the origin. */
function boxDistance(x: number, y: number, halfX: number, halfY: number) {
  const qx = Math.abs(x) - halfX;
  const qy = Math.abs(y) - halfY;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0);
}

function distanceTo(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
