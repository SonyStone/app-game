import { describe, expect, it } from 'vitest';
import { TANK_CLASS_IDS } from '../tanks';
import { TANK_CLASSES } from './classes';
import { chargedShell, createWeapon, FULL_CHARGE, type Trigger } from './weapon';

describe('the weapons of the classes', () => {
  it('fire at a steady cadence for as long as the trigger is held, with no clip and no reload', () => {
    for (const id of TANK_CLASS_IDS.filter((id) => TANK_CLASSES[id].weapon.kind !== 'charge')) {
      const tankClass = TANK_CLASSES[id];
      const weapon = createWeapon(tankClass, () => 0.5);
      const fired = hold(weapon, { fire: true, reach: 300 }, 12);
      const gaps = fired.slice(1).map((time, index) => time - fired[index]);

      expect(fired[0]).toBe(0);
      expect(Math.max(...gaps)).toBeCloseTo(tankClass.interval, 5);
      expect(Math.min(...gaps)).toBeCloseTo(tankClass.interval, 5);
    }
  });

  it('fire a volley of pellets fanned out at once from a Scout', () => {
    const weapon = createWeapon(TANK_CLASSES.scout, () => 0.5);
    const [shot] = weapon.step(1 / 60, { fire: true });
    const volley = shot.volley!;
    const spread = TANK_CLASSES.scout.weapon.kind === 'volley' ? TANK_CLASSES.scout.weapon.spread : NaN;

    expect(volley).toHaveLength(4);
    expect(Math.max(...volley) - Math.min(...volley)).toBeCloseTo(spread, 2);
  });

  it("fire a Heavy's gatling the moment the trigger is pulled, slowing the tank while it spins", () => {
    const tankClass = TANK_CLASSES.heavy;
    const weapon = createWeapon(tankClass, Math.random);
    const slowdown = tankClass.weapon.kind === 'spin' ? tankClass.weapon.slowdown : NaN;
    const fired = hold(weapon, { fire: true }, 1);

    expect(fired[0]).toBe(0);
    expect(fired.length).toBe(Math.round(1 / tankClass.interval));
    expect(weapon.speedShare).toBeCloseTo(slowdown);

    hold(weapon, { fire: false }, 1);

    expect(weapon.spin).toBe(0);
    expect(weapon.speedShare).toBe(1);
  });

  it('charge a Sniper shot while the trigger is held and fire it when let go, a rail growing in power and in how near the core it kills', () => {
    const tankClass = TANK_CLASSES.sniper;
    const weapon = createWeapon(tankClass, Math.random);
    const spec = tankClass.weapon.kind === 'charge' ? tankClass.weapon : undefined;

    hold(weapon, { fire: true }, 0.5);

    expect(weapon.charge).toBeCloseTo(0.5 / spec!.time, 1);
    expect(weapon.speedShare).toBeCloseTo(spec!.slowdown);

    const [early] = weapon.step(1 / 60, { fire: false });

    expect(early.shell!.rail!.power).toBeLessThan(15);
    expect(early.shell!.speed).toBe(Infinity);

    hold(weapon, { fire: true }, spec!.time + tankClass.interval + 0.1);

    expect(weapon.charge).toBe(1);

    const [full] = weapon.step(1 / 60, { fire: false });

    expect(full.shell!.rail).toEqual(spec!.full.rail);
    expect(full.shell!.rail!.graze).toBeGreaterThan(early.shell!.rail!.graze!);
    expect(full.shell!.range).toBe(spec!.full.range);
  });

  it("start a Sniper's next charge once the interval since its last shot has passed, with nothing to reload", () => {
    const tankClass = TANK_CLASSES.sniper;
    const weapon = createWeapon(tankClass, Math.random);

    hold(weapon, { fire: true }, 0.2);
    weapon.step(1 / 60, { fire: false });
    hold(weapon, { fire: true }, tankClass.interval - 0.05);

    expect(weapon.charge).toBeUndefined();

    hold(weapon, { fire: true }, 0.1);

    expect(weapon.charge).toBeGreaterThan(0);
  });

  it('drop a charge unfired when told to', () => {
    const weapon = createWeapon(TANK_CLASSES.sniper, Math.random);
    hold(weapon, { fire: true }, 1);

    expect(weapon.step(1 / 60, { fire: false, cancel: true })).toHaveLength(0);
    expect(weapon.charge).toBeUndefined();
    expect(weapon.ready).toBe(true);
  });

  it('throw a Demoman grenade as far as the trigger asks', () => {
    const weapon = createWeapon(TANK_CLASSES.demoman, Math.random);
    const [shot] = weapon.step(1 / 60, { fire: true, reach: 333 });

    expect(shot.reach).toBe(333);
    expect(shot.shell!.lob).toBeDefined();
  });
});

describe('a charged shell', () => {
  it("grows from the empty shell to the full one, a rail's power and graze with it, full from a full charge on", () => {
    const { shell, weapon } = TANK_CLASSES.sniper;
    const full = weapon.kind === 'charge' ? weapon.full : shell;

    expect(chargedShell(shell, full, 0).hole).toBe(shell.hole);
    expect(chargedShell(shell, full, 0.5).depth).toBeCloseTo((shell.depth + full.depth) / 2);
    expect(chargedShell(shell, full, 0.5).rail!.power).toBeCloseTo((shell.rail!.power + full.rail!.power) / 2);
    expect(chargedShell(shell, full, 0.5).rail!.graze).toBeCloseTo((shell.rail!.slit / 2 + full.rail!.graze!) / 2);
    expect(chargedShell(shell, full, 0.5).speed).toBe(Infinity);
    expect(chargedShell(shell, full, FULL_CHARGE - 0.01).rail!.power).toBeLessThan(full.rail!.power);
    expect(chargedShell(shell, full, FULL_CHARGE).rail).toEqual(full.rail);
  });
});

/** Steps `weapon` for `seconds` with `trigger`, returning the times it fired at, from the start. */
function hold(weapon: ReturnType<typeof createWeapon>, trigger: Trigger, seconds: number) {
  const times: number[] = [];

  for (let step = 0; step < Math.round(seconds * 60); step++) {
    if (weapon.step(1 / 60, trigger).length > 0) {
      times.push(step / 60);
    }
  }

  return times;
}
