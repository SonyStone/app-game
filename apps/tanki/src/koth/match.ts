import { pullSpeedFor, type Tank } from '../arena/bodies';
import { createCombat } from '../damage/combat';
import type { createRangeRenderer } from '../damage/renderer';
import type { Rapier } from '../physics/Rapier2D';
import type { World } from '../physics/World';
import { createBot, type Bot } from './bot';
import { angleBetween, clampGun, turnInPlace } from './classes/casemate';
import { TANK_CLASSES } from './classes/classes';
import { pickRoster, rebalance } from './classes/roster';
import { drawSight } from './classes/sight';
import { createWeapon, type Trigger } from './classes/weapon';
import { inBase, KOTH_MAP, onPoint, type KothMap } from './map';
import { createNavGrid } from './navigation';
import { advanceCapture, CAPTURE_RULES, createCaptureState, rivalOf, TEAMS, type CaptureRules, type TeamId } from './rules';
import { createScenery } from './scenery';
import { MEDIUM_TANK, type TankClassId } from './tanks';
import { createTeamBoard, ROLE_OF_CLASS, type Member, type TeamBoard } from './team';

type Point = { x: number; y: number };

/**
 * A king of the hill match, red against blue, four tanks a side: the player and three bots for
 * red, four bots for blue. Every tank is of one of the classes of `./classes/classes`, after
 * Team Fortress 2, firing its own weapon on the battle core of `createCombat`, without friendly
 * fire. Bots fill their teams with classes as a sensible team would (see `./classes/roster`); the
 * player picks a class with `chooseClass`, which takes effect at once in the player's base and
 * otherwise at the next respawn. The point in the middle opens after a while and is taken by
 * standing on it (see `./rules`), a Scout counting double; the first team to hold it for the hold
 * time wins. Destroyed tanks come back at their base in waves, as in Team Fortress 2, and a tank
 * in its own base has its armor mended.
 *
 * The match owns its Rapier bodies and renderer slots; `restart` begins a new match on the same map.
 *
 * @param options.human - Whether red's first seat is the player's; without one all eight tanks are bots.
 * @param options.random - Source of randomness in [0, 1) for bots and damage; defaults to `Math.random`.
 * @param options.rules - Capture timings; defaults to `CAPTURE_RULES`.
 * @param options.roster - Classes of every seat of a team, which also sets the team's size, for
 *   tests and duels; bots then keep their classes. Teams without one get four seats picked by
 *   `pickRoster`.
 * @param options.playerClass - The player's first class; defaults to the Soldier.
 * @param options.onHit - Called for every hit, as the battle core's `onHit`, for tools that measure the fighting.
 */
export function createKothMatch(
  rapier: Rapier,
  world: World,
  renderer: ReturnType<typeof createRangeRenderer>,
  options: {
    human?: boolean;
    random?: () => number;
    rules?: CaptureRules;
    map?: KothMap;
    roster?: Partial<Record<TeamId, readonly TankClassId[]>>;
    playerClass?: TankClassId;
    onHit?: NonNullable<Parameters<typeof createCombat>[4]>['onHit'];
  } = {}
) {
  const map = options.map ?? KOTH_MAP;
  const rules = options.rules ?? CAPTURE_RULES;
  const random = options.random ?? Math.random;
  const hasPlayer = options.human ?? true;
  const members = createMembers(hasPlayer, options.roster ?? {}, options.playerClass ?? 'soldier', random);
  const teams = { red: members.filter((member) => member.team === 'red'), blue: members.filter((member) => member.team === 'blue') };
  // Destroyed tanks stay here, so a shell still flying from one is credited to its member.
  const byTank = new Map<Tank, Member>();
  const combat = createCombat(rapier, world, renderer, map, {
    shell: MEDIUM_TANK.shell,
    friendlyFire: false,
    // Wrecks burn out quicker than on the range, so their smoke does not hide the point for long.
    wreckFire: WRECK_FIRE,
    random,
    onHit: (target, shooter, part) => {
      noteShot(byTank.get(target), shooter);
      options.onHit?.(target, shooter, part);
    },
    onDestroyed: destroyed
  });
  const grid = createNavGrid(map);
  const scenery = createScenery(renderer, map, { red: rgb(TEAM_COLORS.red), blue: rgb(TEAM_COLORS.blue) });
  let time = 0;
  let capture = createCaptureState(rules);
  let nextRepair = 0;
  let feedId = 0;
  const feed: { id: number; at: number; killer?: Member; victim: Member }[] = [];
  const boards: Record<TeamId, TeamBoard> = {
    red: createBoard('red'),
    blue: createBoard('blue')
  };
  const bots = new Map<Member, Bot>();
  /** Angle the gatling barrels of each member have turned, for drawing. */
  const barrels = new Map<Member, number>();

  for (const member of members) {
    if (!member.human) {
      bots.set(member, createBot(member, botContext(member)));
    }

    spawn(member);
  }

  return {
    /** The map the match is played on. */
    map,

    /** All eight seats, red's first. */
    members,

    /** The player's tank; `undefined` while it waits to respawn or when no seat is the player's. */
    get player() {
      return members.find((member) => member.human)?.tank;
    },

    /** The player's seat, also while a bot drives it. */
    get seat() {
      return members[0];
    },

    /** Seconds since the match began. */
    get time() {
      return time;
    },

    /** The control point and the teams' clocks. */
    get capture() {
      return capture;
    },

    /** Camera shake in world pixels from nearby shots and explosions. */
    get shake() {
      return combat.shake;
    },

    /** The bot driving each seat that has one. */
    bots,

    /** The battle core, for tests and tools. */
    combat,

    /**
     * Advances the match by one fixed physics step: the player's input, every bot, the weapons,
     * physics, respawns, repairs and the capture. After a win tanks stop and only the wreckage moves.
     *
     * @param input.drive - Player's drive direction in world axes, length up to 1.
     * @param input.aim - Direction the player wants the turret to point, in world radians; the
     *   turret follows it at once, as in a shooter, and a casemate gun as far as its arc lets it.
     *   Without it the turret stays.
     * @param input.fire - Whether the player holds the trigger.
     * @param input.rev - Whether the player spins a gatling up without firing.
     * @param input.reach - How far away the player aims, in pixels, where a grenade should land.
     * @param input.turn - Whether a casemate gun turns its hull on the spot toward the aim instead
     *   of driving.
     */
    step(dt: number, input: PlayerInput = { drive: STOP, fire: false }) {
      time += dt;

      if (capture.winner) {
        members.forEach((member) => member.tank && combat.drive(member.tank, STOP));
        arm(dt);
        combat.step(dt);
        return;
      }

      const player = members.find((member) => member.human && !bots.has(member));

      if (player?.tank) {
        steerPlayer(player, input);
      }

      boards.red.update();
      boards.blue.update();

      for (const bot of bots.values()) {
        bot.step(dt);
      }

      arm(dt);
      combat.step(dt);
      nearMisses();
      respawn();
      repair();

      // A tank on the point counts as many tanks as its class does there, a Scout twice.
      const presence = { red: 0, blue: 0 };

      for (const member of members) {
        if (member.tank && onPoint(map, member.tank.hull.translation())) {
          presence[member.team] += member.tankClass.capture;
        }
      }

      capture = advanceCapture(capture, presence, dt, rules);
    },

    /**
     * Picks the player's class. In the player's own base the tank is swapped for one of the new
     * class at once, as in a Team Fortress 2 spawn room; elsewhere, or while waiting to respawn,
     * the new class comes with the next respawn.
     */
    chooseClass(id: TankClassId) {
      const seat = members[0];

      if (!hasPlayer) {
        return;
      }

      const tank = seat.tank;
      seat.nextClass = id === seat.tankClass.id && !tank ? undefined : id;

      if (tank && id !== seat.tankClass.id && inBase(map.bases[seat.team], tank.hull.translation())) {
        combat.removeTank(tank);
        spawn(seat);
        bots.get(seat)?.reset();
      }
    },

    /** Moves debris and effects over a frame of `dt` seconds. */
    update(dt: number) {
      combat.update(dt);
    },

    /**
     * Queues the floor, bases, point, tanks and effects for drawing.
     *
     * @param view - Point on the ground under the camera.
     */
    draw(view: Point) {
      combat.draw(
        view,
        () => scenery.draw(capture),
        () => drawSights()
      );
    },

    /** What the heads-up display shows. */
    hud() {
      const human = members[0];

      return {
        capture,
        holdTime: rules.holdTime,
        teams: Object.fromEntries(
          TEAMS.map((team) => [
            team,
            {
              left: Math.max(rules.holdTime - capture.held[team], 0),
              kills: teams[team].reduce((total, member) => total + member.kills, 0),
              plan: describePlan(boards[team]),
              onPoint: teams[team].filter((member) => member.tank && onPoint(map, member.tank.hull.translation())).length,
              members: teams[team].map((member) => ({
                id: member.id,
                name: member.name,
                human: member.human,
                role: member.role,
                tankClass: member.tankClass.id,
                alive: member.tank !== undefined,
                respawnIn: member.respawnAt === undefined ? 0 : Math.max(member.respawnAt - time, 0),
                kills: member.kills,
                deaths: member.deaths
              }))
            }
          ])
        ) as Record<TeamId, { left: number; kills: number; plan: string; onPoint: number; members: MemberHud[] }>,
        player: {
          alive: human.tank !== undefined,
          respawnIn: human.respawnAt === undefined ? 0 : Math.max(human.respawnAt - time, 0),
          tankClass: human.tankClass.id,
          nextClass: human.nextClass,
          weapon: human.tankClass.weapon.kind,
          rounds: human.weapon?.rounds ?? 0,
          clip: human.tankClass.gun.clip,
          loading: human.weapon?.loading ?? 0,
          spin: human.weapon?.spin ?? 0,
          charge: human.weapon?.charge,
          airborne: human.tank ? combat.isAirborne(human.tank) : false,
          armor: human.tank ? combat.armorLeft(human.tank) : 0,
          coreOpen: human.tank ? combat.isCoreOpen(human.tank) : false,
          mending: human.tank !== undefined && inBase(map.bases.red, human.tank.hull.translation()) && combat.armorLeft(human.tank) < 0.99
        },
        feed: feed
          .filter((entry) => time - entry.at < FEED_TIME)
          .map((entry) => ({
            id: entry.id,
            killer: entry.killer && { name: entry.killer.name, team: entry.killer.team },
            victim: { name: entry.victim.name, team: entry.victim.team }
          }))
      };
    },

    /** Every bot's goal, action, plan and path, for the debug overlay. */
    thoughts() {
      return [...bots.values()].flatMap((bot) => {
        const tank = bot.member.tank;
        return tank ? [{ member: bot.member, position: tank.hull.translation(), ...bot.thought() }] : [];
      });
    },

    /** Hands the player's seat to a bot, or back to the player. */
    spectate(on: boolean) {
      const seat = members[0];

      if (options.human === false) {
        return;
      }

      seat.human = !on;
      seat.name = on ? 'You (bot)' : 'You';

      if (on && !bots.has(seat)) {
        const bot = createBot(seat, botContext(seat));
        bots.set(seat, bot);
      } else if (!on) {
        bots.delete(seat);
      }
    },

    /** Clears the field and starts a new match. */
    restart() {
      combat.reset();
      byTank.clear();
      time = 0;
      nextRepair = 0;
      capture = createCaptureState(rules);
      feed.length = 0;
      boards.red.reset();
      boards.blue.reset();

      for (const member of members) {
        member.tank = undefined;
        member.weapon = undefined;
        member.trigger = RELEASED;
        member.pivot = undefined;
        member.kills = 0;
        member.deaths = 0;
        member.shotAt = -Infinity;
        member.attacker = undefined;
        spawn(member);
        bots.get(member)?.reset();
      }
    }
  };

  function createBoard(team: TeamId) {
    return createTeamBoard(team, teams[team], {
      combat,
      grid,
      map,
      rivals: teams[rivalOf(team)],
      clock: () => time,
      capture: () => capture,
      holdTime: rules.holdTime
    });
  }

  function botContext(member: Member) {
    return {
      combat,
      grid,
      map,
      board: boards[member.team],
      allies: teams[member.team],
      rivals: teams[rivalOf(member.team)],
      capture: () => capture,
      rules,
      clock: () => time,
      random,
      trigger: (member: Member, trigger: Trigger) => {
        member.trigger = trigger;
      }
    };
  }

  /**
   * Drives and aims the player's tank from the input. A casemate gun's gun follows the aim within
   * its arc; when the player does not drive and aims outside the arc, or asks to turn, the hull
   * turns on the spot toward the aim instead, until it points there.
   */
  function steerPlayer(player: Member, input: PlayerInput) {
    const tank = player.tank!;
    const mount = player.tankClass.mount;
    const idle = Math.hypot(input.drive.x, input.drive.y) < IDLE_DRIVE;
    const off = input.aim === undefined ? 0 : Math.abs(angleBetween(tank.hull.rotation(), input.aim));
    const turning = input.turn || (idle && (off > (mount.kind === 'casemate' ? mount.arc : Infinity) || (player.pivot !== undefined && off > SETTLED)));

    if (mount.kind === 'casemate' && turning && input.aim !== undefined) {
      player.pivot ??= { ...tank.hull.translation() };
      combat.drive(tank, turnInPlace(tank, player.pivot, input.aim, mount.traverse, tank.pullSpeed));
    } else {
      player.pivot = undefined;
      combat.drive(tank, input.drive);
    }

    if (input.aim !== undefined) {
      tank.turretAngle = input.aim;
    }

    player.trigger = { fire: input.fire, rev: input.rev, reach: input.reach };
  }

  /**
   * Works every tank's weapon for a step with the trigger its member set: fires the shots it
   * gives along the gun, keeps casemate guns inside their arcs, slows tanks whose weapon slows
   * them and turns the gatlings. Then lets go of every trigger.
   */
  function arm(dt: number) {
    for (const member of members) {
      const tank = member.tank;
      const weapon = member.weapon;

      if (!tank || !weapon) {
        continue;
      }

      const tankClass = member.tankClass;

      if (tankClass.mount.kind === 'casemate') {
        clampGun(tank, tankClass.mount.arc);
      }

      for (const shot of weapon.step(dt, capture.winner ? RELEASED : member.trigger)) {
        combat.fire(tank, { ...shot, angle: tank.turretAngle + (shot.angle ?? 0) });
      }

      member.trigger = RELEASED;
      tank.pullSpeed = pullSpeedFor(tankClass.speed) * weapon.speedShare;
      const turned = (barrels.get(member) ?? 0) + weapon.spin * BARREL_TURN * dt;
      barrels.set(member, turned);
      combat.spinBarrels(tank, turned);
    }
  }

  /** The laser sight of every casemate gun charging a shot, which everyone sees, as the Sniper's dot. */
  function drawSights() {
    for (const member of members) {
      const charge = member.weapon?.charge;

      if (member.tank && charge !== undefined) {
        drawSight(renderer, combat, member.tank, charge, member.tankClass.shell.range, rgb(TEAM_SIGHT[member.team]));
      }
    }
  }

  /**
   * Puts the member's tank on a free spawn spot of its base, of the class it asked for, if any.
   * A bot whose class no longer fits its team, as after the player took it, switches to the
   * class the team needs.
   */
  function spawn(member: Member) {
    const spawns = map.bases[member.team].spawns;
    const taken = (spot: Point) => combat.tanks.some((tank) => distance(tank.hull.translation(), spot) < SPAWN_CLEARANCE);
    const placement =
      [...spawns.slice(member.index % spawns.length), ...spawns.slice(0, member.index % spawns.length)].find((spot) => !taken(spot)) ??
      spawns[member.index % spawns.length];

    if (!member.human && !options.roster?.[member.team]) {
      const team = teams[member.team].filter((other) => other !== member).map((other) => other.nextClass ?? other.tankClass.id);
      member.nextClass = rebalance(team, member.nextClass ?? member.tankClass.id, teams[member.team].length, random);
    }

    const tankClass = TANK_CLASSES[member.nextClass ?? member.tankClass.id];
    const tank = combat.spawnTank(placement, {
      color: member.index === 0 && member.team === 'red' ? PLAYER_COLOR : TEAM_COLORS[member.team],
      team: member.team,
      pullSpeed: pullSpeedFor(tankClass.speed),
      hull: tankClass.hull,
      mass: tankClass.mass,
      look: tankClass.look
    });

    member.tank = tank;
    member.tankClass = tankClass;
    member.role = ROLE_OF_CLASS[tankClass.id];
    member.nextClass = undefined;
    member.weapon = createWeapon(tankClass, random);
    member.trigger = RELEASED;
    member.pivot = undefined;
    member.respawnAt = undefined;
    byTank.set(tank, member);
  }

  function respawn() {
    for (const member of members) {
      if (!member.tank && member.respawnAt !== undefined && member.respawnAt <= time) {
        spawn(member);
        bots.get(member)?.reset();
      }
    }
  }

  /** Mends the armor of every tank inside its own base, a few times a second. */
  function repair() {
    if (time < nextRepair) {
      return;
    }

    nextRepair = time + REPAIR_INTERVAL;

    for (const member of members) {
      const tank = member.tank;

      if (tank && combat.armorLeft(tank) < 0.999 && inBase(map.bases[member.team], tank.hull.translation())) {
        combat.repair(tank, 1 - Math.exp(-REPAIR_RATE * REPAIR_INTERVAL));
      }
    }
  }

  function destroyed(victim: Tank, killer: Tank | undefined) {
    const member = byTank.get(victim);
    const credited = killer && byTank.get(killer);

    if (!member) {
      return;
    }

    member.tank = undefined;
    member.weapon = undefined;
    member.respawnAt = nextWave(time + MIN_RESPAWN);
    member.deaths++;

    if (credited && credited.team !== member.team) {
      credited.kills++;
    }

    feed.push({ id: feedId++, at: time, killer: credited, victim: member });
  }

  /** Marks a member as under fire from `shooter`. */
  function noteShot(member: Member | undefined, shooter: Tank | undefined) {
    if (member && shooter && byTank.get(shooter)?.team !== member.team) {
      member.shotAt = time;
      member.attacker = shooter;
    }
  }

  /** A shell that flies close past an enemy tank puts it under fire as much as a hit. */
  function nearMisses() {
    for (const shell of combat.shells) {
      for (const member of members) {
        if (member.tank && member.team !== shell.team && distance(member.tank.hull.translation(), shell) < NEAR_MISS) {
          noteShot(member, shell.shooter);
        }
      }
    }
  }
}

/** A king of the hill match as returned by `createKothMatch`. */
export type KothMatch = ReturnType<typeof createKothMatch>;

/** The player's input for a step, as `KothMatch['step']` describes it. */
export type PlayerInput = { drive: Point; aim?: number; fire: boolean; rev?: boolean; reach?: number; turn?: boolean };

/** One member's line on the heads-up display. */
export type MemberHud = {
  id: number;
  name: string;
  human: boolean;
  role: Member['role'];
  tankClass: TankClassId;
  alive: boolean;
  respawnIn: number;
  kills: number;
  deaths: number;
};

/** Hull colors of the teams, and of the player's own tank. */
export const TEAM_COLORS: Record<TeamId, number> = { red: 0xc9473b, blue: 0x3b73c9 };
export const PLAYER_COLOR = 0xf0773a;

/** Colors of the teams' laser sights: brighter than their hulls, to stand out on the ground. */
const TEAM_SIGHT: Record<TeamId, number> = { red: 0xff3b2e, blue: 0x3fa2ff };

const STOP = { x: 0, y: 0 };
const RELEASED: Trigger = { fire: false };
/** Drive input below which the player counts as not driving, and how near the aim a casemate's hull stops turning, in radians. */
const IDLE_DRIVE = 0.1;
const SETTLED = 0.03;
/** Radians per second the barrels of a fully spun gatling turn. */
const BARREL_TURN = 40;
/**
 * Destroyed tanks come back in waves every `RESPAWN_WAVE` seconds, after at least `MIN_RESPAWN`:
 * between 5 and 11 s, 8 s on average, so the dead of a lost fight return together.
 */
const RESPAWN_WAVE = 6;
const MIN_RESPAWN = 5;
const WRECK_FIRE = 5;
/** Share of armor damage mended per second in the base is `1 - exp(-REPAIR_RATE)`. */
const REPAIR_RATE = 0.9;
const REPAIR_INTERVAL = 0.25;
const SPAWN_CLEARANCE = 40;
/** A shell passing closer than this many pixels to a tank's center puts it under fire. */
const NEAR_MISS = 45;
/** Seconds a kill stays in the feed. */
const FEED_TIME = 6;

/** The team's intent in a few words, with the stage of a coordinated push. */
function describePlan(board: TeamBoard) {
  if (board.intent !== 'push') {
    return board.intent;
  }

  return board.phase === 'gather' ? 'push · gathering' : board.phase === 'go' ? 'push · going in' : 'push';
}

/**
 * The seats of both teams, red's first: the classes of `roster`, or four seats each with the
 * player's class for the player's seat and `pickRoster`'s for the bots.
 */
function createMembers(human: boolean, roster: Partial<Record<TeamId, readonly TankClassId[]>>, playerClass: TankClassId, random: () => number): Member[] {
  let id = 0;

  return TEAMS.flatMap((team) => {
    const taken = team === 'red' && human ? [playerClass] : [];
    const classes = roster[team] ?? [...taken, ...pickRoster(TEAM_SIZE, taken, random)];

    return classes.map((classId, index) => ({
      id: id++,
      team,
      index,
      name: team === 'red' && index === 0 && human ? 'You' : `${team === 'red' ? 'Red' : 'Blue'} ${index + 1}`,
      human: team === 'red' && index === 0 && human,
      tank: undefined,
      tankClass: TANK_CLASSES[classId],
      nextClass: undefined,
      weapon: undefined,
      trigger: RELEASED,
      pivot: undefined,
      role: ROLE_OF_CLASS[classId],
      respawnAt: undefined,
      shotAt: -Infinity,
      attacker: undefined,
      kills: 0,
      deaths: 0
    }));
  });
}

/** Seats of a team without a roster of its own. */
const TEAM_SIZE = 4;

/** The first respawn wave at or after match time `time`. */
function nextWave(time: number) {
  return Math.ceil(time / RESPAWN_WAVE) * RESPAWN_WAVE;
}

function distance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Converts a 0xRRGGBB color to components 0-1. */
function rgb(color: number) {
  return [((color >> 16) & 255) / 255, ((color >> 8) & 255) / 255, (color & 255) / 255];
}
