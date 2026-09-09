import { describe, expect, it } from 'vitest';
import { defaultCamera } from './camera';
import { createPaintNavigation as createNavigationPuck } from './paintNavigation';

/** Behavior ported from Grease Pencil, including held invocation and camera pivot invariants. */
describe('Paint navigation puck', () => {
  it('uses vertical incremental zoom around the viewport center, independent of puck position', () => {
    const { puck, camera } = setup();
    puck.open({ x: 150, y: 150 });
    puck.begin('zoom', pointer(170, 130));
    puck.move(pointer(230, 80));
    expect(camera().zoom).toBeCloseTo(1 / 0.9);
    expect(camera().x).toBe(0);
    expect(camera().y).toBe(0);
    puck.move(pointer(330, 80));
    expect(camera().zoom).toBeCloseTo(1 / 0.9);
  });
  it('converts an offset viewport from client coordinates without changing the zoom pivot', () => {
    let value = { ...defaultCamera(), x: 70, y: -20, angle: 0.4, mirrored: true };
    const puck = createNavigationPuck({
      size: () => ({ width: 800, height: 600 }),
      camera: () => value,
      navigate: (next) => {
        value = next;
      },
      viewport: () => ({ left: 100, top: 200, width: 800, height: 600 })
    });
    puck.open({ x: 250, y: 350 });
    puck.begin('zoom', { x: 270, y: 330, pointerId: 1 });
    puck.move({ x: 270, y: 280, pointerId: 1 });
    expect(value).toMatchObject({ angle: 0.4, mirrored: true });
    expect(value.x).toBeCloseTo(70);
    expect(value.y).toBeCloseTo(-20);
    expect(value.zoom).toBeCloseTo(1 / 0.9);
  });
  it('closes a one-shot action and ignores a second pointer', () => {
    const { puck, camera } = setup();
    puck.open();
    puck.begin('pan', pointer(300, 300));
    expect(puck.begin('zoom', { ...pointer(350, 300), pointerId: 2 })).toBe(false);
    puck.move({ ...pointer(450, 400), pointerId: 2 });
    puck.end(2);
    expect(camera().x).toBe(0);
    puck.move(pointer(320, 330));
    expect(camera()).toMatchObject({ x: -20, y: -30 });
    puck.end(1);
    expect(puck.center()).toBeUndefined();
  });
  it('reopens at the release point while Space is held', () => {
    const { puck } = setup();
    puck.open(undefined, 'held');
    puck.begin('pan', pointer(300, 300));
    puck.move(pointer(350, 340));
    puck.end(1);
    expect(puck.center()).toEqual({ x: 350, y: 340 });
    expect(puck.activeAction()).toBeUndefined();
    puck.releaseHotkey();
    expect(puck.center()).toBeUndefined();
  });
  it('keeps capture if Space is released before the first move', () => {
    const { puck, camera } = setup();
    puck.open(undefined, 'held');
    puck.begin('pan', pointer(300, 300));
    puck.releaseHotkey();
    expect(puck.activeAction()).toBe('pan');
    puck.move(pointer(320, 330));
    expect(camera().x).toBe(-20);
    puck.end(1);
    expect(puck.center()).toBeUndefined();
  });
  it('wraps rotation at pi, ignores the viewport center and snaps absolute angles', () => {
    const { puck, camera } = setup();
    puck.open({ x: 150, y: 150 });
    puck.begin('rotate', pointer(300, 301));
    puck.move(pointer(300, 299));
    expect(camera().angle).toBeCloseTo(0.02, 3);
    puck.move(pointer(400, 300));
    puck.move(pointer(500, 300));
    expect(camera().angle).toBeCloseTo(0.02, 3);
    puck.move({ ...pointer(400 + 100 * Math.cos(0.36), 300 + 100 * Math.sin(0.36)), shiftKey: true });
    expect(camera().angle / (Math.PI / 12)).toBeCloseTo(1);
    expect(camera()).toMatchObject({ x: 0, y: 0 });
  });
  it('cancels without reopening or accepting stale movement', () => {
    const { puck, camera } = setup();
    puck.open(undefined, 'held');
    puck.begin('pan', pointer(300, 300));
    puck.cancel(2);
    expect(puck.activeAction()).toBe('pan');
    puck.cancel(1);
    puck.open();
    puck.move(pointer(500, 500));
    expect(camera().x).toBe(0);
    expect(puck.activeAction()).toBeUndefined();
  });
  it('selects the pictured zones after 30px travel and protects the center', () => {
    const { puck } = setup();
    const origin = { x: 400, y: 300 };
    puck.open(origin);
    expect(puck.actionAt({ x: 420, y: 300 }, origin)).toBeUndefined();
    expect(puck.actionAt({ x: 440, y: 280 }, origin)).toBe('pan');
    expect(puck.actionAt({ x: 400, y: 350 }, origin)).toBe('zoom');
    expect(puck.actionAt({ x: 300, y: 300 }, origin)).toBe('rotate');
    expect(puck.actionAt({ x: 600, y: 300 }, origin)).toBeUndefined();
  });
  it('reclamps an open puck when the viewport shrinks', () => {
    let size = { width: 800, height: 600 };
    const puck = createNavigationPuck({ size: () => size, camera: defaultCamera, navigate: () => {} });
    puck.open({ x: 750, y: 500 });
    size = { width: 320, height: 568 };
    expect(puck.center()).toEqual({ x: 182, y: 430 });
  });
});
function setup() {
  let camera = defaultCamera();
  const puck = createNavigationPuck({
    size: () => ({ width: 800, height: 600 }),
    camera: () => camera,
    navigate: (next) => {
      camera = next;
    }
  });
  return { puck, camera: () => camera };
}
function pointer(x: number, y: number) {
  return { x, y, pointerId: 1 };
}
