import { pullSpeedFor, type Tank } from '../arena/bodies';
import { createCombat } from '../damage/combat';
import type { createRangeRenderer } from '../damage/renderer';
import type { Rapier } from '../physics/Rapier2D';
import type { World } from '../physics/World';
import { createBot, type Bot } from './bot';
import { createGun } from './gun';
import { createKits } from './kits';
import { inBase, KOTH_MAP, onPoint, type KothMap } from './map';
import { createNavGrid, updateNavGrid } from './navigation';
import { advanceCapture, CAPTURE_RULES, createCaptureState, rivalOf, TEAMS, type CaptureRules, type TeamId } from './rules';
import { createScenery } from './scenery';
import { MEDIUM_TANK } from './tanks';
import { createTeamBoard, type Member, type TeamBoard } from './team';

type Point = { x: number; y: number };

/**
 * A king of the hill match, red against blue, four tanks a side: the player and three bots for
 * red, four bots for blue. Every tank is a `MEDIUM_TANK` firing shells on the battle core of
 * `createCombat`, without friendly fire. The point in the middle opens after a while and is taken
 * by standing on it (see `./rules`); the first team to hold it for the hold time wins. Destroyed
 * tanks come back at their base in waves, as in Team Fortress 2. A tank in its own base has its
 * armor mended, and repair kits on the map mend it on the way (see `./kits`).
 *
 * The match owns its Rapier bodies and renderer slots; `restart` begins a new match on the same map.
 *
 * @param options.human - Whether red's first seat is the player's; without one all eight tanks are bots.
 * @param options.random - Source of randomness in [0, 1) for bots and damage; defaults to `Math.random`.
 * @param options.rules - Capture timings; defaults to `CAPTURE_RULES`.
 */
export function createKothMatch(
  rapier: Rapier,
  world: World,
  renderer: ReturnType<typeof createRangeRenderer>,
  options: { human?: boolean; random?: () => number; rules?: CaptureRules; map?: KothMap } = {}
) {
  const map = options.map ?? KOTH_MAP;
  const rules = options.rules ?? CAPTURE_RULES;
  const random = options.random ?? Math.random;
  const members = createMembers(options.human ?? true);
  const teams = { red: members.filter((member) => member.team === 'red'), blue: members.filter((member) => member.team === 'blue') };
  // Destroyed tanks stay here, so a shell still flying from one is credited to its member.
  const byTank = new Map<Tank, Member>();
  const combat = createCombat(rapier, world, renderer, map, {
    shell: MEDIUM_TANK.shell,
    friendlyFire: false,
    // Wrecks burn out quicker than on the range, so their smoke does not hide the point for long.
    wreckFire: WRECK_FIRE,
    random,
    onHit: (target, shooter) => noteShot(byTank.get(target), shooter),
    onDestroyed: destroyed,
    // Shot-apart walls open new ways and lines of fire; the grid follows where they changed.
    onWallsChanged: (bounds) => updateNavGrid(grid, grow(bounds, NAV_REACH), (point) => combat.obstacleDistance(point, NAV_CAP))
  });
  const grid = createNavGrid(map);
  const scenery = createScenery(renderer, map, { red: rgb(TEAM_COLORS.red), blue: rgb(TEAM_COLORS.blue) });
  const kits = createKits(renderer, map.kits, combat);
  let time = 0;
  let playerKitAt = -Infinity;
  let capture = createCaptureState(rules);
  let nextRepair = 0;
  let feedId = 0;
  const feed: { id: number; at: number; killer?: Member; victim: Member }[] = [];
  const boards: Record<TeamId, TeamBoard> = {
    red: createBoard('red'),
    blue: createBoard('blue')
  };
  const bots = new Map<Member, Bot>();

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

    /** The repair kits on the map. */
    kits,

    /**
     * Advances the match by one fixed physics step: the player's input, every bot, physics,
     * respawns, repairs and the capture. After a win tanks stop and only the wreckage moves.
     *
     * @param input.drive - Player's drive direction in world axes, length up to 1.
     * @param input.aim - Direction the player wants the turret to point, in world radians; the
     *   turret follows it at once, as in a shooter. Without it the turret stays.
     * @param input.fire - Whether the player holds the trigger.
     */
    step(dt: number, input: { drive: Point; aim?: number; fire: boolean } = { drive: STOP, fire: false }) {
      time += dt;

      for (const member of members) {
        member.gun?.step(dt);
      }

      if (capture.winner) {
        members.forEach((member) => member.tank && combat.drive(member.tank, STOP));
        combat.step(dt);
        return;
      }

      const player = members.find((member) => member.human && !bots.has(member));

      if (player?.tank) {
        combat.drive(player.tank, input.drive);

        if (input.aim !== undefined) {
          player.tank.turretAngle = input.aim;
        }

        if (input.fire) {
          fire(player);
        }
      }

      boards.red.update();
      boards.blue.update();

      for (const bot of bots.values()) {
        bot.step(dt);
      }

      // Kits are taken before physics, which refreshes the mended armor's shape within this step.
      for (const taker of kits.step(time, combat.tanks)) {
        if (taker === members[0].tank) {
          playerKitAt = time;
        }
      }

      combat.step(dt);
      nearMisses();
      respawn();
      repair();

      const presence = { red: 0, blue: 0 };

      for (const member of members) {
        if (member.tank && onPoint(map, member.tank.hull.translation())) {
          presence[member.team]++;
        }
      }

      capture = advanceCapture(capture, presence, dt, rules);
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
      combat.draw(view, () => {
        scenery.draw(capture);
        kits.draw(time);
      });
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
          rounds: human.gun?.rounds ?? 0,
          clip: MEDIUM_TANK.gun.clip,
          loading: human.gun?.loading ?? 0,
          armor: human.tank ? combat.armorLeft(human.tank) : 0,
          coreOpen: human.tank ? combat.isCoreOpen(human.tank) : false,
          mending:
            human.tank !== undefined &&
            ((inBase(map.bases.red, human.tank.hull.translation()) && combat.armorLeft(human.tank) < 0.99) || time - playerKitAt < KIT_NOTICE)
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
      kits.reset();
      byTank.clear();
      time = 0;
      nextRepair = 0;
      playerKitAt = -Infinity;
      capture = createCaptureState(rules);
      feed.length = 0;
      boards.red.reset();
      boards.blue.reset();

      for (const member of members) {
        member.tank = undefined;
        member.gun = undefined;
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
      fire,
      kits: kits.kits
    };
  }

  /** Fires the member's gun if it is ready. */
  function fire(member: Member) {
    const tank = member.tank;

    if (!tank || !member.gun?.fire()) {
      return false;
    }

    combat.fire(tank);
    return true;
  }

  /** Puts the member's tank on a free spawn spot of its base. */
  function spawn(member: Member) {
    const spawns = map.bases[member.team].spawns;
    const taken = (spot: Point) => combat.tanks.some((tank) => distance(tank.hull.translation(), spot) < SPAWN_CLEARANCE);
    const placement =
      [...spawns.slice(member.index % spawns.length), ...spawns.slice(0, member.index % spawns.length)].find((spot) => !taken(spot)) ??
      spawns[member.index % spawns.length];
    const tank = combat.spawnTank(placement, {
      color: member.index === 0 && member.team === 'red' ? PLAYER_COLOR : TEAM_COLORS[member.team],
      team: member.team,
      pullSpeed: pullSpeedFor(MEDIUM_TANK.speed)
    });

    member.tank = tank;
    member.gun = createGun(MEDIUM_TANK.gun);
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
    member.gun = undefined;
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

/** One member's line on the heads-up display. */
export type MemberHud = {
  id: number;
  name: string;
  human: boolean;
  role: Member['role'];
  alive: boolean;
  respawnIn: number;
  kills: number;
  deaths: number;
};

/** Hull colors of the teams, and of the player's own tank. */
export const TEAM_COLORS: Record<TeamId, number> = { red: 0xc9473b, blue: 0x3b73c9 };
export const PLAYER_COLOR = 0xf0773a;

const STOP = { x: 0, y: 0 };
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
/** Seconds the display tells the player that a repair kit mended their armor. */
const KIT_NOTICE = 1.2;
/**
 * A changed wall changes the obstacle distance of grid cells up to `NAV_REACH` px away, as far as
 * it matters for driving, which looks no further than `NAV_CAP` px.
 */
const NAV_REACH = 96;
const NAV_CAP = 128;

/** The team's intent in a few words, with the stage of a coordinated push. */
function describePlan(board: TeamBoard) {
  if (board.intent !== 'push') {
    return board.intent;
  }

  return board.phase === 'gather' ? 'push · gathering' : board.phase === 'go' ? 'push · going in' : 'push';
}

function createMembers(human: boolean): Member[] {
  return TEAMS.flatMap((team, teamIndex) =>
    [0, 1, 2, 3].map((index) => ({
      id: teamIndex * 4 + index,
      team,
      index,
      name: team === 'red' && index === 0 && human ? 'You' : `${team === 'red' ? 'Red' : 'Blue'} ${index + 1}`,
      human: team === 'red' && index === 0 && human,
      tank: undefined,
      gun: undefined,
      role: 'assault' as const,
      respawnAt: undefined,
      shotAt: -Infinity,
      attacker: undefined,
      kills: 0,
      deaths: 0
    }))
  );
}

/** `bounds` grown by `margin` on every side. */
function grow(bounds: { minX: number; minY: number; maxX: number; maxY: number }, margin: number) {
  return { minX: bounds.minX - margin, minY: bounds.minY - margin, maxX: bounds.maxX + margin, maxY: bounds.maxY + margin };
}

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
