/**
 * The pace of a king of the hill match: knobs that slow or quicken the whole fight at once,
 * whatever the classes are, so a tempo a human can react to can be found by feel. Each is a share
 * of what the classes and bots say, 1 for as they are, except the view's zoom and lead.
 */
export type Pace = {
  /** Game speed: seconds of the match per second of real time, everything slowed or quickened alike. */
  speed: number;
  /** Share of every class's driving speed. */
  tankSpeed: number;
  /**
   * Share of every shell's flight speed. A grenade keeps its arc: it flies the same way, only
   * slower, and its fuse burns as much longer. A rail still hits at once.
   */
  shellSpeed: number;
  /**
   * Share of the armor every hit on a tank takes away: the size of the craters shells and blasts
   * chip, and how deep a rail cuts for its power. Below 1 tanks take more hits to open and to kill.
   */
  damage: number;
  /** Times how long a bot takes to fire at a target it just picked, and a rail gun to settle its aim. */
  botReaction: number;
  /**
   * How far a bot sees all round, in world pixels, walls and crates permitting. A player's laptop
   * screen at zoom 1.6 shows 450 px to either side of its center and 280 px up and down.
   */
  botSight: number;
  /** The player's view at the start: screen pixels per world pixel. The wheel and +/- still zoom from it. */
  zoom: number;
  /** Share of the cursor's offset from the screen's center the view leads the tank by, 0 to center on the tank (see `createLookAhead`). */
  lead: number;
};

/**
 * The pace the game starts with, chosen in 30 matches played from the player's seat on a laptop
 * screen (`pace.harness.test.ts`) so a player sees an enemy for about a second or more before it
 * first hits them, while the trip from the base to the point stays 5.5 s:
 *
 * - Before, with every share at 1, zoom 1.6 and the view centered on the tank, a tenth of the
 *   enemies that hit the player did so within 0.38 s of coming onto the screen, 31% within a
 *   second, and 8% of the hits came from enemies off the screen.
 * - The view leading toward the aim alone made that 0.80 s, 15% and 2%.
 * - Bots reacting in 0.4-0.8 s instead of 0.25-0.5 s, shells at 0.8 of their speed, hits taking
 *   0.8 of the armor (a tank takes half again as many hits) and zoom 1.5 make it 1.08 s, 9% and
 *   1%, the median 2.9 s; tanks are destroyed a quarter less often, the player 38% less. Bots
 *   then take longer over a duel too: 11-14 s from 220 px instead of 5-10 s.
 */
export const PACE_DEFAULTS: Pace = {
  speed: 1,
  tankSpeed: 1,
  shellSpeed: 0.8,
  damage: 0.8,
  botReaction: 1.6,
  botSight: 480,
  zoom: 1.5,
  lead: 0.45
};

/** The knobs of the tuning panel, in its order, with their ranges and how values are shown. */
export const PACE_KNOBS: readonly { key: keyof Pace; label: string; min: number; max: number; step: number; unit: string }[] = [
  { key: 'speed', label: 'Game speed', min: 0.5, max: 1.25, step: 0.05, unit: '×' },
  { key: 'tankSpeed', label: 'Tank speed', min: 0.5, max: 1.5, step: 0.05, unit: '×' },
  { key: 'shellSpeed', label: 'Shell speed', min: 0.4, max: 1.5, step: 0.05, unit: '×' },
  { key: 'damage', label: 'Damage', min: 0.3, max: 1.5, step: 0.05, unit: '×' },
  { key: 'botReaction', label: 'Bot reaction', min: 0.5, max: 3, step: 0.1, unit: '×' },
  { key: 'botSight', label: 'Bot sight', min: 250, max: 700, step: 10, unit: ' px' },
  { key: 'zoom', label: 'Zoom', min: 0.8, max: 2.4, step: 0.05, unit: '' },
  { key: 'lead', label: 'Camera lead', min: 0, max: 0.8, step: 0.05, unit: '' }
];

/**
 * The pace kept in `storage` from the last session, knob by knob: a knob missing, out of range or
 * not a number takes its default. Without storage, as in tests, the defaults.
 */
export function loadPace(storage: Pick<Storage, 'getItem'> | undefined = globalThis.localStorage): Pace {
  let kept: Partial<Record<keyof Pace, unknown>> = {};

  try {
    kept = JSON.parse(storage?.getItem(PACE_KEY) ?? '{}') ?? {};
  } catch {
    kept = {};
  }

  return Object.fromEntries(
    PACE_KNOBS.map((knob) => {
      const value = kept[knob.key];
      return [knob.key, typeof value === 'number' && value >= knob.min && value <= knob.max ? value : PACE_DEFAULTS[knob.key]];
    })
  ) as Pace;
}

/**
 * Keeps the knobs of `pace` that differ from the defaults in `storage` for the next session; the
 * others are left out, so they follow the defaults if those change.
 */
export function savePace(pace: Pace, storage: Pick<Storage, 'setItem' | 'removeItem'> | undefined = globalThis.localStorage) {
  const changed = PACE_KNOBS.filter((knob) => pace[knob.key] !== PACE_DEFAULTS[knob.key]).map((knob) => [knob.key, pace[knob.key]]);

  try {
    if (changed.length > 0) {
      storage?.setItem(PACE_KEY, JSON.stringify(Object.fromEntries(changed)));
    } else {
      storage?.removeItem(PACE_KEY);
    }
  } catch {
    // A full or blocked storage only loses the pace for the next session.
  }
}

/** Key of the pace in local storage. */
const PACE_KEY = 'tanki.koth.pace';
