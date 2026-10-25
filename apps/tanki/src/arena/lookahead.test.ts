import { describe, expect, it } from 'vitest';
import { createScope } from '../koth/classes/scope';
import { aimAngle } from './aim';
import type { Tank } from './bodies';
import { createCamera, screenToWorld, worldToScreen, zoomCamera } from './camera';
import type { Aim } from './input';
import { createLookAhead } from './lookahead';

type Point = { x: number; y: number };

const screen = { width: 1440, height: 900 };
const center = { x: screen.width / 2, y: screen.height / 2 };
const FRAME = 1 / 60;
const SHARE = 0.45;
/** A Sniper's gun pivot, off the hull's center, so a hull turning in place moves it. */
const MOUNT = { x: 6, y: 2.5 };

describe('the look-ahead camera', () => {
  it('keeps the gun on the aim of a still cursor while the view settles, the tank turns in place and the view zooms', () => {
    const scene = createScene({ x: 300, y: -120 });
    // The cursor sweeps across the screen in a tenth of a second and stops, the view far from settled.
    scene.sweep({ x: 1300, y: 160 }, { x: 260, y: 760 }, 6);
    const held = scene.frame();
    let drift = 0;
    let across = 0;
    let slid = 0;

    for (let frame = 0; frame < 150; frame++) {
      // The hull turns on the spot at a casemate's 2.4 rad/s; a wheel notch zooms out halfway through.
      scene.hull.rotation += 2.4 * FRAME;

      if (frame === 75) {
        zoomCamera(scene.camera, Math.exp(-100 / 500));
      }

      const now = scene.frame();
      drift = Math.max(drift, Math.abs(angleBetween(now.angle, held.angle)));
      across = Math.max(across, distanceFromLine(now.aimed, now.pivot, now.angle));
      slid = Math.max(slid, Math.hypot(now.aimed.x - held.aimed.x, now.aimed.y - held.aimed.y));
    }

    expect((drift * 180) / Math.PI).toBeLessThan(0.2);
    // The ground under the cursor did move, but only along the gun's line.
    expect(slid).toBeGreaterThan(50);
    expect(across).toBeLessThan(0.01);
  });

  it("keeps the gun's aim while a tank drives and turns under a still cursor", () => {
    const scene = createScene({ x: 0, y: 0 });
    scene.sweep({ x: 900, y: 450 }, { x: 1180, y: 250 }, 4);
    const held = scene.frame();
    let drift = 0;

    for (let frame = 0; frame < 120; frame++) {
      scene.hull.rotation += 1.5 * FRAME;
      scene.hull.x += Math.cos(scene.hull.rotation) * 250 * FRAME;
      scene.hull.y += Math.sin(scene.hull.rotation) * 250 * FRAME;
      drift = Math.max(drift, Math.abs(angleBetween(scene.frame().angle, held.angle)));
    }

    expect((drift * 180) / Math.PI).toBeLessThan(0.2);
  });

  it("keeps the gun's aim through the Sniper's scope, whether it zooms about the cursor or the tank", () => {
    for (const anchor of ['cursor', 'tank'] as const) {
      const scene = createScene({ x: -200, y: 80 });
      const scope = createScope();
      const cursor = { x: 1290, y: 300 };
      scene.sweep(center, cursor, 5);
      const held = scene.frame();
      let drift = 0;
      let widest = scene.camera.zoom;

      // A full charge of 2.5 s, the shot and 1.5 s for the view to close.
      for (let frame = 0; frame < 240; frame++) {
        drift = Math.max(
          drift,
          Math.abs(
            angleBetween(
              scene.frame((camera) => scope.step(camera, screen, anchor === 'cursor' ? cursor : worldToScreen(camera, scene.pivot(), screen), frame < 150, FRAME)).angle,
              held.angle
            )
          )
        );
        widest = Math.min(widest, scene.camera.zoom);
      }

      expect((drift * 180) / Math.PI).toBeLessThan(0.2);
      expect(widest).toBeCloseTo(1.6 * 0.65, 2);
    }
  });

  it('leads by its share of the cursor’s offset from the screen’s center once settled', () => {
    const scene = createScene({ x: 40, y: 40 });
    const cursor = { x: 1240, y: 650 };
    scene.sweep(center, cursor, 10);

    for (let frame = 0; frame < 120; frame++) {
      scene.frame();
    }

    const tank = worldToScreen(scene.camera, scene.pivot(), screen);
    expect(tank.x).toBeCloseTo(center.x - SHARE * (cursor.x - center.x), 3);
    expect(tank.y).toBeCloseTo(center.y - SHARE * (cursor.y - center.y), 3);
  });

  it('keeps the tank on the screen however far the cursor goes', () => {
    for (const size of [screen, { width: 390, height: 844 }, { width: 2560, height: 1080 }]) {
      for (const cursor of [
        { x: 9000, y: -4000 },
        { x: -300, y: size.height + 2000 },
        { x: size.width, y: 0 }
      ]) {
        const scene = createScene({ x: 0, y: 0 }, { share: 0.8, size });

        for (let frame = 0; frame < 120; frame++) {
          scene.frame(undefined, { kind: 'point', ...cursor });
        }

        const tank = worldToScreen(scene.camera, scene.pivot(), size);
        const margin = Math.min(110, Math.min(size.width, size.height) * 0.2);
        expect(tank.x).toBeGreaterThanOrEqual(margin - 1e-6);
        expect(tank.x).toBeLessThanOrEqual(size.width - margin + 1e-6);
        expect(tank.y).toBeGreaterThanOrEqual(margin - 1e-6);
        expect(tank.y).toBeLessThanOrEqual(size.height - margin + 1e-6);
      }
    }
  });

  it('leads along a stick’s direction, which the camera never turns', () => {
    const scene = createScene({ x: 10, y: -30 });
    const stick: Aim = { kind: 'direction', angle: 2.2 };
    let drift = 0;

    for (let frame = 0; frame < 90; frame++) {
      const now = scene.frame(undefined, stick);
      drift = Math.max(drift, Math.abs(angleBetween(now.angle, stick.angle - scene.camera.rotation)));
    }

    const tank = worldToScreen(scene.camera, scene.pivot(), screen);
    const lead = { x: center.x - tank.x, y: center.y - tank.y };
    expect(drift).toBeLessThan(1e-9);
    expect(Math.atan2(lead.y, lead.x)).toBeCloseTo(2.2, 3);
    expect(Math.hypot(lead.x, lead.y)).toBeGreaterThan(100);
  });

  it('moves the view no faster than the cursor when the cursor crosses the screen’s center', () => {
    const scene = createScene({ x: 0, y: 0 });
    scene.sweep(center, { x: 1400, y: 470 }, 4);

    for (let frame = 0; frame < 60; frame++) {
      scene.frame();
    }

    let last = worldToScreen(scene.camera, scene.pivot(), screen);
    let fastest = 0;
    const from = { x: 1400, y: 470 };
    const to = { x: 40, y: 440 };

    // Across the whole screen in a quarter of a second, a few pixels off the center.
    for (let frame = 1; frame <= 15; frame++) {
      const share = frame / 15;
      scene.frame(undefined, { kind: 'point', x: from.x + (to.x - from.x) * share, y: from.y + (to.y - from.y) * share });
      const tank = worldToScreen(scene.camera, scene.pivot(), screen);
      fastest = Math.max(fastest, Math.hypot(tank.x - last.x, tank.y - last.y));
      last = tank;
    }

    const cursorStep = Math.hypot(to.x - from.x, to.y - from.y) / 15;
    expect(fastest).toBeLessThan(cursorStep);
  });
});

/**
 * A tank under the look-ahead camera, framed as the route frames it: the view is put on the tank
 * for the cursor before aiming, the gun aims at the ground under the cursor, then the view eases
 * with the frame's time. The hull turns about its center; the gun turns at `MOUNT` off it.
 */
function createScene(start: Point, options: { share?: number; size?: { width: number; height: number } } = {}) {
  const size = options.size ?? screen;
  const share = options.share ?? SHARE;
  const camera = { ...createCamera(start), zoom: 1.6, rotation: 0.3 };
  const lookAhead = createLookAhead();
  const hull = { ...start, rotation: 0 };
  let cursor: Aim = { kind: 'point', x: size.width / 2, y: size.height / 2 };
  const pivot = () => ({
    x: hull.x + MOUNT.x * Math.cos(hull.rotation) - MOUNT.y * Math.sin(hull.rotation),
    y: hull.y + MOUNT.x * Math.sin(hull.rotation) + MOUNT.y * Math.cos(hull.rotation)
  });

  return {
    camera,
    hull,
    pivot,

    /**
     * One frame with the cursor at `aim`, or where it was: places the view, aims, and eases the
     * view after `between`, such as a scope zooming, has had its turn.
     */
    frame(between?: (view: typeof camera) => void, aim?: Aim) {
      cursor = aim ?? cursor;
      lookAhead.place(camera, size, pivot(), cursor, { share, dt: 0 });
      const from = pivot();
      const angle = aimAngle(undefined as unknown as Tank, cursor, camera, size, from)!;
      const aimed = cursor.kind === 'point' ? screenToWorld(camera, cursor, size) : from;
      between?.(camera);
      lookAhead.place(camera, size, pivot(), cursor, { share, dt: FRAME });
      return { angle, aimed, pivot: from };
    },

    /** Moves the cursor from `from` to `to` in a straight line over `frames` frames. */
    sweep(from: Point, to: Point, frames: number) {
      for (let frame = 0; frame <= frames; frame++) {
        this.frame(undefined, { kind: 'point', x: from.x + ((to.x - from.x) * frame) / frames, y: from.y + ((to.y - from.y) * frame) / frames });
      }
    }
  };
}

function angleBetween(a: number, b: number) {
  return Math.atan2(Math.sin(a - b), Math.cos(a - b));
}

/** Distance of `point` from the line through `through` along `angle`. */
function distanceFromLine(point: Point, through: Point, angle: number) {
  return Math.abs((point.x - through.x) * Math.sin(angle) - (point.y - through.y) * Math.cos(angle));
}
