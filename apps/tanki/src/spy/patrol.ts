import type { Tank } from '../arena/bodies';
import type { Patrol } from './arena';
import { angleBetween } from './visibility';

type Point = { x: number; y: number };

/**
 * What a patrolling tank knows this step: where the spider is and whether the tank sees it, the
 * nearest enemy tank it sees, and whether it may fire along a line.
 */
export type PatrolSenses = {
  /** The spider, when it is in play; `visible` by the sandbox's rule of sight. */
  spider: { position: Point; visible: boolean } | undefined;
  /** The nearest tank in sight that has shown itself an enemy, such as a hijacked tank that fired. */
  enemy: { position: Point } | undefined;
  /** Whether a shot from this tank's muzzle at `target` would hit no teammate on the way. */
  clearShot: (target: Point) => boolean;
  /** Other tanks in play, to keep clear of. */
  others: readonly Point[];
};

/**
 * A sandbox tank's mind. It drives its patrol loop at a walking pace and stops at its posts to
 * look around; driving, it sweeps its turret from side to side and every few seconds turns it
 * all the way round to check behind. A spider in sight raises its suspicion, faster up close;
 * once suspicion is full the tank stops, tracks the spider and fires, then searches where it
 * last saw it before it drives on. A noise makes it look that way; a startle sends it after
 * whatever startled it. Enemy tanks it sees are fought the same way, without suspicion.
 *
 * Turrets turn at a limited speed, which is what lets the spider slip behind a tank.
 */
export function createPatrolBot(patrol: Patrol, random: () => number) {
  let next = 1 % patrol.route.length;
  let post = 0;
  let sweep = random() * Math.PI * 2;
  let checkSixIn = between(CHECK_SIX_EVERY.min, CHECK_SIX_EVERY.max);
  let checkSixFor = 0;
  let suspicion = 0;
  let alert: { at: Point; lost: number } | undefined;
  let search = 0;
  let look: { at: Point; left: number } | undefined;
  let reload = 0;
  let stuck = 0;
  let sidestep = 0;
  let mode: PatrolMode = 'patrol';

  return {
    /** How sure the tank is that it saw the spider, 0-1; 1 means it fights it. */
    get suspicion() {
      return suspicion;
    },

    /** What the tank is doing, for display. */
    get mode() {
      return mode;
    },

    /** Whether the tank is fighting the spider or an enemy tank. */
    get alerted() {
      return alert !== undefined;
    },

    /** Turns the turret toward a sound at `at` for a couple of seconds, unless the tank already fights. */
    hear(at: Point) {
      if (!alert) {
        look = { at, left: LOOK_TIME };
      }
    },

    /** Something happened to the tank from `at`: it fights toward there, as if it had seen the spider. */
    startle(at: Point) {
      alert = { at, lost: 0 };
      suspicion = 1;
    },

    /**
     * Decides this step's drive and whether to fire, and turns the turret. A jammed tank does
     * nothing; a stunned one only thinks.
     *
     * @returns Drive direction in world axes, length up to 1, and whether to fire now.
     */
    think(dt: number, tank: Tank, senses: PatrolSenses, state: { jammed: boolean; stunned: boolean }) {
      reload = Math.max(reload - dt, 0);
      const position = tank.hull.translation();
      const heading = tank.hull.rotation();
      const spider = senses.spider;

      if (spider?.visible) {
        const distance = Math.hypot(spider.position.x - position.x, spider.position.y - position.y);
        const closeness = 1 + Math.max(CLOSE_RANGE - distance, 0) / CLOSE_RANGE;
        suspicion = Math.min(suspicion + (dt / REACTION_TIME) * closeness, 1);

        if (suspicion >= 1) {
          alert = { at: { ...spider.position }, lost: 0 };
        }
      } else if (!alert) {
        suspicion = Math.max(suspicion - dt * SUSPICION_FADE, 0);
      }

      const enemy = senses.enemy;

      if (enemy) {
        alert = { at: { ...enemy.position }, lost: 0 };
      } else if (alert && !spider?.visible) {
        alert.lost += dt;

        if (alert.lost > LOSE_TIME) {
          search = SEARCH_TIME;
          look = { at: alert.at, left: SEARCH_TIME };
          alert = undefined;
        }
      }

      search = Math.max(search - dt, 0);

      if (look) {
        look.left -= dt;
        look = look.left > 0 ? look : undefined;
      }

      if (state.jammed) {
        mode = 'jammed';
        return { move: STOP, fire: false };
      }

      const aim = turretGoal(dt, position, heading);
      const speed = alert ? ALERT_TURRET_SPEED : TURRET_SPEED;
      const error = angleBetween(tank.turretAngle, aim);
      tank.turretAngle += Math.sign(error) * Math.min(Math.abs(error), speed * dt);

      if (state.stunned) {
        mode = 'stunned';
        return { move: STOP, fire: false };
      }

      const sees = enemy !== undefined || (spider?.visible === true && alert !== undefined);
      const target = alert?.at;
      const fire = sees && target !== undefined && reload === 0 && Math.abs(error) < AIM_TOLERANCE && senses.clearShot(target);

      if (fire) {
        reload = RELOAD_TIME;
      }

      return { move: alert || search > 0 ? STOP : drive(dt, tank, senses.others), fire };
    }
  };

  /** The turret's goal this step, in world radians. */
  function turretGoal(dt: number, position: Point, heading: number) {
    if (alert) {
      mode = 'alert';
      return Math.atan2(alert.at.y - position.y, alert.at.x - position.x);
    }

    if (look) {
      mode = search > 0 ? 'search' : 'listen';
      const toward = Math.atan2(look.at.y - position.y, look.at.x - position.x);
      return search > 0 ? toward + Math.sin(look.left * 2.2) * SEARCH_SWEEP : toward;
    }

    if (post > 0) {
      mode = 'post';
      const glance = POST_GLANCES[Math.floor(post / GLANCE_TIME) % POST_GLANCES.length];
      return heading + glance;
    }

    checkSixIn -= dt;

    if (checkSixIn <= 0) {
      checkSixFor = CHECK_SIX_TIME;
      checkSixIn = between(CHECK_SIX_EVERY.min, CHECK_SIX_EVERY.max);
    }

    if (checkSixFor > 0) {
      checkSixFor -= dt;
      mode = 'check six';
      return heading + Math.PI;
    }

    mode = 'patrol';
    sweep += dt * SWEEP_RATE;
    return heading + Math.sin(sweep) * SWEEP_ANGLE;
  }

  /** Drives the patrol loop: toward the next waypoint, around other tanks, out of corners it got stuck in. */
  function drive(dt: number, tank: Tank, others: readonly Point[]) {
    const position = tank.hull.translation();

    if (post > 0) {
      post = Math.max(post - dt, 0);
      return STOP;
    }

    const waypoint = patrol.route[next];
    const toward = { x: waypoint.x - position.x, y: waypoint.y - position.y };
    const distance = Math.hypot(toward.x, toward.y);

    if (distance < ARRIVE_RADIUS) {
      post = patrol.posts[next] ?? 0;
      next = (next + 1) % patrol.route.length;
      return STOP;
    }

    let direction = { x: toward.x / distance, y: toward.y / distance };
    const blocked = others.some((other) => {
      const offset = { x: other.x - position.x, y: other.y - position.y };
      const gap = Math.hypot(offset.x, offset.y);
      return gap < YIELD_DISTANCE && (offset.x * direction.x + offset.y * direction.y) / gap > YIELD_COS;
    });
    const velocity = tank.hull.linvel();
    stuck = Math.hypot(velocity.x, velocity.y) < STUCK_SPEED ? stuck + dt : 0;

    if (stuck > STUCK_TIME) {
      stuck = 0;
      sidestep = SIDESTEP_TIME;
    }

    if (sidestep > 0 || blocked) {
      sidestep = Math.max(sidestep - dt, 0);
      direction = { x: -direction.y * 0.8 + direction.x * 0.2, y: direction.x * 0.8 + direction.y * 0.2 };
    }

    return { x: direction.x * PATROL_THROTTLE, y: direction.y * PATROL_THROTTLE };
  }

  function between(min: number, max: number) {
    return min + random() * (max - min);
  }
}

/** A patrolling tank's mind from `createPatrolBot`. */
export type PatrolBot = ReturnType<typeof createPatrolBot>;

/** What a patrolling tank does: drives, stands at a post, checks behind, listens, searches, fights or is jammed or stunned. */
export type PatrolMode = 'patrol' | 'post' | 'check six' | 'listen' | 'search' | 'alert' | 'jammed' | 'stunned';

/** Seconds a spider must stay in sight at middle distance before the tank fights it. */
export const REACTION_TIME = 0.45;

const STOP = { x: 0, y: 0 };
/** Within this distance in pixels suspicion rises faster, up to twice as fast right next to the tank. */
const CLOSE_RANGE = 200;
const SUSPICION_FADE = 0.4;
/** Seconds out of sight before a fighting tank searches instead. */
const LOSE_TIME = 2.5;
const SEARCH_TIME = 3;
const SEARCH_SWEEP = 0.9;
const LOOK_TIME = 2;
/** Turret speeds in radians per second while patrolling and while fighting: half a turn takes 1.6 s and 1 s. */
const TURRET_SPEED = 2;
const ALERT_TURRET_SPEED = 3.1;
const AIM_TOLERANCE = 0.05;
const RELOAD_TIME = 0.9;
const SWEEP_ANGLE = 0.85;
const SWEEP_RATE = 0.8;
const CHECK_SIX_EVERY = { min: 6, max: 11 };
const CHECK_SIX_TIME = 1.6;
/** Turret headings relative to the hull a tank at a post looks along in turn, each for `GLANCE_TIME`. */
const POST_GLANCES = [0, 1.3, -1.3, Math.PI, 0.6];
const GLANCE_TIME = 1.1;
const ARRIVE_RADIUS = 30;
/** Share of the pull's speed a patrol drives at: a hull settles at about 110 px/s. */
const PATROL_THROTTLE = 0.65;
const YIELD_DISTANCE = 75;
const YIELD_COS = 0.6;
const STUCK_SPEED = 12;
const STUCK_TIME = 1.2;
const SIDESTEP_TIME = 0.8;
