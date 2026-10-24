/**
 * King of the hill rules, after Team Fortress 2: a single control point is captured by standing
 * on it. A team alone on the point raises its capture progress, faster the more of it stand
 * there; with both teams on it the capture stalls. When progress fills, the team owns the point,
 * and its clock runs for as long as it keeps the point. The first team whose clock reaches the
 * hold time wins, unless the enemy is on the point or has capture progress at that moment: then
 * the match goes into overtime until one of them clears.
 *
 * Every function here is pure; the match keeps the state and calls `advanceCapture` each step.
 */

/** The two teams. */
export const TEAMS = ['red', 'blue'] as const;

/** One of `TEAMS`. */
export type TeamId = (typeof TEAMS)[number];

/** Timings of the rules, in seconds. */
export const CAPTURE_RULES = {
  /** Total time a team must own the point to win. */
  holdTime: 90,
  /** Time one tank alone takes to capture the point. */
  captureTime: 8,
  /** Time an abandoned capture takes to fall from full back to nothing. */
  decayTime: 20
};

/** Timings of the rules, as `CAPTURE_RULES`. */
export type CaptureRules = typeof CAPTURE_RULES;

/** State of the control point and the teams' clocks. */
export type CaptureState = {
  /** Team that owns the point; nobody at the start. */
  owner: TeamId | undefined;
  /** Team whose capture is under way, with `progress` from 0 to 1. */
  capturer: TeamId | undefined;
  progress: number;
  /** Both teams are on the point, so nothing moves but the owner's clock. */
  contested: boolean;
  /** Seconds each team has owned the point. */
  held: Record<TeamId, number>;
  /** The owner's time is up but the enemy still fights for the point. */
  overtime: boolean;
  winner: TeamId | undefined;
};

/** A neutral point and stopped clocks. */
export function createCaptureState(): CaptureState {
  return { owner: undefined, capturer: undefined, progress: 0, contested: false, held: { red: 0, blue: 0 }, overtime: false, winner: undefined };
}

/**
 * Advances the point by `dt` seconds.
 *
 * @param presence - Live tanks of each team standing on the point.
 * @returns The next state; `state` is left unchanged. A decided match does not change.
 */
export function advanceCapture(state: CaptureState, presence: Record<TeamId, number>, dt: number, rules: CaptureRules = CAPTURE_RULES): CaptureState {
  if (state.winner) {
    return state;
  }

  const next: CaptureState = { ...state, held: { ...state.held }, contested: presence.red > 0 && presence.blue > 0 };
  const alone = next.contested ? undefined : TEAMS.find((team) => presence[team] > 0);

  if (next.owner) {
    next.held[next.owner] = Math.min(next.held[next.owner] + dt, rules.holdTime);
  }

  if (alone) {
    const rate = captureRate(presence[alone]) / rules.captureTime;

    if (alone === next.owner || (next.capturer && next.capturer !== alone)) {
      // Standing on the point undoes the other team's capture first.
      next.progress = Math.max(next.progress - rate * dt, 0);
    } else {
      next.capturer = alone;
      next.progress += rate * dt;
    }
  } else if (!next.contested) {
    next.progress = Math.max(next.progress - dt / rules.decayTime, 0);
  }

  if (next.progress >= 1 && next.capturer) {
    next.owner = next.capturer;
    next.progress = 0;
  }

  if (next.progress === 0) {
    next.capturer = undefined;
  }

  const owner = next.owner;

  if (owner && next.held[owner] >= rules.holdTime) {
    const enemy = rivalOf(owner);
    next.overtime = presence[enemy] > 0 || next.progress > 0;

    if (!next.overtime) {
      next.winner = owner;
    }
  }

  return next;
}

/**
 * How many times faster than one tank `count` tanks capture, as in Team Fortress 2: each more
 * tank adds less, 1 + 1/2 + 1/3 and so on.
 */
export function captureRate(count: number) {
  let rate = 0;

  for (let index = 1; index <= count; index++) {
    rate += 1 / index;
  }

  return rate;
}

/** The other team. */
export function rivalOf(team: TeamId): TeamId {
  return team === 'red' ? 'blue' : 'red';
}
