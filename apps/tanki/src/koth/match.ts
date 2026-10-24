import { PLAYER_PULL_SPEED, type Tank } from '../arena/bodies';
import { createCombat } from '../damage/combat';
import type { createRangeRenderer } from '../damage/renderer';
import type { Rapier } from '../physics/Rapier2D';
import type { World } from '../physics/World';
import { createBot, type Bot } from './bot';
import { inBase, KOTH_MAP, onPoint, type KothMap } from './map';
import { createNavGrid } from './navigation';
import { advanceCapture, CAPTURE_RULES, createCaptureState, rivalOf, TEAMS, type CaptureRules, type TeamId } from './rules';
import { createScenery } from './scenery';
import { createTeamBoard, type Member, type TeamBoard } from './team';

type Point = { x: number; y: number };

/**
 * A king of the hill match, red against blue, four tanks a side: the player and three bots for
 * red, four bots for blue. Tanks fight on the battle core of `createCombat` without friendly
 * fire; the point in the middle is taken by standing on it (see `./rules`), and the first team to
 * hold it for the hold time wins. Destroyed tanks come back at their base after a few seconds,
 * and a tank in its own base has its armor mended.
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
  const byTank = new Map<Tank, Member>();
  const combat = createCombat(rapier, world, renderer, map, {
    friendlyFire: false,
    // Wrecks burn out quicker than on the range, so their smoke does not hide the point for long.
    wreckFire: WRECK_FIRE,
    random,
    onHit: (target, shooter) => noteShot(byTank.get(target), shooter),
    onShot: nearMisses,
    onDestroyed: destroyed
  });
  const grid = createNavGrid(map);
  const scenery = createScenery(renderer, map, { red: rgb(TEAM_COLORS.red), blue: rgb(TEAM_COLORS.blue) });
  let time = 0;
  let capture = createCaptureState();
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

    /**
     * Advances the match by one fixed physics step: the player's input, every bot, physics,
     * respawns, repairs and the capture. After a win tanks stop and only the wreckage moves.
     *
     * @param input.drive - Player's drive direction in world axes, length up to 1; the turret is
     *   aimed by the caller on `player.turretAngle`.
     * @param input.fire - Whether the player holds the trigger.
     */
    step(dt: number, input: { drive: Point; fire: boolean } = { drive: STOP, fire: false }) {
      time += dt;

      for (const member of members) {
        if (member.tank) {
          member.tank.reload = Math.max(member.tank.reload - dt, 0);
        }
      }

      if (capture.winner) {
        members.forEach((member) => member.tank && combat.drive(member.tank, STOP));
        combat.step(dt);
        return;
      }

      const player = members.find((member) => member.human && !bots.has(member));

      if (player?.tank) {
        combat.drive(player.tank, input.drive);

        if (input.fire) {
          fire(player);
        }
      }

      boards.red.update();
      boards.blue.update();

      for (const bot of bots.values()) {
        bot.step(dt);
      }

      combat.step(dt);
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
      combat.draw(view, () => scenery.draw(capture));
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
      capture = createCaptureState();
      feed.length = 0;
      boards.red.reset();
      boards.blue.reset();

      for (const member of members) {
        member.tank = undefined;
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
      fire
    };
  }

  /** Fires the member's gun if it has reloaded. */
  function fire(member: Member) {
    const tank = member.tank;

    if (!tank || tank.reload > 0) {
      return false;
    }

    tank.reload = RELOAD;
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
      pullSpeed: PLAYER_PULL_SPEED
    });

    member.tank = tank;
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
    byTank.delete(victim);

    if (!member) {
      return;
    }

    member.tank = undefined;
    member.respawnAt = time + RESPAWN_TIME;
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

  /** A shot that flies close past an enemy tank puts it under fire as much as a hit. */
  function nearMisses(shooter: Tank, path: readonly Point[]) {
    const team = byTank.get(shooter)?.team;

    for (const member of members) {
      if (!member.tank || member.team === team) {
        continue;
      }

      const at = member.tank.hull.translation();

      for (let index = 1; index < path.length; index++) {
        if (segmentDistance(at, path[index - 1], path[index]) < NEAR_MISS) {
          noteShot(member, shooter);
          break;
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
/** Seconds between shots, as on the damage range. */
const RELOAD = 0.1;
const RESPAWN_TIME = 5;
const WRECK_FIRE = 5;
/** Share of armor damage mended per second in the base is `1 - exp(-REPAIR_RATE)`. */
const REPAIR_RATE = 0.9;
const REPAIR_INTERVAL = 0.25;
const SPAWN_CLEARANCE = 40;
/** A shot passing closer than this many pixels to a tank's center puts it under fire. */
const NEAR_MISS = 40;
/** Seconds a kill stays in the feed. */
const FEED_TIME = 6;

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
      role: 'assault' as const,
      respawnAt: undefined,
      shotAt: -Infinity,
      attacker: undefined,
      kills: 0,
      deaths: 0
    }))
  );
}

function segmentDistance(point: Point, a: Point, b: Point) {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const length = abx * abx + aby * aby;
  const t = length > 0 ? Math.min(Math.max(((point.x - a.x) * abx + (point.y - a.y) * aby) / length, 0), 1) : 0;
  return Math.hypot(point.x - a.x - abx * t, point.y - a.y - aby * t);
}

function distance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Converts a 0xRRGGBB color to components 0-1. */
function rgb(color: number) {
  return [((color >> 16) & 255) / 255, ((color >> 8) & 255) / 255, (color & 255) / 255];
}
