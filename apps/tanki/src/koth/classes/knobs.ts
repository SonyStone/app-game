import { TANK_CLASS_IDS, type TankClass, type TankClassId } from '../tanks';
import { TANK_CLASSES } from './classes';
import { TACTICS, type ClassTactics } from './tactics';

/**
 * Changes to the classes, knob by knob, by class: only the knobs that differ from the classes as
 * written, as the class editor keeps them and a tuning carries them (see `../tuning`), such as
 * `{ soldier: { interval: 0.4 } }`.
 */
export type ClassTuning = Partial<Record<TankClassId, Partial<Record<ClassKnobId, number>>>>;

/**
 * Sets every knob of every class to its value in `tuning`, and the knobs it leaves out to their
 * defaults, so `{}` brings back the classes as written. It changes `TANK_CLASSES` and `TACTICS`
 * in place, keeping each class's object, which the match's members hold, but giving it new
 * shells, weapon, hull and the rest: code that reads them where it uses them sees the change
 * at once, and a tank already on the field keeps the hull and mass it spawned with (see
 * `KnobTiming`).
 */
export function applyClassTuning(tuning: ClassTuning) {
  for (const id of TANK_CLASS_IDS) {
    const tuned = structuredClone(WRITTEN[id]);

    // Every knob is written, its default included, so a knob shown as a number worked out from
    // others, as the rear armor from the core, stays as shown when those others change.
    for (const knob of knobsOf(id)) {
      writeKnob(knob, tuned, knobValue(tuning, id, knob));
    }

    Object.assign(TANK_CLASSES[id], tuned.tankClass);
    Object.assign(TACTICS[id], tuned.tactics);
  }

  revision++;
}

/**
 * How many times `applyClassTuning` has changed the classes, for work worked out from a class's
 * numbers and kept, such as the price of breaking through a wall, to tell it is out of date.
 */
export function classRevision() {
  return revision;
}

let revision = 0;

/** The knobs class `id` has, in the order of `CLASS_KNOBS`: those whose numbers the class as written has. */
export function knobsOf(id: TankClassId): readonly ClassKnob[] {
  return (CLASS_KNOBS as readonly ClassKnob[]).filter((knob) => hasKnob(knob, WRITTEN[id]));
}

/** The value of `knob` for class `id` under `tuning`: its change there, else its default. */
export function knobValue(tuning: ClassTuning, id: TankClassId, knob: ClassKnob) {
  return tuning[id]?.[knob.id] ?? knobDefault(id, knob);
}

/** The value of `knob` for class `id` as the class is written. */
export function knobDefault(id: TankClassId, knob: ClassKnob) {
  return readKnob(knob, WRITTEN[id]) ?? Number.NaN;
}

/** Slider range and step of `knob` for class `id`, in the knob's own units. */
export function knobRange(id: TankClassId, knob: ClassKnob) {
  const [min, max, step] = knob.ranges?.[id] ?? knob.range;
  return { min, max, step };
}

/**
 * `tuning` with `knob` of class `id` set to `value`; a value equal to the default takes the knob
 * out, and a class without changes left goes too, so a tuning holds only differences.
 */
export function withKnob(tuning: ClassTuning, id: TankClassId, knob: ClassKnob, value: number): ClassTuning {
  const changes = { ...tuning[id] };
  const next = { ...tuning };
  delete changes[knob.id];

  if (!sameValue(value, knobDefault(id, knob))) {
    changes[knob.id] = value;
  }

  if (Object.keys(changes).length > 0) {
    next[id] = changes;
  } else {
    delete next[id];
  }

  return next;
}

/**
 * The changes to the classes in `value`, as read from storage, a file or a link: the knobs of
 * known classes with numbers in their range, whole numbers where the knob counts things, and
 * different from the default. `dropped` names what was left out for being unknown or out of
 * range, as `soldier.speed`.
 */
export function cleanClassTuning(value: unknown): { tuning: ClassTuning; dropped: string[] } {
  const dropped: string[] = [];
  let tuning: ClassTuning = {};

  if (!isRecord(value)) {
    return { tuning, dropped: value === undefined ? [] : ['classes'] };
  }

  for (const [id, knobs] of Object.entries(value)) {
    const classId = TANK_CLASS_IDS.find((known) => known === id);

    if (!classId || !isRecord(knobs)) {
      dropped.push(id);
      continue;
    }

    for (const [key, number] of Object.entries(knobs)) {
      const knob = knobsOf(classId).find((candidate) => candidate.id === key);

      if (!knob || !fitsKnob(classId, knob, number)) {
        dropped.push(`${id}.${key}`);
        continue;
      }

      tuning = withKnob(tuning, classId, knob, number);
    }
  }

  return { tuning, dropped };
}

/**
 * The number of `knob`'s value as the editor shows it: in its display units, to as many decimals
 * as its step needs; the unit after it is the dictionaries' `unit` of `knob.unit`.
 */
export function formatKnob(knob: ClassKnob, id: TankClassId, value: number) {
  const scale = knob.scale ?? 1;
  const digits = Math.min(Math.max(Math.ceil(-Math.log10(knobRange(id, knob).step * scale) - 1e-9), 0), 2);
  return (value * scale).toFixed(digits);
}

/**
 * What the number of a knob is shown in: pixels per second, pixels, seconds, a factor, degrees,
 * degrees per second or percent; a knob without one counts or weighs.
 */
export type KnobUnit = 'speed' | 'length' | 'time' | 'factor' | 'angle' | 'turn' | 'share';

/**
 * When a knob's change reaches the field, as the game reads its number:
 *
 * - `now`: every step or shot, so tanks on the field change at once: speeds, guns, shells, bots.
 * - `respawn`: when a tank spawns: its hull, core and mass; tanks on the field keep theirs.
 * - `restart`: when a match starts: where the Sniper's team looks for its perches.
 */
export type KnobTiming = 'now' | 'respawn' | 'restart';

/** The editor's groups of knobs, in its order. */
export const KNOB_GROUPS = ['move', 'weapon', 'armor', 'point', 'bot'] as const;

/** One of `KNOB_GROUPS`. */
export type KnobGroup = (typeof KNOB_GROUPS)[number];

/** A knob of `CLASS_KNOBS` (see `KnobSpec`). */
export type ClassKnob = KnobSpec & { id: ClassKnobId };

/** The `id` of a knob of `CLASS_KNOBS`. */
export type ClassKnobId = (typeof CLASS_KNOBS)[number]['id'];

/**
 * A number of a class the editor changes with a slider.
 *
 * - `id`: its name in a tuning and in the dictionaries' `classKnob`.
 * - `path`: where the number lives in the class, as `shell.blast.radius`, or in its `TACTICS`
 *   after `tactics.`. A class whose number is missing lacks the knob, unless `missing` gives the
 *   value a missing number stands for, and so does a class `when` turns down.
 * - `range`: slider minimum, maximum and step in the number's own units, for every class but
 *   those in `ranges`. Every class's default lies on its steps.
 * - `scale`, `unit`: what the number is shown as: its value times `scale`, 1 by default, in `unit`.
 * - `integer`: only whole numbers, for counts.
 * - `view`: turns the number at `path` into the knob's value and back, for a knob that shows a
 *   number worked out from it; `to` sees the class with the knobs before it already set.
 */
type KnobSpec = {
  id: string;
  group: KnobGroup;
  path: string;
  range: KnobRange;
  ranges?: Partial<Record<TankClassId, KnobRange>>;
  scale?: number;
  unit?: KnobUnit;
  applies: KnobTiming;
  integer?: boolean;
  missing?: number;
  when?: (tankClass: TankClass) => boolean;
  view?: {
    from: (number: number, tankClass: TankClass) => number;
    to: (value: number, tankClass: TankClass) => number;
  };
};

type KnobRange = readonly [min: number, max: number, step: number];

/** Factor from radians to degrees, for knobs of angles shown in degrees. */
const DEGREES = 180 / Math.PI;

/**
 * Every knob of the class editor, in its order. Left out: the shapes and sizes of hulls, which
 * must fit a renderer slot; the looks; a grenade's bounces and roll; a gatling's drill memory;
 * fragments' own shells; and the bots' estimates of hits to kill, which follow from the guns.
 */
export const CLASS_KNOBS = [
  { id: 'speed', group: 'move', path: 'speed', range: [100, 600, 5], unit: 'speed', applies: 'now' },
  { id: 'mass', group: 'move', path: 'mass', range: [0.3, 4, 0.05], unit: 'factor', applies: 'respawn' },
  {
    id: 'gunArc',
    group: 'move',
    path: 'mount.arc',
    range: [0, 0.6, 0.01],
    scale: DEGREES,
    unit: 'angle',
    applies: 'now'
  },
  {
    id: 'traverse',
    group: 'move',
    path: 'mount.traverse',
    range: [0.5, 6, 0.1],
    scale: DEGREES,
    unit: 'turn',
    applies: 'now'
  },
  {
    id: 'firingSpeed',
    group: 'move',
    path: 'weapon.slowdown',
    range: [0.1, 1, 0.05],
    scale: 100,
    unit: 'share',
    applies: 'now'
  },
  {
    id: 'interval',
    group: 'weapon',
    path: 'interval',
    range: [0.1, 3, 0.05],
    ranges: { heavy: [0.02, 0.5, 0.01] },
    unit: 'time',
    applies: 'now'
  },
  {
    id: 'shellSpeed',
    group: 'weapon',
    path: 'shell.speed',
    range: [300, 3000, 50],
    unit: 'speed',
    applies: 'now',
    when: (tankClass: TankClass) => Number.isFinite(tankClass.shell.speed)
  },
  { id: 'range', group: 'weapon', path: 'shell.range', range: [100, 1600, 10], unit: 'length', applies: 'now' },
  { id: 'hole', group: 'weapon', path: 'shell.hole', range: [0.5, 10, 0.1], unit: 'length', applies: 'now' },
  { id: 'depth', group: 'weapon', path: 'shell.depth', range: [0, 10, 0.1], unit: 'length', applies: 'now' },
  { id: 'knockback', group: 'weapon', path: 'shell.knockback', range: [0, 1500, 5], applies: 'now' },
  { id: 'fade', group: 'weapon', path: 'shell.fade', range: [0, 1, 0.05], scale: 100, unit: 'share', applies: 'now' },
  { id: 'pellets', group: 'weapon', path: 'weapon.pellets', range: [1, 12, 1], applies: 'now', integer: true },
  {
    id: 'spread',
    group: 'weapon',
    path: 'weapon.spread',
    range: [0, 0.6, 0.01],
    scale: DEGREES,
    unit: 'angle',
    applies: 'now'
  },
  {
    id: 'pointBlankRange',
    group: 'weapon',
    path: 'shell.pointBlank.range',
    range: [0, 400, 10],
    unit: 'length',
    applies: 'now'
  },
  {
    id: 'pointBlankDepth',
    group: 'weapon',
    path: 'shell.pointBlank.depth',
    range: [1, 8, 0.1],
    unit: 'factor',
    applies: 'now'
  },
  { id: 'drillGain', group: 'weapon', path: 'shell.drill.gain', range: [0, 3, 0.05], unit: 'length', applies: 'now' },
  { id: 'drillMost', group: 'weapon', path: 'shell.drill.most', range: [0, 20, 0.5], unit: 'length', applies: 'now' },
  {
    id: 'blastRadius',
    group: 'weapon',
    path: 'shell.blast.radius',
    range: [10, 250, 5],
    unit: 'length',
    applies: 'now'
  },
  { id: 'blastHole', group: 'weapon', path: 'shell.blast.hole', range: [0.5, 15, 0.1], unit: 'length', applies: 'now' },
  { id: 'blastDepth', group: 'weapon', path: 'shell.blast.depth', range: [0, 10, 0.1], unit: 'length', applies: 'now' },
  { id: 'blastKnockback', group: 'weapon', path: 'shell.blast.knockback', range: [0, 2000, 10], applies: 'now' },
  {
    id: 'wallDamage',
    group: 'weapon',
    path: 'shell.blast.structures',
    range: [0.5, 6, 0.1],
    unit: 'factor',
    applies: 'now'
  },
  { id: 'fragments', group: 'weapon', path: 'shell.fragments.count', range: [0, 24, 1], applies: 'now', integer: true },
  { id: 'fuse', group: 'weapon', path: 'shell.lob.fuse', range: [0.3, 4, 0.05], unit: 'time', applies: 'now' },
  { id: 'chargeTime', group: 'weapon', path: 'weapon.time', range: [0.3, 6, 0.1], unit: 'time', applies: 'now' },
  { id: 'spinUp', group: 'weapon', path: 'weapon.spinUp', range: [0, 1.5, 0.05], unit: 'time', applies: 'now' },
  { id: 'railPower', group: 'weapon', path: 'shell.rail.power', range: [0, 60, 1], unit: 'length', applies: 'now' },
  {
    id: 'fullRailPower',
    group: 'weapon',
    path: 'weapon.full.rail.power',
    range: [5, 100, 1],
    unit: 'length',
    applies: 'now'
  },
  {
    id: 'fullRange',
    group: 'weapon',
    path: 'weapon.full.range',
    range: [300, 2000, 10],
    unit: 'length',
    applies: 'now'
  },
  { id: 'graze', group: 'weapon', path: 'weapon.full.rail.graze', range: [0, 8, 0.1], unit: 'length', applies: 'now' },
  {
    id: 'plating',
    group: 'armor',
    path: 'hull.plating',
    range: [0.2, 2, 0.05],
    unit: 'factor',
    applies: 'respawn',
    missing: 1
  },
  {
    id: 'coreRadius',
    group: 'armor',
    path: 'hull.core.radius',
    range: [2, 8, 0.5],
    unit: 'length',
    applies: 'respawn'
  },
  {
    id: 'rearArmor',
    group: 'armor',
    path: 'hull.core.x',
    range: [1, 15, 0.5],
    unit: 'length',
    applies: 'respawn',
    // Armor between the core and the rear of the hull, where the core lies nearest the surface.
    view: {
      from: (x: number, tankClass: TankClass) => tankClass.hull.halfLength + x - tankClass.hull.core.radius,
      to: (rear: number, tankClass: TankClass) => rear - tankClass.hull.halfLength + tankClass.hull.core.radius
    }
  },
  { id: 'capture', group: 'point', path: 'capture', range: [0, 4, 0.5], unit: 'factor', applies: 'now' },
  {
    // The player's turret follows the aim at once, so only bots turn theirs at this speed.
    id: 'turretSpeed',
    group: 'bot',
    path: 'turretSpeed',
    range: [1, 20, 0.5],
    scale: DEGREES,
    unit: 'turn',
    applies: 'now',
    when: (tankClass: TankClass) => tankClass.mount.kind === 'turret'
  },
  { id: 'reach', group: 'bot', path: 'tactics.reach', range: [100, 1400, 10], unit: 'length', applies: 'now' },
  { id: 'duelMin', group: 'bot', path: 'tactics.duel.min', range: [0, 1200, 10], unit: 'length', applies: 'now' },
  { id: 'duelMax', group: 'bot', path: 'tactics.duel.max', range: [50, 1400, 10], unit: 'length', applies: 'now' },
  { id: 'dodge', group: 'bot', path: 'tactics.dodge', range: [0, 1, 0.05], scale: 100, unit: 'share', applies: 'now' },
  { id: 'aimError', group: 'bot', path: 'tactics.aimError', range: [0.2, 6, 0.1], unit: 'factor', applies: 'now' },
  {
    id: 'steadiness',
    group: 'bot',
    path: 'tactics.steadiness',
    range: [0.25, 4, 0.05],
    unit: 'factor',
    applies: 'now'
  },
  {
    id: 'retreat',
    group: 'bot',
    path: 'tactics.retreat',
    range: [0, 1, 0.02],
    scale: 100,
    unit: 'share',
    applies: 'now'
  },
  { id: 'pointPriority', group: 'bot', path: 'tactics.point', range: [-40, 40, 1], applies: 'now' },
  { id: 'perch', group: 'bot', path: 'tactics.perch', range: [200, 900, 10], unit: 'length', applies: 'restart' }
] as const satisfies readonly KnobSpec[];

/** A class's numbers and its bots' tactics, which knobs read and write. */
type Tuned = { tankClass: TankClass; tactics: ClassTactics };

/**
 * Every class and its tactics as written, before any tuning: what `applyClassTuning` starts from
 * and every knob's default.
 */
const WRITTEN = Object.fromEntries(
  TANK_CLASS_IDS.map((id) => [id, structuredClone({ tankClass: TANK_CLASSES[id], tactics: TACTICS[id] })])
) as Record<TankClassId, Tuned>;

function hasKnob(knob: ClassKnob, tuned: Tuned) {
  return readKnob(knob, tuned) !== undefined && (knob.when?.(tuned.tankClass) ?? true);
}

/** The value of `knob` in `tuned`: the number at its path, as its view shows it; `undefined` without one. */
function readKnob(knob: ClassKnob, tuned: Tuned) {
  const number = readPath(tuned, knob.path) ?? knob.missing;
  return number === undefined || !knob.view ? number : knob.view.from(number, tuned.tankClass);
}

function writeKnob(knob: ClassKnob, tuned: Tuned, value: number) {
  const { holder, key } = holderOf(tuned, knob.path);
  holder[key] = knob.view ? knob.view.to(value, tuned.tankClass) : value;
}

function readPath(tuned: Tuned, path: string) {
  const { holder, key } = holderOf(tuned, path);
  const number = holder[key];
  return typeof number === 'number' ? number : undefined;
}

/**
 * The object that holds the number at `path` in `tuned` and its key there. A missing object on
 * the way, as a shell without a blast, gives an empty one that belongs to nothing.
 */
function holderOf(tuned: Tuned, path: string) {
  const [first, ...rest] = path.split('.');
  const steps = first === 'tactics' ? rest : [first, ...rest];
  let holder: Record<string, unknown> = first === 'tactics' ? tuned.tactics : tuned.tankClass;

  for (const step of steps.slice(0, -1)) {
    const next = holder[step];
    holder = isRecord(next) ? next : {};
  }

  return { holder, key: steps[steps.length - 1] };
}

/** Whether `value` is a number `knob` takes for class `id`. */
function fitsKnob(id: TankClassId, knob: ClassKnob, value: unknown): value is number {
  const { min, max } = knobRange(id, knob);
  return typeof value === 'number' && value >= min && value <= max && (!knob.integer || Number.isInteger(value));
}

/** Whether two values of a knob are the same but for floating point. */
function sameValue(a: number, b: number) {
  return Math.abs(a - b) <= 1e-9 * Math.max(Math.abs(a), Math.abs(b), 1);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
