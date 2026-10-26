import type { Dictionary } from './i18n/en';
import type { TankClassId } from './tanks';
import type { Member } from './team';

type Point = { x: number; y: number };

/**
 * A team's radio: what its bots say, shown as a speech bubble over the speaker's tank, often with
 * a marker on the map at what the line is about. Bots say a line when they commit to something,
 * a new goal or the next step of the team's plan, never to fill silence, so every line tells the
 * player what the bot is about to do.
 *
 * The radio keeps the chatter readable:
 *
 * - A member has one bubble at a time; a new line replaces it only if it matters as much
 *   (`CalloutOptions.priority`) or the old one is done.
 * - A member does not repeat a line within `REPEAT_TIME` s, and the team does not echo a line
 *   another member said within `ECHO_TIME` s, so five tanks never all shout "Go!".
 * - Everyday lines (priority 1) are left unsaid while the team said `BUSY_LINES` lines in the
 *   last `BUSY_TIME` s, so the radio never drowns the fight.
 * - Lines with a number, as a countdown, count as new whenever the number changes.
 */
export function createRadio(clock: () => number) {
  const callouts: Callout[] = [];
  let nextId = 0;

  return {
    /** Lines being said or whose markers still show, oldest first. */
    get callouts(): readonly Callout[] {
      const now = clock();
      return callouts.filter((callout) => callout.until > now);
    },

    /**
     * Has `member` say `line`, unless the rules above hold it back; a human member never speaks.
     *
     * @returns Whether the line is said.
     */
    say(member: Member, line: RadioLine, options: CalloutOptions = {}) {
      const now = clock();
      const priority = options.priority ?? 1;

      if (member.human) {
        return false;
      }

      const same = (callout: Callout) => callout.line === line && callout.seconds === options.seconds;
      const repeated = callouts.some((callout) => callout.member === member && same(callout) && now - callout.at < REPEAT_TIME);
      const echoed = callouts.some((callout) => callout.member !== member && same(callout) && now - callout.at < ECHO_TIME);
      const current = callouts.find((callout) => callout.member === member && now - callout.at < BUBBLE_TIME);

      // Everyday lines wait while the team is already talking.
      const busy = priority < 2 && callouts.filter((callout) => now - callout.at < BUSY_TIME).length >= BUSY_LINES;

      if (repeated || busy || (echoed && priority < URGENT) || (current && current.priority > priority)) {
        return false;
      }

      // The member's previous line is cut short, its marker with it.
      for (const callout of callouts) {
        if (callout.member === member) {
          callout.until = Math.min(callout.until, now);
        }
      }

      callouts.push({
        id: nextId++,
        member,
        line,
        at: now,
        until: now + (options.marker ? MARKER_TIME : BUBBLE_TIME),
        priority,
        tankClass: options.tankClass,
        ally: options.ally,
        lane: options.lane,
        seconds: options.seconds,
        marker: options.marker && { kind: options.marker.kind, x: options.marker.x, y: options.marker.y }
      });

      // Lines long done are kept a while for the repeat and echo rules, then dropped.
      callouts.splice(0, callouts.length, ...callouts.filter((callout) => now - callout.at < KEEP_TIME));
      return true;
    },

    /** Forgets every line, for a new match. */
    reset() {
      callouts.length = 0;
    }
  };
}

/** A team's radio as returned by `createRadio`. */
export type Radio = ReturnType<typeof createRadio>;

/** A line a bot can say, a key of the dictionaries' `radio` section. */
export type RadioLine = keyof Dictionary['radio'];

/** One of the three ways to the point: the north street, the hall in the middle and the south street. */
export type Lane = 'north' | 'center' | 'south';

/**
 * What a marker on the map points out: where the team attacks or gathers, an ally that needs
 * help, an enemy worth knowing about, ground a bot holds, a repair kit it takes, one to keep
 * away from, or a wall a bot breaks open.
 */
export type MarkerKind = 'attack' | 'gather' | 'help' | 'enemy' | 'hold' | 'kit' | 'danger' | 'breach';

/** A marker on the map, in world pixels. */
export type Marker = Point & { kind: MarkerKind };

/** How a line is said and what it names. */
export type CalloutOptions = {
  /**
   * How much the line matters, 1 by default: 2 for the team's plan, `URGENT` (3) for calls for
   * help and warnings, which are said even if another member just said the same.
   */
  priority?: number;
  /** The enemy class the line names. */
  tankClass?: TankClassId;
  /** The ally the line names. */
  ally?: Member;
  /** The way to the point the line names. */
  lane?: Lane;
  /** A number of seconds the line counts down. */
  seconds?: number;
  /** A marker the line puts on the map, at a spot that does not move with anything. */
  marker?: Marker;
};

/** A line said on a team's radio, from `match.time` `at` until `until`. */
export type Callout = Required<Pick<CalloutOptions, 'priority'>> &
  Omit<CalloutOptions, 'priority'> & {
    id: number;
    member: Member;
    line: RadioLine;
    at: number;
    until: number;
  };

/** Priority of a line said even if another member just said it. */
export const URGENT = 3;
/** Seconds a bubble shows, and a marker with it. */
export const BUBBLE_TIME = 2.8;
export const MARKER_TIME = 4.5;
const REPEAT_TIME = 9;
const ECHO_TIME = 5;
const KEEP_TIME = 12;
const BUSY_TIME = 3;
const BUSY_LINES = 2;
