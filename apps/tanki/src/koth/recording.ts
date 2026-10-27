import type { createRangeRenderer } from '../damage/renderer';
import type { Rapier } from '../physics/Rapier2D';
import { createChronicler, type Chronicle } from './chronicle';
import { applyClassTuning, type ClassTuning } from './classes/knobs';
import { createKothMatch, type KothKill, type MatchPace, type PlayerInput } from './match';
import type { CaptureRules } from './rules';
import type { TankClassId } from './tanks';

/**
 * A recorded match, as saved to a file: its script, which plays the match again bit for bit, and
 * its chronicle, which tells what happened without playing it.
 *
 * The script is the setup the match began from, with the seed of all its randomness, the player's
 * input for every step and what the player changed along the way. The match is deterministic
 * (see `../physics/math`), so the same game code plays it the same in any browser or in Node;
 * `checks`, a hash of the match every second, shows where another game code plays it
 * differently, which `build` then explains. The chronicle (see `Chronicle`) holds where the tanks
 * were and what the bots thought, for tools that read a recording of any version.
 *
 * Steps are `STEP` s each; an input row or an event at step `n` applies from the step after the
 * first `n`, so step 0 is the match's first.
 */
export type Recording = {
  format: typeof RECORDING_FORMAT;
  game: 'tanki-koth';
  /** The game code that played the match (see `Build`). */
  build: Build;
  /** When the recording was saved, as an ISO 8601 date. */
  recordedAt: string;
  setup: MatchSetup;
  /** How many steps were played. */
  steps: number;
  /** The player's input, a row whenever it changed (see `InputRow`). */
  inputs: InputRow[];
  /** What the player changed besides the input, in the order it happened. */
  events: MatchEvent[];
  /** `checksumOf` the match after every `CHECK_EVERY` steps. */
  checks: string[];
  chronicle: Chronicle;
};

/** The version of `Recording`, raised when its shape changes. */
export const RECORDING_FORMAT = 1;

/**
 * The game code a match was played by: its git commit, and on the dev server whether the code
 * differed from it and the file next to the recording that holds the difference, as `git diff`
 * prints it, so the code can be rebuilt exactly. A deployed build is its commit. `dev` is a
 * commit not known, as a recording that the dev server did not save.
 */
export type Build = { commit: string; dirty?: boolean; diff?: string };

/**
 * What a match began from: the seed of every random number in it, whether red's first seat is the
 * player's and its first class, the capture rules, the pace it works by (see `MatchPace`) and the
 * changes to the classes (see `ClassTuning`).
 */
export type MatchSetup = {
  seed: number;
  human: boolean;
  playerClass: TankClassId;
  rules: CaptureRules;
  pace: MatchPace;
  classes: ClassTuning;
};

/**
 * The player's input from step `step` on: the drive direction, the aim angle, the trigger, how far
 * the player aims and whether a casemate turns in place, as `PlayerInput` has them, with `null`
 * for an aim or reach not given and 0 or 1 for the switches.
 */
export type InputRow = [step: number, driveX: number, driveY: number, aim: number | null, fire: 0 | 1, reach: number | null, turn: 0 | 1];

/** Something the player changed at step `step` besides the input: the class, watching the bots, the pace or the classes' tuning. */
export type MatchEvent = { step: number } & (
  | { kind: 'class'; tankClass: TankClassId }
  | { kind: 'watch'; on: boolean }
  | { kind: 'pace'; pace: MatchPace }
  | { kind: 'classes'; classes: ClassTuning }
);

/** Seconds of a match step. */
export const STEP = 1 / 60;

/** Steps between two of a recording's `checks`: one a second. */
export const CHECK_EVERY = 60;

/**
 * A king of the hill match on a world of its own, recorded as it is played: everything that
 * changes it goes through here, so the recording plays it again exactly. The match's random
 * numbers come from `setup.seed`, and the classes' tuning of `setup.classes` is applied to
 * `TANK_CLASSES` at once, as it is whenever it changes.
 *
 * @param options.onKill - Called for every tank destroyed, after the chronicle notes it.
 */
export function createRecordedMatch(
  rapier: Rapier,
  renderer: ReturnType<typeof createRangeRenderer>,
  setup: MatchSetup,
  options: { onKill?: (kill: KothKill) => void } = {}
) {
  applyClassTuning(setup.classes);
  const world = new rapier.World({ x: 0, y: 0 });
  world.lengthUnit = PIXELS_PER_METER;
  let pace = setup.pace;
  let classes = setup.classes;
  let watching = false;
  let steps = 0;
  let lastRow: InputRow | undefined;
  const inputs: InputRow[] = [];
  const events: MatchEvent[] = [];
  const checks: string[] = [];
  const match = createKothMatch(rapier, world, renderer, {
    human: setup.human,
    playerClass: setup.playerClass,
    rules: setup.rules,
    random: seededRandom(setup.seed),
    pace: () => pace,
    onKill: (kill) => {
      chronicler.kill(steps, kill);
      options.onKill?.(kill);
    }
  });
  const chronicler = createChronicler(match);
  chronicler.step(0);

  return {
    match,

    /** The match's physics world. */
    world,

    /** How many steps were played. */
    get steps() {
      return steps;
    },

    /** The `checks` so far, for comparing a replay with its recording as it plays. */
    checks,

    /**
     * Plays a step with the player's `input`, which goes into the match as the recording keeps
     * it: directions and angles to a ten-thousandth, the reach to a tenth of a pixel.
     */
    step(input: PlayerInput) {
      const row = rowOf(steps, input);

      if (!lastRow || row.some((value, index) => index > 0 && value !== lastRow![index])) {
        inputs.push(row);
        lastRow = row;
      }

      steps++;
      match.step(STEP, inputOf(row));
      chronicler.step(steps);

      if (steps % CHECK_EVERY === 0) {
        checks.push(checksumOf(match, world));
      }
    },

    /** Picks the player's class, as `KothMatch['chooseClass']`. */
    chooseClass(id: TankClassId) {
      events.push({ step: steps, kind: 'class', tankClass: id });
      match.chooseClass(id);
    },

    /** Hands the player's seat to a bot, or back, as `KothMatch['spectate']`; does nothing when it is so already. */
    watch(on: boolean) {
      if (on !== watching) {
        watching = on;
        events.push({ step: steps, kind: 'watch', on });
        match.spectate(on);
      }
    },

    /** Sets the pace the match works by from the next step; does nothing when it is the same. */
    setPace(next: MatchPace) {
      const picked = matchPaceOf(next);

      if (JSON.stringify(picked) !== JSON.stringify(pace)) {
        pace = picked;
        events.push({ step: steps, kind: 'pace', pace });
      }
    },

    /** Sets the classes' tuning from the next step (see `applyClassTuning`); does nothing when it is the same. */
    setClasses(next: ClassTuning) {
      if (JSON.stringify(next) !== JSON.stringify(classes)) {
        classes = next;
        applyClassTuning(next);
        events.push({ step: steps, kind: 'classes', classes });
      }
    },

    /**
     * Applies the classes' tuning this match has now to `TANK_CLASSES`, which all matches share:
     * call it before stepping a match that runs beside another, as a replay's tape is built
     * beside the replay, either of which may have come to a change of tuning the other has not.
     */
    useTuning() {
      applyClassTuning(classes);
    },

    /** The recording of the match so far, of build `build`. */
    recording(build: Build = { commit: BUILD_COMMIT }): Recording {
      return {
        format: RECORDING_FORMAT,
        game: 'tanki-koth',
        build,
        recordedAt: new Date().toISOString(),
        setup,
        steps,
        inputs: [...inputs],
        events: [...events],
        checks: [...checks],
        chronicle: chronicler.chronicle
      };
    },

    /** Frees the match's world; the match is not to be used after. */
    dispose() {
      match.dispose();
      world.free();
    }
  };
}

/** A match recorded by `createRecordedMatch`. */
export type RecordedMatch = ReturnType<typeof createRecordedMatch>;

/**
 * Plays `recording` again with this game code: a recorded match of its setup, fed the recorded
 * input and changes step by step, which records itself anew, so its checks show whether this
 * code plays the match as the recorded one did.
 */
export function replayRecording(rapier: Rapier, renderer: ReturnType<typeof createRangeRenderer>, recording: Recording) {
  const replay = createRecordedMatch(rapier, renderer, recording.setup);
  let nextRow = 0;
  let nextEvent = 0;
  let row: InputRow = [0, 0, 0, null, 0, null, 0];
  let diverged: number | undefined;

  return {
    replay,

    /** Whether every recorded step has been played. */
    get done() {
      return replay.steps >= recording.steps;
    },

    /** The first second whose check differs from the recording's, or `undefined` while all agree. */
    get diverged() {
      return diverged;
    },

    /** Plays up to `count` more recorded steps. */
    advance(count = 1) {
      for (let played = 0; played < count && replay.steps < recording.steps; played++) {
        const step = replay.steps;

        while (nextEvent < recording.events.length && recording.events[nextEvent].step <= step) {
          apply(recording.events[nextEvent++]);
        }

        while (nextRow < recording.inputs.length && recording.inputs[nextRow][0] <= step) {
          row = recording.inputs[nextRow++];
        }

        replay.step(inputOf(row));

        if (replay.steps % CHECK_EVERY === 0) {
          const second = replay.steps / CHECK_EVERY;

          if (diverged === undefined && replay.checks[second - 1] !== recording.checks[second - 1]) {
            diverged = second;
          }
        }
      }
    }
  };

  function apply(event: MatchEvent) {
    switch (event.kind) {
      case 'class':
        replay.chooseClass(event.tankClass);
        break;
      case 'watch':
        replay.watch(event.on);
        break;
      case 'pace':
        replay.setPace(event.pace);
        break;
      case 'classes':
        replay.setClasses(event.classes);
        break;
    }
  }
}

/**
 * A hash of everything the match is made of, as eight hex digits: every body's pose and motion in
 * the physics world, every seat's score, respawn, turret and armor, the shells in the air and the
 * point. Two matches that agree in it agree in all that matters, to the bit.
 */
export function checksumOf(match: ReturnType<typeof createKothMatch>, world: InstanceType<Rapier['World']>) {
  const numbers: number[] = [match.time];

  world.forEachRigidBody((body) => {
    const at = body.translation();
    const velocity = body.linvel();
    numbers.push(body.handle, at.x, at.y, body.rotation(), velocity.x, velocity.y, body.angvel());
  });

  for (const member of match.members) {
    numbers.push(member.kills, member.deaths, member.respawnAt ?? -1, member.tank?.turretAngle ?? -1, member.tank ? match.combat.armorLeft(member.tank) : -1);
  }

  for (const shell of match.combat.shells) {
    numbers.push(shell.x, shell.y);
  }

  numbers.push(match.capture.held.red, match.capture.held.blue, match.capture.progress);
  let hash = 0x811c9dc5;

  for (const byte of new Uint8Array(new Float64Array(numbers).buffer)) {
    hash = Math.imul(hash ^ byte, 0x01000193) >>> 0;
  }

  return hash.toString(16).padStart(8, '0');
}

/** Park and Miller's generator from `seed`, 1 to 2147483646, giving numbers in [0, 1), as the harnesses seed matches. */
export function seededRandom(seed: number) {
  let state = seed;

  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

/** A seed for `seededRandom`, picked at random. */
export function newSeed() {
  return 1 + Math.floor(Math.random() * 2147483645);
}

/** The knobs of a pace the match works by, the rest left out (see `MatchPace`). */
export function matchPaceOf(pace: MatchPace): MatchPace {
  return { tankSpeed: pace.tankSpeed, shellSpeed: pace.shellSpeed, damage: pace.damage, botReaction: pace.botReaction, botSight: pace.botSight };
}

/** Rapier's tolerances assume meters; Godot's Rapier plugin likewise treats 100 px as a meter. */
export const PIXELS_PER_METER = 100;

/** The commit a deployed build was made from, as Vercel tells Vite; `dev` otherwise. */
const BUILD_COMMIT: string = import.meta.env.VITE_VERCEL_GIT_COMMIT_SHA ?? 'dev';

/** `input` at step `step` as the recording keeps it. */
function rowOf(step: number, input: PlayerInput): InputRow {
  return [
    step,
    toFine(input.drive.x),
    toFine(input.drive.y),
    input.aim === undefined ? null : toFine(input.aim),
    input.fire ? 1 : 0,
    input.reach === undefined ? null : Math.round(input.reach * 10) / 10 + 0,
    input.turn ? 1 : 0
  ];
}

/** The input a recorded row gives the match. */
function inputOf(row: InputRow): PlayerInput {
  return {
    drive: { x: row[1], y: row[2] },
    aim: row[3] ?? undefined,
    fire: row[4] === 1,
    reach: row[5] ?? undefined,
    turn: row[6] === 1
  };
}

/**
 * `value` to a ten-thousandth, which the recording writes in few digits and reads back to the same
 * bits. JSON writes -0 as 0, so it is 0 already here, or the angle of a drive of (-0, -1) would
 * turn the other way in the replay.
 */
function toFine(value: number) {
  return Math.round(value * 10000) / 10000 + 0;
}
