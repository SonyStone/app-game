import { describe, expect, it } from 'vitest';
import { TANK_CLASSES } from './classes';
import { chargedShell, createWeapon, FULL_CHARGE, type Trigger } from './weapon';

describe('the weapons of the classes', () => {
  it('fire a volley of pellets fanned out at once from a Scout', () => {
    const weapon = createWeapon(TANK_CLASSES.scout, () => 0.5);
    const [shot] = weapon.step(1 / 60, { fire: true });
    const volley = shot.volley!;

    expect(volley).toHaveLength(4);
    expect(Math.max(...volley) - Math.min(...volley)).toBeCloseTo(0.16, 2);
    expect(weapon.rounds).toBe(5);
  });

  it('spin a gatling up for half a second before it fires ten rounds a second, slowing the Heavy meanwhile', () => {
    const weapon = createWeapon(TANK_CLASSES.heavy, Math.random);
    const fired = hold(weapon, { fire: true }, 1.5);

    expect(fired[0]).toBeGreaterThan(0.48);
    expect(fired[0]).toBeLessThan(0.55);
    expect(fired.length).toBeGreaterThan(9);
    expect(fired.length).toBeLessThan(12);
    expect(weapon.speedShare).toBeCloseTo(0.55);

    hold(weapon, { fire: false }, 1);

    expect(weapon.spin).toBe(0);
    expect(weapon.speedShare).toBe(1);
  });

  it('let a Heavy spin its gatling up without firing, so it fires at once', () => {
    const weapon = createWeapon(TANK_CLASSES.heavy, Math.random);

    expect(hold(weapon, { fire: false, rev: true }, 0.6)).toHaveLength(0);
    expect(hold(weapon, { fire: true }, 1 / 60)).toHaveLength(1);
  });

  it('charge a Sniper shot while the trigger is held and fire it when let go, stronger and piercing at full charge', () => {
    const weapon = createWeapon(TANK_CLASSES.sniper, Math.random);
    const time = TANK_CLASSES.sniper.weapon.kind === 'charge' ? TANK_CLASSES.sniper.weapon.time : NaN;

    hold(weapon, { fire: true }, 0.5);

    expect(weapon.charge).toBeCloseTo(0.5 / time, 1);
    expect(weapon.speedShare).toBeCloseTo(0.35);

    const [early] = weapon.step(1 / 60, { fire: false });

    expect(early.shell!.pierce).toBeUndefined();
    expect(early.shell!.speed).toBeLessThan(1800);

    hold(weapon, { fire: false }, 2.5);
    hold(weapon, { fire: true }, 3);

    expect(weapon.charge).toBe(1);

    const [full] = weapon.step(1 / 60, { fire: false });

    expect(full.shell!.pierce).toBeDefined();
    expect(full.shell!.range).toBe(1300);
  });

  it('drop a charge unfired when told to', () => {
    const weapon = createWeapon(TANK_CLASSES.sniper, Math.random);
    hold(weapon, { fire: true }, 1);

    expect(weapon.step(1 / 60, { fire: false, cancel: true })).toHaveLength(0);
    expect(weapon.charge).toBeUndefined();
    expect(weapon.rounds).toBe(1);
  });

  it('throw a Demoman grenade as far as the trigger asks', () => {
    const weapon = createWeapon(TANK_CLASSES.demoman, Math.random);
    const [shot] = weapon.step(1 / 60, { fire: true, reach: 333 });

    expect(shot.reach).toBe(333);
    expect(shot.shell!.lob).toBeDefined();
  });
});

describe('a charged shell', () => {
  it('grows from the empty shell to the full one, piercing only at full charge', () => {
    const { shell, weapon } = TANK_CLASSES.sniper;
    const full = weapon.kind === 'charge' ? weapon.full : shell;

    expect(chargedShell(shell, full, 0).hole).toBe(shell.hole);
    expect(chargedShell(shell, full, 0.5).depth).toBeCloseTo((shell.depth + full.depth) / 2);
    expect(chargedShell(shell, full, FULL_CHARGE - 0.01).pierce).toBeUndefined();
    expect(chargedShell(shell, full, FULL_CHARGE).pierce).toEqual(full.pierce);
  });
});

/** Steps `weapon` for `seconds` with `trigger`, returning the times it fired at, from the start. */
function hold(weapon: ReturnType<typeof createWeapon>, trigger: Trigger, seconds: number) {
  const times: number[] = [];

  for (let time = 0; time < seconds - 1e-9; time += 1 / 60) {
    if (weapon.step(1 / 60, trigger).length > 0) {
      times.push(time);
    }
  }

  return times;
}
