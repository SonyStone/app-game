import { describe, expect, it } from 'vitest';
import { createLegs, type Carrier } from './legs';
import { BUILDS } from './spider';
import { GAITS } from './variants';

const STEP = 1 / 60;
const flat = (point: { x: number; y: number }) => ({ point, height: 0 });

describe('spider legs', () => {
  for (const gait of GAITS) {
    it(`${gait}: planted feet stay exactly put and no leg stretches past its reach while running and turning`, () => {
      const spec = BUILDS[gait].legs;
      const body = { x: 0, y: 0, z: BUILDS[gait].height, angle: 0, vx: 0, vy: 0 };
      const legs = createLegs(spec, body, flat);
      let previous = legs.feet.map((foot) => ({ ...foot.position, planted: !foot.step }));
      let worstSlip = 0;
      let worstReach = 0;
      let steps = 0;

      for (let frame = 0; frame < 300; frame++) {
        // Speed up to full speed, run, swerve into a turn, then stop.
        const speed = frame < 240 ? Math.min(frame * 8, BUILDS[gait].speed) : 0;
        body.angle += frame > 90 && frame < 180 ? 2.5 * STEP : 0;
        body.vx = Math.cos(body.angle) * speed;
        body.vy = Math.sin(body.angle) * speed;
        body.x += body.vx * STEP;
        body.y += body.vy * STEP;
        legs.update(STEP, body);

        for (const [index, foot] of legs.feet.entries()) {
          const before = previous[index];

          if (before.planted && !foot.step) {
            worstSlip = Math.max(worstSlip, Math.hypot(foot.position.x - before.x, foot.position.y - before.y));
          }

          steps += before.planted && foot.step ? 1 : 0;
          const hip = spec.hips[index];
          const hipX = body.x + hip.x * Math.cos(body.angle) - hip.y * Math.sin(body.angle);
          const hipY = body.y + hip.x * Math.sin(body.angle) + hip.y * Math.cos(body.angle);
          worstReach = Math.max(worstReach, Math.hypot(foot.position.x - hipX, foot.position.y - hipY, foot.position.z - body.z));
        }

        previous = legs.feet.map((foot) => ({ ...foot.position, planted: !foot.step }));
      }

      expect(worstSlip).toBe(0);
      expect(worstReach).toBeLessThan(spec.femur + spec.tibia);
      expect(steps).toBeGreaterThan(40);
    });
  }

  it('steps in diagonal pairs at a steady run', () => {
    const spec = BUILDS.low.legs;
    const body = { x: 0, y: 0, z: 4.5, angle: 0, vx: BUILDS.low.speed, vy: 0 };
    const legs = createLegs(spec, body, flat);
    const lifts: number[][] = [];

    for (let frame = 0; frame < 120; frame++) {
      const before = legs.feet.map((foot) => !foot.step);
      body.x += body.vx * STEP;
      legs.update(STEP, body);
      const lifted = legs.feet.flatMap((foot, index) => (before[index] && foot.step ? [index] : []));

      if (frame > 40 && lifted.length > 0) {
        lifts.push(lifted);
      }
    }

    expect(lifts.length).toBeGreaterThan(6);

    for (const lifted of lifts) {
      expect([
        [0, 3],
        [1, 2]
      ]).toContainEqual(lifted);
    }
  });

  it('settles every foot back onto its spot when the body stops', () => {
    const spec = BUILDS.low.legs;
    const body = { x: 0, y: 0, z: 4.5, angle: 0, vx: 120, vy: 0 };
    const legs = createLegs(spec, body, flat);

    for (let frame = 0; frame < 60; frame++) {
      body.x += body.vx * STEP;
      legs.update(STEP, body);
    }

    body.vx = 0;

    for (let frame = 0; frame < 90; frame++) {
      legs.update(STEP, body);
    }

    for (const [index, foot] of legs.feet.entries()) {
      const rest = spec.rest[index];
      expect(foot.step).toBeUndefined();
      expect(Math.hypot(foot.position.x - body.x - rest.x, foot.position.y - body.y - rest.y)).toBeLessThan(1.3);
    }
  });

  it('feet set on a moving carrier ride along with it without stepping while the body rides too', () => {
    const spec = BUILDS.low.legs;
    const deck = { x: 0, y: 0, angle: 0 };
    const carrier: Carrier = { translation: () => ({ x: deck.x, y: deck.y }), rotation: () => deck.angle };
    const body = { x: 0, y: 0, z: 10, angle: 0, vx: 0, vy: 0 };
    const legs = createLegs(spec, body, (point) => ({ point, height: 6, carrier }));

    for (let frame = 0; frame < 60; frame++) {
      deck.x += 2;
      deck.angle += 0.01;
      body.x = deck.x;
      body.angle = deck.angle;
      legs.update(STEP, body);
    }

    expect(legs.feet.every((foot) => !foot.step)).toBe(true);

    for (const [index, foot] of legs.feet.entries()) {
      const rest = spec.rest[index];
      const expectedX = deck.x + rest.x * Math.cos(deck.angle) - rest.y * Math.sin(deck.angle);
      expect(foot.position.x).toBeCloseTo(expectedX, 3);
      expect(foot.position.z).toBe(6);
    }
  });
});
