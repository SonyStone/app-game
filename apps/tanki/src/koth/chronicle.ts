import type { Tank } from '../arena/bodies';
import type { KothKill, KothMatch } from './match';
import type { TeamId } from './rules';
import type { TankClassId } from './tanks';

/**
 * What happened in a match, written down as it was played: where every tank was a few times a
 * second, what each bot was doing and why, the kills, the radio and the point's owners. Unlike the
 * match's script (see `Recording`), it needs no game code to read, so a recording made by an
 * older or newer game still shows on a timeline and in heatmaps, and a tool or an agent reads it
 * as plain JSON.
 *
 * Times are match steps, `1 / 60` s each; positions are world pixels to a tenth, y down, and
 * angles radians to a thousandth. Members are named by their `id`, as `members` lists them.
 */
export type Chronicle = {
  /** The seats, red's first, by `id`. */
  members: { id: number; team: TeamId; seat: number; name: string; human: boolean }[];
  /** Steps between two of `samples`. */
  every: number;
  /**
   * Every `every` steps from step 0, a row per member in `members`' order: its tank's
   * `[x, y, hull angle, turret angle, armor left 0-1]`, or `null` while it waits to respawn.
   */
  samples: (Pose | null)[][];
  /** What a bot was doing, written at the sample where it changed: its goal, its plan and the step it is on, and what that step is about. */
  thoughts: ChronicleThought[];
  /** Every tank that came out of its base, with its class. */
  spawns: { step: number; member: number; tankClass: TankClassId }[];
  /** Every tank destroyed: where, of which class, and by whom, unless it was its own team or nobody. */
  kills: { step: number; victim: number; victimClass: TankClassId; killer?: number; killerClass?: TankClassId; x: number; y: number }[];
  /** Every radio line, as the radio overlay shows it. */
  radio: ChronicleCallout[];
  /** The point's owner and the winner, written whenever either changed. */
  capture: { step: number; owner?: TeamId; winner?: TeamId }[];
};

/** A tank's `[x, y, hull angle, turret angle, armor left]`, as `Chronicle['samples']` holds them. */
export type Pose = [number, number, number, number, number];

/** A bot's thought, as `Chronicle['thoughts']` holds them. */
export type ChronicleThought = {
  step: number;
  member: number;
  goal?: string;
  action?: string;
  /** The plan's actions, and which of them the bot is on. */
  plan: string[];
  at: number;
  /** Where it drives, and the enemy and the ally it is about. */
  destination?: { x: number; y: number };
  target?: number;
  covering?: number;
  /** How and how far it is opening a wall, while it is. */
  breach?: string;
};

/** A radio line, as `Chronicle['radio']` holds them. */
export type ChronicleCallout = {
  step: number;
  member: number;
  line: string;
  tankClass?: TankClassId;
  ally?: number;
  lane?: string;
  seconds?: number;
  marker?: { kind: string; x: number; y: number };
};

/**
 * Writes a match's chronicle as it is played. Call `step` after every step of the match, and
 * `kill` from the match's `onKill`.
 *
 * @param every - Steps between samples; 15, a quarter of a second, as often as the bots' boards think.
 */
export function createChronicler(match: KothMatch, every = 15) {
  const chronicle: Chronicle = {
    members: match.members.map((member) => ({ id: member.id, team: member.team, seat: member.index, name: member.name, human: member.human })),
    every,
    samples: [],
    thoughts: [],
    spawns: [],
    kills: [],
    radio: [],
    capture: []
  };
  const tanks = new Map<number, Tank | undefined>();
  const lastThought = new Map<number, string>();
  let lastCallout = -1;
  let lastCapture = '';

  return {
    chronicle,

    /** Notes what changed in step `step`, the number of steps played so far, and samples the tanks and thoughts every `every` steps. */
    step(step: number) {
      for (const member of match.members) {
        if (member.tank && member.tank !== tanks.get(member.id)) {
          chronicle.spawns.push({ step, member: member.id, tankClass: member.tankClass.id });
        }

        tanks.set(member.id, member.tank);
      }

      for (const callout of [...match.boards.red.callouts, ...match.boards.blue.callouts].sort((a, b) => a.id - b.id)) {
        if (callout.id > lastCallout) {
          lastCallout = callout.id;
          chronicle.radio.push({
            step,
            member: callout.member.id,
            line: callout.line,
            tankClass: callout.tankClass,
            ally: callout.ally?.id,
            lane: callout.lane,
            seconds: callout.seconds,
            marker: callout.marker && { kind: callout.marker.kind, x: tenth(callout.marker.x), y: tenth(callout.marker.y) }
          });
        }
      }

      const capture = match.capture;
      const owners = `${capture.owner ?? ''}/${capture.winner ?? ''}`;

      if (owners !== lastCapture) {
        lastCapture = owners;
        chronicle.capture.push({ step, owner: capture.owner, winner: capture.winner });
      }

      if (step % every === 0) {
        sample(step);
      }
    },

    /** Notes a kill, as the match's `onKill` reports it, in step `step`. */
    kill(step: number, kill: KothKill) {
      const at = kill.at;
      chronicle.kills.push({
        step,
        victim: kill.victim.id,
        victimClass: kill.victimClass,
        killer: kill.killer?.id,
        killerClass: kill.killerClass,
        x: tenth(at.x),
        y: tenth(at.y)
      });
    }
  };

  function sample(step: number) {
    chronicle.samples.push(
      match.members.map((member) => {
        const tank = member.tank;

        if (!tank) {
          return null;
        }

        const at = tank.hull.translation();
        return [tenth(at.x), tenth(at.y), thousandth(tank.hull.rotation()), thousandth(tank.turretAngle), hundredth(match.combat.armorLeft(tank))];
      })
    );

    for (const thought of match.thoughts()) {
      const memberOf = (tank: Tank | undefined) => tank && match.members.find((member) => member.tank === tank)?.id;
      const entry: ChronicleThought = {
        step,
        member: thought.member.id,
        goal: thought.goal,
        action: thought.action,
        plan: [...thought.steps],
        at: thought.step,
        destination: thought.destination && { x: Math.round(thought.destination.x), y: Math.round(thought.destination.y) },
        target: memberOf(thought.target),
        covering: thought.covering?.id,
        breach: thought.breach && `${thought.breach.method} ${thought.breach.phase}`
      };
      const key = JSON.stringify({ ...entry, step: 0 });

      if (lastThought.get(entry.member) !== key) {
        lastThought.set(entry.member, key);
        chronicle.thoughts.push(entry);
      }
    }
  }
}

function tenth(value: number) {
  return Math.round(value * 10) / 10;
}

function hundredth(value: number) {
  return Math.round(value * 100) / 100;
}

function thousandth(value: number) {
  return Math.round(value * 1000) / 1000;
}
