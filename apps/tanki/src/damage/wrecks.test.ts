import { beforeAll, describe, expect, it } from 'vitest';
import { pullSpeedFor, type Tank } from '../arena/bodies';
import { createNavGrid, isOpenAt, updateNavGrid } from '../koth/navigation';
import type { Rapier } from '../physics/Rapier2D';
import { TANK_CLASSES } from '../koth/classes/classes';
import { chargedShell } from '../koth/classes/weapon';
import { MEDIUM_TANK, TANK_CLASS_IDS, type TankClassId } from '../koth/tanks';
import { createCombat, type CombatLayout, type ShellSpec, type Shot } from './combat';
import { carve } from './field';
import type { createRangeRenderer } from './renderer';
import { HULL_CORE } from './shapes';

let rapier: Rapier;

beforeAll(async () => {
  rapier = (await import('@dimforge/rapier2d-simd/rapier.js')) as Rapier;
});

const shell: ShellSpec = { speed: 900, range: 700, hole: 4.5, depth: 3, knockback: 700 };

describe('wrecks', () => {
  it('stand where a tank blew up, charred, and stop shells and sight until shot apart into scrap', () => {
    const { combat } = createBattle();
    const shooter = combat.spawnTank({ x: -200, y: 0, rotation: 0 }, { color: 0xff0000 });
    const target = combat.spawnTank({ x: 0, y: 0, rotation: 0 }, { color: 0x0000ff, team: 'blue' });

    blowUp(combat, shooter, target);

    const [wreck] = combat.wrecks.list;

    expect(combat.armorOf(target)).toBeUndefined();
    expect(combat.wrecks.list).toHaveLength(1);
    expect(Math.hypot(wreck.x, wreck.y)).toBeLessThan(15);
    expect(wreck.team).toBe('blue');
    // The blast tore the core out and threw a piece or two off, but most of the hull stands.
    expect(wreck.area).toBeGreaterThan(450);
    expect(combat.lineOfSight({ x: -100, y: 0 }, { x: 100, y: 0 })).toBe(false);
    expect(combat.obstacleDistance({ x: wreck.x, y: wreck.y }, 100)).toBeLessThan(0);

    // A tank behind the wreck is safe from a shell fired straight at it.
    const hidden = combat.spawnTank({ x: 150, y: 0, rotation: 0 }, { color: 0x0000ff, team: 'blue' });
    fireAt(combat, shooter, hidden.hull.translation());

    expect(combat.armorLeft(hidden)).toBe(1);
    expect(combat.wrecks.list[0].area).toBeLessThan(wreck.area);

    for (let shot = 0; shot < 40 && combat.wrecks.list.length > 0; shot++) {
      fireAt(combat, shooter, { x: wreck.x, y: wreck.y + [0, 6, -6, 10, -10][shot % 5] });
    }

    settle(combat);

    expect(combat.wrecks.list).toHaveLength(0);
    expect(combat.wrecks.made).toBe(1);
    expect(combat.scrap.near({ x: wreck.x, y: wreck.y }, 120).length).toBeGreaterThanOrEqual(3);
  });

  it('stand at most as many as the limit, the oldest falling apart into a heap of scrap', () => {
    const { combat } = createBattle({ wrecks: 2 });
    const shooter = combat.spawnTank({ x: -300, y: 0, rotation: 0 }, { color: 0xff0000 });
    const spots = [-120, 0, 120];

    for (const y of spots) {
      const target = combat.spawnTank({ x: 0, y, rotation: 0 }, { color: 0x0000ff });
      shooter.hull.setTranslation({ x: -300, y }, true);
      shooter.pull.setTranslation({ x: -285, y }, true);
      blowUp(combat, shooter, target);
    }

    settle(combat);

    expect(combat.wrecks.made).toBe(3);
    expect(combat.wrecks.list.map((wreck) => Math.round(wreck.y / 120))).toEqual([0, 1]);
    // Where the first stood lies a heap of its pieces.
    expect(combat.scrap.near({ x: 0, y: -120 }, 60).length).toBeGreaterThanOrEqual(3);
  });

  it('do not budge for a push, and slide a few pixels from a ram at full speed', () => {
    const { combat } = createBattle({}, { halfWidth: 600 });
    const shooter = combat.spawnTank({ x: -300, y: 0, rotation: 0 }, { color: 0xff0000 });
    const target = combat.spawnTank({ x: 0, y: 0, rotation: 0 }, { color: 0x0000ff });
    blowUp(combat, shooter, target);
    shooter.hull.setTranslation({ x: -300, y: 200 }, true);
    shooter.pull.setTranslation({ x: -285, y: 200 }, true);
    const before = combat.wrecks.list[0];

    // A tank creeps up to the wreck and keeps pushing.
    const pusher = combat.spawnTank({ x: -70, y: 0, rotation: 0 }, { color: 0, pullSpeed: pullSpeedFor(250) });

    for (let step = 0; step < 120; step++) {
      combat.drive(pusher, { x: 0.3, y: 0 });
      combat.step(1 / 60);
    }

    const pushed = combat.wrecks.list[0];

    // It backs off and rams the wreck at full speed.
    pusher.hull.setTranslation({ x: -180, y: 0 }, true);
    pusher.hull.setRotation(0, true);
    pusher.pull.setTranslation({ x: -165, y: 0 }, true);

    for (let step = 0; step < 60; step++) {
      combat.drive(pusher, { x: 1, y: 0 });
      combat.step(1 / 60);
    }

    const rammed = combat.wrecks.list[0];

    expect(Math.hypot(pushed.x - before.x, pushed.y - before.y)).toBeLessThan(0.5);
    expect(rammed.x - pushed.x).toBeGreaterThan(3);
    expect(rammed.x - pushed.x).toBeLessThan(30);
  });

  it('are not left of a hull with hardly any armor left, which falls apart into scrap instead', () => {
    const { combat } = createBattle();
    const shooter = combat.spawnTank({ x: -200, y: 0, rotation: 0 }, { color: 0xff0000 });
    const target = combat.spawnTank({ x: 0, y: 0, rotation: 0 }, { color: 0x0000ff });

    // Everything ahead of the core is shot away.
    carve(combat.armorOf(target)!, { x: 8, y: 0 }, 17, 0, 1);
    blowUp(combat, shooter, target);
    settle(combat);

    expect(combat.armorOf(target)).toBeUndefined();
    expect(combat.wrecks.made).toBe(1);
    expect(combat.wrecks.list).toHaveLength(0);
  });

  it('block the ways of navigation where they stand, until they are gone', () => {
    const layout = { halfWidth: 400, halfHeight: 300 };
    const grid = createNavGrid(layout);
    const { combat } = createBattle({
      onWallsChanged: (bounds) =>
        updateNavGrid(grid, { minX: bounds.minX - 96, minY: bounds.minY - 96, maxX: bounds.maxX + 96, maxY: bounds.maxY + 96 }, (point) =>
          combat.obstacleDistance(point, 128)
        )
    });
    const shooter = combat.spawnTank({ x: -200, y: 0, rotation: 0 }, { color: 0xff0000 });
    const target = combat.spawnTank({ x: 40, y: 20, rotation: 0 }, { color: 0x0000ff });

    expect(isOpenAt(grid, { x: 40, y: 20 })).toBe(true);

    blowUp(combat, shooter, target);
    const [wreck] = combat.wrecks.list;

    expect(isOpenAt(grid, wreck)).toBe(false);
    expect(grid.revision).toBeGreaterThan(0);

    combat.wrecks.take(wreck.id);

    expect(isOpenAt(grid, wreck)).toBe(true);
  });
});

describe('wrecks of the classes', () => {
  it('keep the size of their class: a Heavy leaves a big wreck and its gatling turret, a Scout a small one', () => {
    const left = TANK_CLASS_IDS.map((id) => {
      const { combat } = createBattle();
      const shooter = combat.spawnTank({ x: -200, y: 0, rotation: 0 }, { color: 0xff0000 });
      const target = spawnClass(combat, id, { x: 0, y: 0, rotation: 0 });
      blowUp(combat, shooter, target, TANK_CLASSES[id].hull.core);
      settle(combat);
      const [wreck] = combat.wrecks.list;
      const metal = combat.scrap.near(wreck, 150).filter((piece) => piece.material === 'metal');
      return { id, wreck, scrap: metal.reduce((total, piece) => total + piece.area, 0) };
    });
    const of = (id: string) => left.find((entry) => entry.id === id)!;

    expect(left.every((entry) => entry.wreck !== undefined)).toBe(true);
    expect(of('heavy').wreck.area).toBeGreaterThan(of('soldier').wreck.area * 1.3);
    expect(of('soldier').wreck.area).toBeGreaterThan(of('scout').wreck.area * 1.3);
    // The turret blown off lies as scrap: the Heavy's broad gatling turret outweighs the Scout's small twin one.
    expect(of('heavy').scrap).toBeGreaterThan(of('scout').scrap * 1.5);
  });

  it('crumble under blasts and rockets as under shells, and what the blasts knock off lands as scrap', () => {
    const { combat } = createBattle();
    const shooter = combat.spawnTank({ x: -260, y: 0, rotation: 0 }, { color: 0xff0000 });
    const target = combat.spawnTank({ x: 0, y: 0, rotation: 0 }, { color: 0x0000ff });
    blowUp(combat, shooter, target);
    settle(combat);
    const [wreck] = combat.wrecks.list;
    const scrap = combat.scrap.pieces.length;

    // A rocket's blast beside the wreck, missing it, chips the face toward it.
    combat.blast({ x: wreck.x, y: wreck.y - 26 }, MEDIUM_TANK.shell.blast!, shooter);
    combat.step(1 / 60);

    expect(combat.wrecks.list[0].area).toBeLessThan(wreck.area - 20);

    let rockets = 0;

    while (combat.wrecks.list.length > 0 && rockets < 12) {
      fireAt(combat, shooter, { x: wreck.x, y: wreck.y + [0, 7, -7][rockets % 3] }, { shell: MEDIUM_TANK.shell });
      rockets++;
    }

    settle(combat);

    // A medium tank's wreck takes about five rockets, against seven of the old shells.
    expect(combat.wrecks.list).toHaveLength(0);
    expect(rockets).toBeLessThanOrEqual(7);
    expect(combat.scrap.pieces.length).toBeGreaterThanOrEqual(scrap + 3);
    expect(combat.scrap.near(wreck, 120).every((piece) => piece.material === 'metal')).toBe(true);
  });

  it('turn a grenade rolling into them back, as walls do, but not one thrown high over them', () => {
    const grenade = TANK_CLASSES.demoman.shell;
    const ends = (reach: number, wreckThere: boolean) => {
      const { combat } = createBattle();
      const shooter = combat.spawnTank({ x: -150, y: 100, rotation: 0 }, { color: 0xff0000, team: 'red' });

      if (wreckThere) {
        const target = combat.spawnTank({ x: 0, y: 0, rotation: Math.PI / 2 }, { color: 0x0000ff, team: 'blue' });
        blowUp(combat, shooter, target);
        settle(combat);
      }

      shooter.hull.setTranslation({ x: -150, y: 0 }, true);
      shooter.pull.setTranslation({ x: -135, y: 0 }, true);
      combat.step(1 / 60);
      shooter.turretAngle = 0;
      combat.fire(shooter, { shell: grenade, reach });
      let last = { x: 0, y: 0 };
      let turned = false;

      for (let step = 0; step < 120 && (step === 0 || combat.shells.length > 0); step++) {
        combat.step(1 / 60);
        const shell = combat.shells.find((candidate) => candidate.lobbed);

        if (shell) {
          last = { x: shell.x, y: shell.y };
          turned ||= shell.direction.x < 0;
        }
      }

      return { last, turned };
    };
    const low = ends(70, true);
    const open = ends(70, false);
    const high = ends(420, true);

    // Thrown short, it rolls into the wreck, bounces back off it and goes off on the near side.
    expect(low.turned).toBe(true);
    expect(low.last.x).toBeLessThan(-15);
    // Without the wreck it rolls on past where the wreck stood.
    expect(open.turned).toBe(false);
    expect(open.last.x).toBeGreaterThan(20);
    // Thrown far, it flies high over the wreck and lands well beyond it.
    expect(high.turned).toBe(false);
    expect(high.last.x).toBeGreaterThan(150);
  });

  it('let a fully charged round through where they are thin, and stop it where they are thick', () => {
    const sniper = TANK_CLASSES.sniper;
    const full = { ...chargedShell(sniper.shell, sniper.weapon.kind === 'charge' ? sniper.weapon.full : sniper.shell, 1), range: 600 };
    const through = (id: TankClassId, rotation: number, line: number) => {
      const paths: { x: number; y: number }[][] = [];
      const { combat } = createBattle({ onShot: (_, path) => paths.push([...path]) });
      const shooter = combat.spawnTank({ x: -200, y: 120, rotation: 0 }, { color: 0xff0000 });
      const target = spawnClass(combat, id, { x: 0, y: 0, rotation });
      blowUp(combat, shooter, target, TANK_CLASSES[id].hull.core);
      settle(combat);
      shooter.hull.setTranslation({ x: -200, y: line }, true);
      shooter.pull.setTranslation({ x: -185, y: line }, true);
      combat.step(1 / 60);
      paths.length = 0;
      fireAt(combat, shooter, { x: 0, y: line }, { shell: full });
      return paths[0].at(-1)!.x;
    };

    // A Scout's wreck side on is 20 px of armor: the round bores through and flies on.
    expect(through('scout', Math.PI / 2, 5)).toBeGreaterThan(200);
    // A Heavy's wreck lengthwise is 48 px: the round stops in it.
    expect(through('heavy', 0, 8)).toBeLessThan(25);
  });

  it("give way to a heavy tank's ram more than to a light one's, and a heavy wreck less than a light one", () => {
    const shove = (rammer: TankClassId, wreckOf: TankClassId) => {
      const { combat } = createBattle({}, { halfWidth: 600 });
      const shooter = combat.spawnTank({ x: -300, y: 200, rotation: 0 }, { color: 0xff0000 });
      const target = spawnClass(combat, wreckOf, { x: 0, y: 0, rotation: Math.PI / 2 });
      blowUp(combat, shooter, target, TANK_CLASSES[wreckOf].hull.core);
      settle(combat);
      const before = combat.wrecks.list[0];
      const tank = spawnClass(combat, rammer, { x: -200, y: 0, rotation: 0 });

      for (let step = 0; step < 90; step++) {
        combat.drive(tank, { x: 1, y: 0 });
        combat.step(1 / 60);
      }

      return combat.wrecks.list[0].x - before.x;
    };

    const heavy = shove('heavy', 'soldier');
    const soldier = shove('soldier', 'soldier');
    const scout = shove('scout', 'soldier');

    expect(heavy).toBeGreaterThan(soldier + 5);
    expect(soldier).toBeGreaterThan(3);
    expect(scout).toBeLessThan(0.5);
    expect(shove('heavy', 'heavy')).toBeLessThan(heavy * 0.8);
  });
});

describe('scrap', () => {
  it('lands where pieces of armor and turrets fell and stays, listed with its material and area, until taken', () => {
    const { combat } = createBattle();
    const shooter = combat.spawnTank({ x: -200, y: 0, rotation: 0 }, { color: 0xff0000 });
    const target = combat.spawnTank({ x: 0, y: 0, rotation: 0 }, { color: 0x0000ff });

    blowUp(combat, shooter, target);
    settle(combat);
    const pieces = [...combat.scrap.pieces];

    // The turret and a wedge or two of the hull, thrown off by the blast.
    expect(pieces.length).toBeGreaterThanOrEqual(2);
    expect(pieces.every((piece) => piece.material === 'metal' && piece.area > 0)).toBe(true);
    expect(pieces.some((piece) => piece.area > 400)).toBe(true);
    expect(combat.scrap.flying).toBe(0);
    expect(combat.scrap.chunks).toBeGreaterThan(0);

    // Pieces stay put for as long as nobody takes them.
    for (let step = 0; step < 600; step++) {
      combat.update(1 / 60);
    }

    expect(combat.scrap.pieces.map((piece) => piece.id)).toEqual(pieces.map((piece) => piece.id));

    const nearest = combat.scrap.near({ x: 0, y: 0 }, 400)[0];
    const taken = combat.scrap.take(nearest.id);

    expect(taken?.area).toBe(nearest.area);
    expect(combat.scrap.take(nearest.id)).toBeUndefined();
    expect(combat.scrap.pieces).toHaveLength(pieces.length - 1);

    combat.reset();

    expect(combat.scrap.pieces).toHaveLength(0);
    expect(combat.scrap.chunks).toBe(0);
  });
});

/**
 * Opens a hole from `target`'s rear onto its `core`, by default the medium tank's, and shoots the
 * core, which blows the target up. A target turned away from `shooter` is shot from behind: the
 * shooter is put there for the shot and back where it stood after.
 */
function blowUp(combat: ReturnType<typeof createCombat>, shooter: Tank, target: Tank, core = HULL_CORE) {
  carve(combat.armorOf(target)!, { x: core.x - 12, y: 0 }, 9, 0, 1);
  // Mending by a hair makes the battle refresh the tank's shape with the next step.
  combat.repair(target, 1e-9);
  combat.step(1 / 60);
  const angle = target.hull.rotation();
  const center = target.hull.translation();
  const stood = { ...shooter.hull.translation() };
  const behind = { x: center.x - Math.cos(angle) * 150, y: center.y - Math.sin(angle) * 150 };
  const turned = (stood.x - center.x) * Math.cos(angle) + (stood.y - center.y) * Math.sin(angle) > -100;

  if (turned) {
    place(shooter, behind);
  }

  fireAt(combat, shooter, { x: center.x + core.x * Math.cos(angle), y: center.y + core.x * Math.sin(angle) });

  if (turned) {
    place(shooter, stood);
  }
}

/** Puts a tank and its tow point at `spot`, at rest. */
function place(tank: Tank, spot: { x: number; y: number }) {
  tank.hull.setTranslation(spot, true);
  tank.hull.setLinvel({ x: 0, y: 0 }, true);
  tank.pull.setTranslation({ x: spot.x + 15, y: spot.y }, true);
}

/** Spawns a tank of class `id` with its hull, mass, look and speed. */
function spawnClass(combat: ReturnType<typeof createCombat>, id: TankClassId, placement: { x: number; y: number; rotation: number }) {
  const tankClass = TANK_CLASSES[id];
  return combat.spawnTank(placement, { color: 0x3355cc, pullSpeed: pullSpeedFor(tankClass.speed), hull: tankClass.hull, mass: tankClass.mass, look: tankClass.look });
}

/** Turns `shooter`'s turret onto `target`, fires a shell, the battle's or the shot's, and lets it land. */
function fireAt(combat: ReturnType<typeof createCombat>, shooter: Tank, target: { x: number; y: number }, shot: Shot = {}) {
  const at = shooter.hull.translation();
  shooter.turretAngle = Math.atan2(target.y - at.y, target.x - at.x);
  combat.fire(shooter, shot);

  for (let step = 0; step < 30; step++) {
    combat.drive(shooter, { x: 0, y: 0 });
    combat.step(1 / 60);
    combat.update(1 / 60);
  }
}

/** Lets everything flying come to rest. */
function settle(combat: ReturnType<typeof createCombat>) {
  for (let step = 0; step < 360; step++) {
    combat.step(1 / 60);
    combat.update(1 / 60);
  }
}

/** A battle with shells on a real Rapier world, seeded, with a renderer that only hands out field slots. */
function createBattle(options: Parameters<typeof createCombat>[4] = {}, layout: Partial<CombatLayout> = {}) {
  const world = new rapier.World({ x: 0, y: 0 });
  world.lengthUnit = 100;
  const slots = Array.from({ length: 256 }, (_, index) => 255 - index);
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
  let state = 3;
  const random = () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
  const combat = createCombat(
    rapier,
    world,
    renderer as unknown as ReturnType<typeof createRangeRenderer>,
    { halfWidth: 400, halfHeight: 300, ...layout },
    { shell, random, ...options }
  );

  return { combat };
}
