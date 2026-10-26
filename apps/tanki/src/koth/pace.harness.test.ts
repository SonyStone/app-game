import { beforeAll, describe, it } from 'vitest';
import type { Tank } from '../arena/bodies';
import { createCamera, DRAG_MARGIN, followTarget, worldToScreen, type Camera } from '../arena/camera';
import { createLookAhead } from '../arena/lookahead';
import type { createRangeRenderer } from '../damage/renderer';
import type { Rapier } from '../physics/Rapier2D';
import { applyClassTuning } from './classes/knobs';
import { createKothMatch, type KothMatch } from './match';
import { PACE_DEFAULTS, type Pace } from './pace';
import { MEDIUM_TANK, TANK_CLASS_IDS, type TankClassId } from './tanks';
import type { Member } from './team';
import { harnessTuning } from './tuning';

/**
 * How fast the fight feels to the player, measured in matches where a bot plays the player's
 * seat and the player's screen is followed as the route would place it, with the camera centered
 * on the tank as before the look-ahead and with the look-ahead, whose cursor a player would put
 * on the nearest enemy the screen shows, else ahead of where the tank drives:
 *
 * - The warning the player gets: from an enemy coming onto the screen to its first hit on the
 *   player, once per time it comes into view, in real seconds; and how many hits came from enemies
 *   the screen had not shown for the last second.
 * - How long a tank lasts once shot, by the class destroyed: from the first hit on it as a whole
 *   tank, newly spawned or mended, to its destruction, and the hits it took meanwhile; and the
 *   last fight it lost, hits less than three seconds apart, also by the class that destroyed it.
 *
 * Slow, so it runs only with `TANKI_PACE=1 pnpm exec vitest run src/koth/pace.harness.test.ts`.
 * `TANKI_TUNING` names a file of a tuning exported from the pause menu's class editor, or holds
 * its JSON, link or code (see `harnessTuning`): the matches are played with its pace and classes.
 * `TANKI_PACE_SET` sets knobs of `Pace` over it, as `shellSpeed=0.8,botReaction=1.6`; `TANKI_PACE_CLASSES`
 * the player's classes, comma-separated, all five by default; `TANKI_SEEDS` the seeds, comma-separated.
 */
describe.skipIf(!import.meta.env.TANKI_PACE)('pace as the player sees it', () => {
  let rapier: Rapier;

  beforeAll(async () => {
    rapier = (await import('@dimforge/rapier2d-simd/rapier.js')) as Rapier;
  });

  it('measures the warning before a hit and the time to kill', () => {
    const tuned = harnessTuning(import.meta.env.TANKI_TUNING);
    const pace = { ...PACE_DEFAULTS, ...tuned.tuning.pace, ...knobsFromEnvironment() };
    applyClassTuning(tuned.tuning.classes);
    console.log(
      `tuning ${JSON.stringify(tuned.tuning)}${tuned.dropped.length > 0 ? `; left out ${tuned.dropped.join(', ')}` : ''}`
    );
    const classes = (import.meta.env.TANKI_PACE_CLASSES?.split(',') as TankClassId[] | undefined) ?? [...TANK_CLASS_IDS];
    const seeds = import.meta.env.TANKI_SEEDS?.split(',').map(Number) ?? [11, 23, 37];
    const tally = createTally();

    for (const playerClass of classes) {
      for (const seed of seeds) {
        playMatch(rapier, playerClass, seed, pace, tally);
      }
    }

    console.log(report(tally, pace, classes, seeds));
  }, 3_600_000);
});

/** The player's screen, a laptop's at the default zoom: about 900 x 560 px of the map. */
const SCREEN = { width: 1440, height: 900 };
const STEP = 1 / 60;
const MATCH_TIME = 240;
/** An enemy off the screen this long and back counts as coming into view anew. */
const AWAY = 1;
/** A hit by an enemy the screen has not shown for this long came from off the screen. */
const UNSEEN = 1;
/** Hits on a tank closer together than this are one fight. */
const FIGHT_GAP = 3;
/** A tank with this share of its armor or more, and no hit for `FIGHT_GAP` s, counts as whole again. */
const WHOLE = 0.995;
/** World pixels ahead the player's cursor rests when the gun has nothing to aim at. */
const RESTING_AIM = 260;

type CameraId = 'centered' | 'ahead';
type Tally = ReturnType<typeof createTally>;

function createTally() {
  const views = () => ({ warnings: [] as number[], hits: 0, unseen: 0, appearances: 0 });

  return {
    views: { centered: views(), ahead: views() } as Record<CameraId, ReturnType<typeof views>>,
    lasts: new Map<TankClassId, number[]>(),
    wounded: new Map<TankClassId, number[]>(),
    woundHits: new Map<TankClassId, number[]>(),
    kills: new Map<TankClassId, number[]>(),
    hitsToKill: new Map<TankClassId, number[]>(),
    playerDeaths: 0,
    deaths: 0,
    time: 0
  };
}

/** Plays one match with `playerClass` in the player's seat, driven by a bot, and adds what it saw to `tally`. */
function playMatch(rapier: Rapier, playerClass: TankClassId, seed: number, pace: Pace, tally: Tally) {
  const fights = new Map<number, { start: number; last: number; hits: number; killer: TankClassId }>();
  // Since when each tank has been hurt, from its first hit as a whole tank, and how many hits it took.
  const wounds = new Map<number, { since: number; hits: number }>();
  // Hits of this step, by member: a hit that destroys its target leaves it no tank by the step's end.
  const pending: { victim: Member; attacker: Member }[] = [];
  const match: KothMatch = createMatch(rapier, seed, playerClass, pace, (target, shooter, part) => {
    const victim = match.members.find((member) => member.tank === target);
    const attacker = match.members.find((member) => member.tank === shooter);

    if (victim && attacker && victim.team !== attacker.team && part !== 'ricochet') {
      pending.push({ victim, attacker });
    }
  });
  match.spectate(true);
  const seat = match.seat;
  const rivals = match.members.filter((member) => member.team !== seat.team);
  const cameras: Record<CameraId, Camera> = {
    centered: { ...createCamera(seat.tank!.hull.translation()), zoom: pace.zoom },
    ahead: { ...createCamera(seat.tank!.hull.translation()), zoom: pace.zoom }
  };
  const lookAhead = createLookAhead();
  // When each enemy was last on each screen, and since when it has been on it this time.
  const seen = { centered: new Map<number, { last: number; since: number; counted: boolean }>(), ahead: new Map<number, { last: number; since: number; counted: boolean }>() };
  const deaths = new Map(match.members.map((member) => [member.id, member.deaths]));

  while (match.time < MATCH_TIME && !match.capture.winner) {
    match.step(STEP);
    match.update(STEP);
    const now = match.time;
    heal(now);
    const tank = seat.tank;

    if (tank) {
      followTarget(cameras.centered, tank.hull.translation(), SCREEN, DRAG_MARGIN);
      const enemies = rivals.flatMap((rival) => (rival.tank ? [rival.tank] : []));
      lookAhead.place(cameras.ahead, SCREEN, match.combat.gunPivotOf(tank), cursorOf(tank, enemies, cameras.ahead, pace.lead), { share: pace.lead, dt: STEP });
    }

    for (const id of ['centered', 'ahead'] as const) {
      for (const rival of rivals) {
        const enemy = rival.tank;
        const shown = tank !== undefined && enemy !== undefined && onScreen(cameras[id], enemy.hull.translation());
        const sighting = seen[id].get(rival.id);

        if (shown && (!sighting || now - sighting.last > AWAY)) {
          seen[id].set(rival.id, { last: now, since: now, counted: false });
          tally.views[id].appearances++;
        } else if (shown && sighting) {
          sighting.last = now;
        }
      }
    }

    for (const { victim, attacker } of pending.splice(0)) {
      const fight = fights.get(victim.id);
      const killer = attacker.tankClass.id;
      fights.set(victim.id, fight && now - fight.last < FIGHT_GAP ? { ...fight, last: now, hits: fight.hits + 1, killer } : { start: now, last: now, hits: 1, killer });
      const wound = wounds.get(victim.id);
      wounds.set(victim.id, { since: wound?.since ?? now, hits: (wound?.hits ?? 0) + 1 });

      if (victim !== seat) {
        continue;
      }

      for (const id of ['centered', 'ahead'] as const) {
        const sighting = seen[id].get(attacker.id);
        const view = tally.views[id];
        view.hits++;

        if (!sighting || now - sighting.last > UNSEEN) {
          view.unseen++;
        } else if (!sighting.counted) {
          sighting.counted = true;
          view.warnings.push((now - sighting.since) / pace.speed);
        }
      }
    }

    for (const member of match.members) {
      if (member.deaths === deaths.get(member.id)) {
        continue;
      }

      deaths.set(member.id, member.deaths);
      tally.deaths++;
      tally.playerDeaths += member === seat ? 1 : 0;
      const fight = fights.get(member.id);
      const wound = wounds.get(member.id);
      fights.delete(member.id);
      wounds.delete(member.id);

      if (wound) {
        push(tally.wounded, member.tankClass.id, (now - wound.since) / pace.speed);
        push(tally.woundHits, member.tankClass.id, wound.hits);
      }

      if (fight && now - fight.last < FIGHT_GAP) {
        push(tally.lasts, member.tankClass.id, (now - fight.start) / pace.speed);
        push(tally.hitsToKill, member.tankClass.id, fight.hits);
        push(tally.kills, fight.killer, (now - fight.start) / pace.speed);
      }
    }
  }

  tally.time += match.time / pace.speed;

  /** Forgets the wounds of tanks mended whole and out of the fight. */
  function heal(now: number) {
    for (const member of match.members) {
      const wound = wounds.get(member.id);
      const fight = fights.get(member.id);

      if (wound && member.tank && match.combat.armorLeft(member.tank) >= WHOLE && (!fight || now - fight.last > FIGHT_GAP)) {
        wounds.delete(member.id);
      }
    }
  }
}

/**
 * Where the player's cursor would be for the look-ahead: on the nearest enemy the screen shows, as
 * a player aims at what they see, else `RESTING_AIM` ahead of where the tank drives, or of its
 * hull when it stands; placed on the screen where that spot will be once the view has settled,
 * and kept on the screen.
 */
function cursorOf(tank: Tank, enemies: readonly Tank[], camera: Camera, share: number) {
  const from = tank.hull.translation();
  const away = (enemy: Tank) => Math.hypot(enemy.hull.translation().x - from.x, enemy.hull.translation().y - from.y);
  const target = enemies.filter((enemy) => onScreen(camera, enemy.hull.translation())).sort((a, b) => away(a) - away(b))[0];
  const velocity = tank.hull.linvel();
  const heading = Math.hypot(velocity.x, velocity.y) > 20 ? Math.atan2(velocity.y, velocity.x) : tank.hull.rotation();
  const angle = target ? Math.atan2(target.hull.translation().y - from.y, target.hull.translation().x - from.x) : heading;
  const reach = target ? away(target) : RESTING_AIM;
  const direction = { x: Math.cos(angle - camera.rotation), y: Math.sin(angle - camera.rotation) };
  const across = Math.abs(direction.x) > 1e-9 ? SCREEN.width / 2 / Math.abs(direction.x) : Infinity;
  const down = Math.abs(direction.y) > 1e-9 ? SCREEN.height / 2 / Math.abs(direction.y) : Infinity;
  const offset = Math.min((reach * camera.zoom) / (1 + share), across, down);
  return { kind: 'point' as const, x: SCREEN.width / 2 + direction.x * offset, y: SCREEN.height / 2 + direction.y * offset };
}

function onScreen(camera: Camera, point: { x: number; y: number }) {
  const at = worldToScreen(camera, point, SCREEN);
  return at.x >= 0 && at.x <= SCREEN.width && at.y >= 0 && at.y <= SCREEN.height;
}

/** The tables of `tally`, with the pace and the trip from spawn to the point. */
function report(tally: Tally, pace: Pace, classes: readonly TankClassId[], seeds: readonly number[]) {
  const lines = [
    `pace ${JSON.stringify(pace)}; player as ${classes.join(', ')}; seeds ${seeds.join(', ')}; ${(tally.time / 60).toFixed(1)} min real time`,
    `spawn to point at the medium tank's speed: ${(1377 / (MEDIUM_TANK.speed * pace.tankSpeed) / pace.speed).toFixed(1)} s real time; deaths per tank-minute ${(tally.deaths / (tally.time / 60) / 8).toFixed(2)}, the player's ${(tally.playerDeaths / (tally.time / 60)).toFixed(2)}`,
    '',
    'camera     enemy came into view -> its first hit on the player (s)      hits on the player',
    '           first hits  p10   p25  median  <0.5s  <1.0s  appearances    all  from off screen'
  ];

  for (const id of ['centered', 'ahead'] as const) {
    const view = tally.views[id];
    const warnings = [...view.warnings].sort((a, b) => a - b);
    lines.push(
      `${id.padEnd(10)} ${String(warnings.length).padStart(10)} ${quantile(warnings, 0.1).toFixed(2).padStart(5)} ${quantile(warnings, 0.25).toFixed(2).padStart(5)} ${quantile(warnings, 0.5).toFixed(2).padStart(7)}` +
        ` ${share(warnings, 0.5).padStart(6)} ${share(warnings, 1).padStart(6)} ${String(view.appearances).padStart(12)} ${String(view.hits).padStart(6)} ${`${view.unseen} (${Math.round((view.unseen / Math.max(view.hits, 1)) * 100)}%)`.padStart(16)}`
    );
  }

  lines.push('', 'class      whole -> destroyed: median s  hits (deaths)   last fight lost: median s  hits   won by the class: median s (kills)');

  for (const id of TANK_CLASS_IDS) {
    const sorted = (map: Map<TankClassId, number[]>) => [...(map.get(id) ?? [])].sort((a, b) => a - b);
    const [wounded, woundHits, lasts, hits, kills] = [tally.wounded, tally.woundHits, tally.lasts, tally.hitsToKill, tally.kills].map(sorted);
    lines.push(
      `${id.padEnd(10)} ${quantile(wounded, 0.5).toFixed(2).padStart(26)} ${`${quantile(woundHits, 0.5).toFixed(0)} (${wounded.length})`.padStart(13)}` +
        ` ${quantile(lasts, 0.5).toFixed(2).padStart(26)} ${quantile(hits, 0.5).toFixed(0).padStart(5)} ${`${quantile(kills, 0.5).toFixed(2)} (${kills.length})`.padStart(28)}`
    );
  }

  return lines.join('\n');
}

function quantile(sorted: readonly number[], at: number) {
  return sorted.length === 0 ? NaN : sorted[Math.min(Math.floor(at * sorted.length), sorted.length - 1)];
}

function share(values: readonly number[], below: number) {
  return `${Math.round((values.filter((value) => value < below).length / Math.max(values.length, 1)) * 100)}%`;
}

function push<K>(map: Map<K, number[]>, key: K, value: number) {
  map.set(key, [...(map.get(key) ?? []), value]);
}

/** Knobs of `Pace` from `TANKI_PACE_SET`, as `shellSpeed=0.8,botReaction=1.6`. */
function knobsFromEnvironment(): Partial<Pace> {
  const set: string = import.meta.env.TANKI_PACE_SET ?? '';
  return Object.fromEntries(
    set
      .split(',')
      .filter(Boolean)
      .map((pair) => {
        const [key, value] = pair.split('=');
        return [key.trim(), Number(value)];
      })
  );
}

/** A seeded match with the player's seat of `playerClass`, on a renderer that only hands out field slots. */
function createMatch(rapier: Rapier, seed: number, playerClass: TankClassId, pace: Pace, onHit: NonNullable<Parameters<typeof createKothMatch>[3]>['onHit']) {
  const world = new rapier.World({ x: 0, y: 0 });
  world.lengthUnit = 100;
  const slots = Array.from({ length: 512 }, (_, index) => 511 - index);
  const renderer = {
    allocateField: () => slots.pop(),
    releaseField: (slot: number) => slots.push(slot),
    uploadField() {},
    beginBodies() {},
    addBody() {},
    spawn() {},
    addSmokeBall() {},
    addLight() {},
    render() {}
  };
  let state = seed;
  const random = () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };

  return createKothMatch(rapier, world, renderer as unknown as ReturnType<typeof createRangeRenderer>, { human: true, random, playerClass, pace: () => pace, onHit });
}
