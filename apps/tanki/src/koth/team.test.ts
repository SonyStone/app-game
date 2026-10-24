import { beforeAll, describe, expect, it } from 'vitest';
import type { Tank } from '../arena/bodies';
import { createCombat, type CombatLayout, type ShellSpec } from '../damage/combat';
import { carve } from '../damage/field';
import type { createRangeRenderer } from '../damage/renderer';
import { HULL_CORE } from '../damage/shapes';
import type { Rapier } from '../physics/Rapier2D';
import { KOTH_MAP } from './map';
import { cellAt, createNavGrid, updateNavGrid } from './navigation';
import { createCaptureState, CAPTURE_RULES } from './rules';
import { MEDIUM_TANK } from './tanks';
import { createTeamBoard, type Member } from './team';

let rapier: Rapier;

beforeAll(async () => {
  rapier = (await import('@dimforge/rapier2d-simd/rapier.js')) as Rapier;
});

const shell: ShellSpec = { speed: 900, range: 700, hole: 4.5, depth: 3, knockback: 700 };

describe('team board', () => {
  it('counts rubble as cover from enemies afar, as shells do, but not from one right behind it', () => {
    // A brick building a tile thick and two tiles long; the shooter brings its upper tile down.
    const { combat, grid } = createBattle({ walls: [{ x: 0, y: 0, halfWidth: 30, halfHeight: 60, material: 'brick' }] });
    const shooter = combat.spawnTank({ x: -250, y: -30, rotation: 0 }, { color: 0, team: 'blue' });

    for (let shot = 0; shot < 60 && combat.walls.damage.collapsed === 0; shot++) {
      fireAt(combat, shooter, { x: 0, y: -30 + [0, 12, -12, 22, -22][shot % 5] });
    }

    const hiding = { x: 70, y: -30 };
    const afar = boardFor(combat, grid, shooter, hiding);

    expect(combat.walls.tiles.some((tile) => tile.rubble)).toBe(true);
    expect(combat.lineOfSight(shooter.hull.translation(), hiding)).toBe(false);
    expect(afar.danger(cellAt(grid, hiding))).toBe(0);
    expect(afar.canSee(shooter.hull.translation(), hiding)).toBe(false);

    // The same enemy right behind the rubble shoots over it.
    place(shooter, { x: -55, y: -30 });
    combat.step(1 / 60);
    const near = boardFor(combat, grid, shooter, hiding);

    expect(combat.lineOfSight(shooter.hull.translation(), hiding)).toBe(true);
    expect(near.danger(cellAt(grid, hiding))).toBeGreaterThan(0);
    expect(near.canSee(shooter.hull.translation(), hiding)).toBe(true);
  });

  it('counts a wreck as cover, and as something to hide behind', () => {
    // On a row of grid cell centers: a wreck's shadow is about as wide as a hull.
    const { combat, grid } = createBattle();
    const shooter = combat.spawnTank({ x: -250, y: -10, rotation: 0 }, { color: 0, team: 'blue' });
    const victim = combat.spawnTank({ x: 0, y: -10, rotation: 0 }, { color: 0, team: 'red' });
    const hiding = { x: 50, y: -10 };

    expect(boardFor(combat, grid, shooter, hiding).danger(cellAt(grid, hiding))).toBeGreaterThan(0);

    carve(combat.armorOf(victim)!, { x: HULL_CORE.x - 12, y: 0 }, 9, 0, 1);
    combat.repair(victim, 1e-9);
    combat.step(1 / 60);
    fireAt(combat, shooter, { x: HULL_CORE.x, y: -10 });
    const board = boardFor(combat, grid, shooter, hiding);

    expect(combat.wrecks.list).toHaveLength(1);
    expect(combat.lineOfSight(shooter.hull.translation(), hiding)).toBe(false);
    expect(board.danger(cellAt(grid, hiding))).toBe(0);
    expect(board.sightField[cellAt(grid, hiding)]).toBeLessThan(40);
  });
});

/**
 * The board of red, with one member, after it saw `enemy`: its danger map and sight checks are
 * up to date with the walls and wrecks.
 */
function boardFor(combat: ReturnType<typeof createCombat>, grid: ReturnType<typeof createNavGrid>, enemy: Tank, member: { x: number; y: number }) {
  const red: Member = { ...seat('red', 0), tank: undefined };
  const blue: Member = { ...seat('blue', 1), tank: enemy };
  const board = createTeamBoard('red', [red], {
    combat,
    grid,
    map: { ...KOTH_MAP, halfWidth: 400, halfHeight: 300 },
    rivals: [blue],
    clock: () => 0,
    capture: () => createCaptureState(CAPTURE_RULES),
    holdTime: CAPTURE_RULES.holdTime
  });

  board.see(enemy);
  board.update();
  expect(Number.isFinite(member.x)).toBe(true);
  return board;
}

function seat(team: 'red' | 'blue', id: number): Omit<Member, 'tank'> {
  return {
    id,
    team,
    index: 0,
    name: team,
    human: false,
    tankClass: MEDIUM_TANK,
    nextClass: undefined,
    weapon: undefined,
    trigger: { fire: false },
    pivot: undefined,
    role: 'assault',
    respawnAt: undefined,
    shotAt: -Infinity,
    attacker: undefined,
    kills: 0,
    deaths: 0
  };
}

function place(tank: Tank, spot: { x: number; y: number }) {
  tank.hull.setTranslation(spot, true);
  tank.pull.setTranslation({ x: spot.x + 15, y: spot.y }, true);
  tank.hull.setLinvel({ x: 0, y: 0 }, true);
}

/** Turns `shooter`'s turret onto `target`, fires a shell and lets it land. */
function fireAt(combat: ReturnType<typeof createCombat>, shooter: Tank, target: { x: number; y: number }) {
  const at = shooter.hull.translation();
  shooter.turretAngle = Math.atan2(target.y - at.y, target.x - at.x);
  combat.fire(shooter);

  for (let step = 0; step < 30; step++) {
    combat.drive(shooter, { x: 0, y: 0 });
    combat.step(1 / 60);
    combat.update(1 / 60);
  }
}

/** A battle with shells, seeded, whose navigation grid follows the walls and wrecks as they change. */
function createBattle(layout: Partial<CombatLayout> = {}) {
  const world = new rapier.World({ x: 0, y: 0 });
  world.lengthUnit = 100;
  const slots = Array.from({ length: 128 }, (_, index) => 127 - index);
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
  let state = 7;
  const random = () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
  const full = { halfWidth: 400, halfHeight: 300, ...layout };
  const grid = createNavGrid(full);
  const combat: ReturnType<typeof createCombat> = createCombat(rapier, world, renderer as unknown as ReturnType<typeof createRangeRenderer>, full, {
    shell,
    random,
    onWallsChanged: (bounds) =>
      updateNavGrid(
        grid,
        { minX: bounds.minX - 96, minY: bounds.minY - 96, maxX: bounds.maxX + 96, maxY: bounds.maxY + 96 },
        (point) => combat.obstacleDistance(point, 128),
        bounds
      )
  });

  return { combat, grid };
}
