import { beforeAll, describe, expect, it } from 'vitest';
import type { Tank } from '../arena/bodies';
import { pullSpeedFor } from '../arena/bodies';
import { createCombat, type CombatLayout, type Shot } from '../damage/combat';
import type { createRangeRenderer } from '../damage/renderer';
import type { Rapier } from '../physics/Rapier2D';
import { forecastShot } from './aim';
import { TANK_CLASSES } from './classes/classes';
import { KOTH_MAP } from './map';
import type { TankClassId } from './tanks';

type Point = { x: number; y: number };

let rapier: Rapier;

beforeAll(async () => {
  rapier = (await import('@dimforge/rapier2d-simd/rapier.js')) as Rapier;
});

describe('the aim forecast', () => {
  it("stops at a wall's face and tells steel from a wall that breaks", () => {
    const { combat } = createBattle({ walls: [{ x: 0, y: -60, halfWidth: 12, halfHeight: 40 }, { x: 0, y: 60, halfWidth: 12, halfHeight: 40, material: 'brick' }] });
    const shooter = spawn(combat, 'soldier', { x: -200, y: -60 }, 'red');
    settle(combat);

    const steel = forecastShot(combat, shooter, TANK_CLASSES.soldier, 0)!;
    shooter.hull.setTranslation({ x: -200, y: 60 }, true);
    shooter.pull.setTranslation({ x: -185, y: 60 }, true);
    combat.step(1 / 60);
    const brick = forecastShot(combat, shooter, TANK_CLASSES.soldier, 0)!;

    // The face is 12 px from the wall's center; a breakable wall's colliders are built of blocks of its field.
    expect(Math.abs(steel.lanes[0].end.at.x + 12)).toBeLessThan(0.5);
    expect(steel.lanes[0].end).toMatchObject({ meets: 'wall', breakable: false });
    expect(steel.verdict).toBe('blocked');
    expect(Math.abs(brick.lanes[0].end.at.x + 12)).toBeLessThan(1.5);
    expect(brick.lanes[0].end).toMatchObject({ meets: 'wall', breakable: true });
  });

  it("stops at a wreck, at an enemy's armor past a teammate, and at the end of the range", () => {
    const { combat } = createBattle({ halfWidth: 1200, halfHeight: 1200 });
    const shooter = spawn(combat, 'soldier', { x: -300, y: 0 }, 'red');
    const teammate = spawn(combat, 'soldier', { x: -150, y: 0 }, 'red');
    const enemy = spawn(combat, 'heavy', { x: 50, y: 0 }, 'blue');
    const doomed = spawn(combat, 'soldier', { x: 0, y: 150 }, 'blue');
    combat.detonate(doomed, { x: 0, y: 1 });
    settle(combat);

    const atEnemy = forecastShot(combat, shooter, TANK_CLASSES.soldier, 0)!;
    const wreckAngle = Math.atan2(150 - shooter.hull.translation().y, 0 - shooter.hull.translation().x);
    const atWreck = forecastShot(combat, shooter, TANK_CLASSES.soldier, wreckAngle)!;
    const open = forecastShot(combat, shooter, TANK_CLASSES.soldier, -Math.PI / 2 + 0.3)!;
    const muzzle = combat.muzzleOf(shooter, -Math.PI / 2 + 0.3);

    expect(combat.armorLeft(teammate)).toBe(1);
    expect(atEnemy.lanes[0].end).toMatchObject({ meets: 'tank', tank: enemy, core: false });
    // The Heavy's front is 24 px ahead of its center.
    expect(atEnemy.lanes[0].end.at.x).toBeCloseTo(enemy.hull.translation().x - 24, -0.5);
    expect(atEnemy.verdict).toBe('hit');
    expect(atEnemy.blast?.reaches).toEqual([enemy]);
    expect(atWreck.lanes[0].end).toMatchObject({ meets: 'wreck', breakable: true });
    expect(distance(atWreck.lanes[0].end.at, { x: 0, y: 150 })).toBeLessThan(30);
    expect(open.lanes[0].end.meets).toBe('nothing');
    expect(distance(open.lanes[0].end.at, muzzle)).toBeCloseTo(TANK_CLASSES.soldier.shell.range, 3);
    expect(open.verdict).toBe('clear');
  });

  it('ends where a rocket fired along it goes off, at a wall, a tank and the end of its range', () => {
    const angles = [0, 0.45, -1.2];
    const { combat, shots } = createBattle({ walls: [{ x: 120, y: 0, halfWidth: 14, halfHeight: 30, material: 'concrete' }] });
    const shooter = spawn(combat, 'soldier', { x: -150, y: 0 }, 'red');
    spawn(combat, 'demoman', { x: 60, y: 120 }, 'blue');
    settle(combat);

    for (const angle of angles) {
      const forecast = forecastShot(combat, shooter, TANK_CLASSES.soldier, angle)!;
      const fired = fire(combat, shots, shooter, 'soldier', angle);

      expect(distance(fired, forecast.lanes[0].end.at)).toBeLessThan(3);
    }
  });

  it("ends every pellet of the Scout's volley where it would hit, fanned as the volley is", () => {
    const { combat } = createBattle();
    const shooter = spawn(combat, 'scout', { x: -100, y: 0 }, 'red');
    const enemy = spawn(combat, 'heavy', { x: 20, y: 0 }, 'blue');
    settle(combat);

    const near = forecastShot(combat, shooter, TANK_CLASSES.scout, 0)!;
    const lanes = near.lanes.map((lane) => Math.atan2(lane.end.at.y - lane.path[0].y, lane.end.at.x - lane.path[0].x));

    expect(near.kind).toBe('volley');
    expect(near.lanes).toHaveLength(4);
    expect(near.lanes.every((lane) => lane.end.tank === enemy)).toBe(true);
    expect(lanes[3] - lanes[0]).toBeCloseTo(TANK_CLASSES.scout.weapon.kind === 'volley' ? TANK_CLASSES.scout.weapon.spread : 0, 2);
    expect(near.spread).toBeCloseTo(0.08);
  });

  it("fans the Heavy's lanes over the gatling's spread, the middle one first, weighted as its rounds scatter", () => {
    const { combat } = createBattle();
    const shooter = spawn(combat, 'heavy', { x: -100, y: 0 }, 'red');
    settle(combat);

    const forecast = forecastShot(combat, shooter, TANK_CLASSES.heavy, 0)!;
    const weights = forecast.lanes.map((lane) => lane.weight);
    const angles = forecast.lanes.map((lane) => Math.atan2(lane.end.at.y - lane.path[0].y, lane.end.at.x - lane.path[0].x));

    expect(forecast.kind).toBe('spin');
    expect(angles[0]).toBeCloseTo(0, 6);
    expect(Math.max(...angles)).toBeLessThan(0.07);
    expect(Math.min(...angles)).toBeGreaterThan(-0.07);
    expect(weights.reduce((total, weight) => total + weight, 0)).toBeCloseTo(1, 6);
    expect(weights[0]).toBe(Math.max(...weights));
  });

  it('foresees where a grenade goes off: over open ground, off a wall and into an enemy it meets in the air', () => {
    const { combat, shots } = createBattle({ walls: [{ x: 150, y: -40, halfWidth: 12, halfHeight: 60, material: 'brick' }] });
    const shooter = spawn(combat, 'demoman', { x: -150, y: 100 }, 'red');
    const enemy = spawn(combat, 'soldier', { x: 60, y: 100 }, 'blue');
    settle(combat);

    const throws = [
      { angle: Math.PI / 2 + 0.6, reach: 250 },
      { angle: -0.4, reach: 300 },
      { angle: 0, reach: 190 }
    ];

    for (const { angle, reach } of throws) {
      const forecast = forecastShot(combat, shooter, TANK_CLASSES.demoman, angle, reach)!;
      const fired = fire(combat, shots, shooter, 'demoman', angle, reach);

      expect(distance(fired, forecast.lanes[0].end.at)).toBeLessThan(3);
      expect(forecast.blast?.radius).toBe(95);
    }

    const bounce = forecastShot(combat, shooter, TANK_CLASSES.demoman, -0.4, 300)!;
    const direct = forecastShot(combat, shooter, TANK_CLASSES.demoman, 0, 190)!;

    expect(bounce.lanes[0].path.some((point, index, path) => index > 0 && point.x < path[index - 1].x)).toBe(true);
    expect(direct.lanes[0].end).toMatchObject({ meets: 'tank', tank: enemy });
    expect(direct.verdict).toBe('hit');
    expect(distance(direct.lanes[0].landing ?? { x: Infinity, y: 0 }, shooter.hull.translation())).toBeGreaterThan(190);
  });

  it('marks no hit when a grenade thrown point-blank at a wall bounces back into its thrower', () => {
    const { combat } = createBattle({ walls: [{ x: 60, y: 0, halfWidth: 12, halfHeight: 80, material: 'steel' }] });
    const shooter = spawn(combat, 'demoman', { x: 20, y: 0 }, 'red');
    settle(combat);

    const forecast = forecastShot(combat, shooter, TANK_CLASSES.demoman, 0, 80)!;

    expect(forecast.lanes[0].end.meets).toBe('tank');
    expect(forecast.lanes[0].end.tank).toBeUndefined();
    expect(forecast.verdict).toBe('blocked');
  });

  it('ends where shells and grenades fired along it stop, all over the king of the hill map', () => {
    const { combat, shots } = createBattle(KOTH_MAP);
    // In the hall, on the plaza, in the north and the south street, among walls of every material.
    const spots = [
      { x: -650, y: -90 },
      { x: -260, y: 0 },
      { x: -500, y: -60 },
      { x: -1000, y: -330 },
      { x: -800, y: 330 }
    ];

    expect(spots.every((spot) => combat.obstacleDistance(spot, 50) > 25)).toBe(true);
    const misses: string[] = [];
    let worst = 0;

    for (const spot of spots) {
      for (let turn = 0; turn < 8; turn++) {
        const angle = (turn / 8) * Math.PI * 2 + 0.2;

        for (const id of ['soldier', 'scout', 'heavy', 'demoman'] as const) {
          // A fresh tank for every shot: a blast may have thrown the last one into a wall.
          const shooter = spawn(combat, id, spot, 'red');
          combat.step(1 / 60);
          const forecast = forecastShot(combat, shooter, TANK_CLASSES[id], angle, 260)!;
          // The last lane of a volley or a gatling's fan is one of its edges, fired as a shell of its own.
          const lane = forecast.lanes.at(-1)!;
          const start = lane.path[0];
          const end = lane.path[1];
          const along = id === 'demoman' ? angle : Math.atan2(end.y - start.y, end.x - start.x);
          const shot = id === 'scout' ? { angle, volley: [along - angle] } : { angle: along };
          const fired = fireShot(combat, shots, shooter, { shell: TANK_CLASSES[id].shell, reach: 260, ...shot });
          const off = distance(fired, lane.end.at);
          combat.removeTank(shooter);
          worst = Math.max(worst, off);

          if (off >= 3) {
            misses.push(`${id} from ${spot.x},${spot.y} at ${angle.toFixed(2)}: ${off.toFixed(1)} px`);
          }
        }
      }
    }

    expect(misses).toEqual([]);
    expect(worst).toBeLessThan(3);
  });

  it('foresees a charged rail only while it charges, telling a line that blows the core up from one that only slits the armor', () => {
    const { combat } = createBattle();
    // Side on to the shooter: its core lies 11 px behind its middle, at y = -11.
    const enemy = combat.spawnTank({ x: 300, y: 0, rotation: Math.PI / 2 }, { color: 0, team: 'blue' });
    const shooter = spawn(combat, 'sniper', { x: 0, y: 0 }, 'red');
    settle(combat);
    const along = (y: number, charge: number | undefined) => {
      // The gun sits 2.5 px right of the hull's middle: move the hull so the gun's line runs at `y`.
      shooter.hull.setTranslation({ x: 0, y: y - 2.5 }, true);
      return forecastShot(combat, shooter, TANK_CLASSES.sniper, 0, undefined, charge);
    };
    const core = combat.coreOf(enemy)!;

    expect(along(core.y, undefined)).toBeUndefined();
    expect(along(core.y, 1)!.verdict).toBe('kill');
    expect(along(core.y, 1)!.lanes[0].end.tank).toBe(enemy);
    expect(along(core.y + 16, 1)!.verdict).toBe('hit');
    // With no charge the rail stops in the side armor, short of the core.
    expect(along(core.y, 0)!.verdict).toBe('hit');
  });
});

/** Fires a shot of class `id` along `angle` and returns where its shell ended, once it has. */
function fire(combat: ReturnType<typeof createCombat>, shots: Point[][], shooter: Tank, id: TankClassId, angle: number, reach?: number) {
  return fireShot(combat, shots, shooter, { shell: TANK_CLASSES[id].shell, angle, reach });
}

/**
 * Fires `shot` and returns where its first shell ended. The shooter is held where it fired from,
 * as the forecast takes the world to stand still, though recoil and its blast would move it. Waits
 * until the shrapnel of the blast has landed too, so the next forecast sees the walls as the next
 * shot will.
 */
function fireShot(combat: ReturnType<typeof createCombat>, shots: Point[][], shooter: Tank, shot: Shot) {
  const spot = { ...shooter.hull.translation() };
  const tow = { ...shooter.pull.translation() };
  shots.length = 0;
  shooter.turretAngle = shot.angle ?? shooter.turretAngle;
  combat.fire(shooter, shot);

  for (let step = 0; step < 180 && (shots.length === 0 || combat.shells.length > 0); step++) {
    shooter.hull.setTranslation(spot, true);
    shooter.hull.setLinvel({ x: 0, y: 0 }, true);
    shooter.pull.setTranslation(tow, true);
    combat.step(1 / 60);
  }

  return shots[0].at(-1)!;
}

/** A tank of class `id` for `team`, facing right. */
function spawn(combat: ReturnType<typeof createCombat>, id: TankClassId, at: Point, team: string) {
  const tankClass = TANK_CLASSES[id];
  return combat.spawnTank({ ...at, rotation: 0 }, { color: 0x3355cc, team, pullSpeed: pullSpeedFor(tankClass.speed), hull: tankClass.hull, mass: tankClass.mass, look: tankClass.look });
}

/** Lets everything settle, so Rapier's ray queries see the bodies where they stand. */
function settle(combat: ReturnType<typeof createCombat>) {
  for (let step = 0; step < 120; step++) {
    combat.step(1 / 60);
    combat.update(1 / 60);
  }
}

function distance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** A king of the hill battle without friendly fire on a real Rapier world, seeded, with a renderer that only hands out field slots. */
function createBattle(layout: Partial<CombatLayout> = {}) {
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
  let state = 5;
  const shots: Point[][] = [];
  const combat = createCombat(
    rapier,
    world,
    renderer as unknown as ReturnType<typeof createRangeRenderer>,
    { halfWidth: 500, halfHeight: 400, ...layout },
    {
      friendlyFire: false,
      random: () => {
        state = (state * 16807) % 2147483647;
        return (state - 1) / 2147483646;
      },
      onShot: (_shooter, path) => shots.push([...path])
    }
  );

  return { combat, shots };
}
