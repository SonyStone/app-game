import type { Chronicle } from './chronicle';
import type { BotAction } from './brain';
import type { TeamId } from './rules';
import type { TankClassId } from './tanks';

/**
 * A recorded match laid out along its time, from its chronicle alone, so it reads a recording of
 * any game version: a track for every member, with its lives, what it did in them and what
 * happened to it, and the point's owners. Times are steps, as the chronicle has them.
 *
 * A life runs from a tank's spawn to its death, or to the next spawn when the class was changed
 * in the base, which spawns a new tank without one. What a bot did runs from each thought to its
 * next one or the end of the life; a run of thoughts with the same action is one segment.
 *
 * @param end - The match's last step, `Recording['steps']`.
 */
export function timelineOf(chronicle: Chronicle, end: number) {
  return {
    end,
    tracks: chronicle.members.map((member) => trackOf(chronicle, member, end)),
    capture: captureOf(chronicle, end)
  };
}

/** A timeline of `timelineOf`. */
export type Timeline = ReturnType<typeof timelineOf>;

/** A member's track of `timelineOf`. */
export type Track = Timeline['tracks'][number];

/**
 * Something that happened to a member at `step`: a kill it made, its death, a radio line it said,
 * a new target, or a new class.
 */
export type TimelineMarker = { step: number } & (
  | { kind: 'kill'; victim: number; victimClass: TankClassId }
  | { kind: 'death'; killer?: number; killerClass?: TankClassId }
  | { kind: 'radio'; callout: Chronicle['radio'][number] }
  | { kind: 'target'; target: number }
  | { kind: 'class'; tankClass: TankClassId; was: TankClassId }
);

/** The kinds of `TimelineMarker`, in the order they are drawn, the last on top. */
export const MARKER_KINDS = ['target', 'radio', 'class', 'kill', 'death'] as const satisfies TimelineMarker['kind'][];

/**
 * How the timeline colors what a bot does: its actions by what they are for, each kind a hue of
 * its own, and the player's own driving. `idle` is a bot with no plan.
 */
export const ACTION_KINDS = {
  move: ['goToPoint', 'stage', 'approach', 'regroup', 'goToPerch', 'moveToSupport'],
  point: ['capture', 'guardPoint', 'holdPost', 'overwatch'],
  attack: ['attackFront', 'flank', 'attackRear', 'suppress'],
  cover: ['takeCover', 'retreat'],
  repair: ['repair', 'pickUpKit'],
  breach: ['openWay'],
  idle: [],
  player: []
} as const satisfies Record<string, readonly BotAction[]>;

/** A key of `ACTION_KINDS`. */
export type ActionKind = keyof typeof ACTION_KINDS;

/** The kind of `action`, a `BotAction` or none; an action this code does not know, from another version, is `idle`. */
export function actionKindOf(action: string | undefined): ActionKind {
  for (const [kind, actions] of Object.entries(ACTION_KINDS)) {
    if ((actions as readonly string[]).includes(action ?? '')) {
      return kind as ActionKind;
    }
  }

  return 'idle';
}

function trackOf(chronicle: Chronicle, member: Chronicle['members'][number], end: number) {
  const spawns = chronicle.spawns.filter((spawn) => spawn.member === member.id);
  const deaths = chronicle.kills.filter((kill) => kill.victim === member.id);
  const lives = spawns.map((spawn, index) => {
    const death = deaths.find((kill) => kill.step >= spawn.step && (index + 1 >= spawns.length || kill.step <= spawns[index + 1].step));
    const next = spawns[index + 1]?.step ?? end;
    return { from: spawn.step, to: death?.step ?? next, tankClass: spawn.tankClass };
  });
  const markers: TimelineMarker[] = [];

  spawns.forEach((spawn, index) => {
    const was = spawns[index - 1]?.tankClass;

    if (was && was !== spawn.tankClass) {
      markers.push({ step: spawn.step, kind: 'class', tankClass: spawn.tankClass, was });
    }
  });

  for (const kill of chronicle.kills) {
    if (kill.killer === member.id) {
      markers.push({ step: kill.step, kind: 'kill', victim: kill.victim, victimClass: kill.victimClass });
    }

    if (kill.victim === member.id) {
      markers.push({ step: kill.step, kind: 'death', killer: kill.killer, killerClass: kill.killerClass });
    }
  }

  for (const callout of chronicle.radio) {
    if (callout.member === member.id) {
      markers.push({ step: callout.step, kind: 'radio', callout });
    }
  }

  const thoughts = chronicle.thoughts.filter((thought) => thought.member === member.id);
  const segments: { from: number; to: number; kind: ActionKind; action?: string; goal?: string }[] = [];
  let target: number | undefined;

  thoughts.forEach((thought, index) => {
    const life = lives.find((entry) => thought.step >= entry.from && thought.step < entry.to);

    if (!life) {
      return;
    }

    const to = Math.min(thoughts[index + 1]?.step ?? end, life.to);
    const last = segments.at(-1);

    if (last && last.action === thought.action && last.to === thought.step) {
      last.to = to;
    } else if (to > thought.step) {
      segments.push({ from: thought.step, to, kind: actionKindOf(thought.action), action: thought.action, goal: thought.goal });
    }

    if (thought.target !== undefined && thought.target !== target) {
      markers.push({ step: thought.step, kind: 'target', target: thought.target });
    }

    target = thought.target;
  });

  markers.sort((a, b) => a.step - b.step);
  return { id: member.id, team: member.team, seat: member.seat, name: member.name, human: member.human, lives, segments, markers };
}

/** Who owned the point when, from the first owner on; `owner` is undefined while nobody held it. */
function captureOf(chronicle: Chronicle, end: number) {
  const owners: { from: number; to: number; owner: TeamId | undefined }[] = [];

  chronicle.capture.forEach((entry, index) => {
    const to = chronicle.capture[index + 1]?.step ?? end;

    if (to > entry.step) {
      owners.push({ from: entry.step, to, owner: entry.owner });
    }
  });

  return owners;
}
