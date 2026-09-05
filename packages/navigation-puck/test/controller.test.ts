import { createSignal } from 'solid-js';
import { describe, expect, it, vi } from 'vitest';
import { createNavigationPuck } from '../src/controller';
type ViewportMode = '2d' | '3d';

describe('navigation puck', () => {
  it('clamps its full hit area inside a small, offset viewport', () => {
    const { puck } = setup();
    puck.open({ x: -50, y: 900 });
    expect(puck.center()).toEqual({ x: 158, y: 532 });
    puck.open({ x: 999, y: -5 });
    expect(puck.center()).toEqual({ x: 202, y: 168 });
  });

  it('pans by the drag displacement and ignores a second pointer', () => {
    const { puck, renderer } = setup();
    puck.open();
    expect(puck.begin('pan', pointer(1, 130, 380))).toBe(true);
    expect(puck.begin('zoom', pointer(2, 150, 300))).toBe(false);
    puck.move(pointer(2, 180, 310));
    expect(renderer.transformTouch).not.toHaveBeenCalled();
    puck.end(2);
    puck.move(pointer(1, 160, 400));
    expect(renderer.transformTouch).toHaveBeenCalledWith({
      from: expect.objectContaining({ x: 130, y: 380 }),
      to: expect.objectContaining({ x: 160, y: 400 }),
      scale: 1,
      rotation: 0
    });
  });

  it.each(['2d', '3d'] as const)('zooms around the viewport center even when the puck is off-center in %s', (mode) => {
    const { puck, renderer } = setup(mode);
    puck.open({ x: 145, y: 180 });
    puck.begin('zoom', pointer(1, 150, 300));
    puck.move(pointer(1, 155, 250));
    expect(renderer.transformTouch).toHaveBeenCalledWith({
      from: { x: 180, y: 350 },
      to: { x: 180, y: 350 },
      scale: 1 / 0.9,
      rotation: 0
    });
  });

  it('wraps rotation across the angle seam and skips the ambiguous center', () => {
    const { puck, renderer } = setup();
    puck.open();
    puck.begin('rotate', pointer(1, 80, 351));
    puck.move(pointer(1, 80, 349));
    expect(renderer.transformTouch.mock.calls[0]?.[0].rotation).toBeCloseTo(0.02, 3);
    renderer.transformTouch.mockClear();
    puck.move(pointer(1, 180, 350));
    puck.move(pointer(1, 280, 350));
    expect(renderer.transformTouch).not.toHaveBeenCalled();
  });

  it('only orbits in 3D, including when the mode changes during a drag', () => {
    const { puck, renderer, setMode } = setup();
    puck.open();
    expect(puck.begin('orbit', pointer(1, 200, 400))).toBe(false);
    setMode('3d');
    expect(puck.begin('orbit', pointer(1, 200, 400))).toBe(true);
    puck.move(pointer(1, 220, 410));
    expect(renderer.orbit).toHaveBeenCalledWith(20, 10);
    setMode('2d');
    puck.move(pointer(1, 230, 420));
    expect(renderer.orbit).toHaveBeenCalledTimes(1);
  });

  it('ends capture on cancel/close and never resumes a stale drag after reopening', () => {
    const { puck, renderer } = setup();
    puck.open();
    puck.begin('pan', pointer(1, 100, 100));
    puck.end(1);
    puck.move(pointer(1, 200, 200));
    expect(puck.activeAction()).toBeUndefined();
    puck.open();
    puck.begin('pan', pointer(1, 200, 200));
    puck.close();
    puck.open();
    puck.move(pointer(1, 300, 300));
    expect(renderer.transformTouch).not.toHaveBeenCalled();
  });

  it('reopens at the release pointer while the hotkey is held, then closes on key-up', () => {
    const { puck } = setup();
    puck.open({ x: 180, y: 350 }, 'held');
    puck.begin('pan', pointer(1, 130, 400));
    expect(puck.activeAction()).toBe('pan');
    puck.move(pointer(1, 190, 450));
    puck.end(1);
    expect(puck.activeAction()).toBeUndefined();
    expect(puck.center()).toEqual({ x: 190, y: 450 });
    expect(puck.begin('zoom', pointer(1, 150, 400))).toBe(true);
    puck.end(1);
    expect(puck.center()).toBeDefined();
    puck.releaseHotkey();
    expect(puck.center()).toBeUndefined();
  });

  it.each(['pan', 'zoom', 'rotate', 'orbit'] as const)(
    'continues %s after key-up until the captured pointer is released',
    (action) => {
      const { puck, renderer } = setup('3d');
      const movement = action === 'orbit' ? renderer.orbit : renderer.transformTouch;
      puck.open(undefined, 'held');
      puck.begin(action, pointer(1, 130, 400));
      puck.move(pointer(1, 140, 420));
      expect(movement).toHaveBeenCalledTimes(1);
      puck.releaseHotkey();
      expect(puck.activeAction()).toBe(action);
      expect(puck.center()).toBeDefined();
      puck.move(pointer(1, 180, 490));
      expect(movement).toHaveBeenCalledTimes(2);
      puck.end(1);
      expect(puck.activeAction()).toBeUndefined();
      expect(puck.center()).toBeUndefined();
      puck.move(pointer(1, 190, 500));
      expect(movement).toHaveBeenCalledTimes(2);
    }
  );

  it('keeps a pressed action when Space is released before the first pointer movement', () => {
    const { puck, renderer } = setup();
    puck.open(undefined, 'held');
    puck.begin('pan', pointer(1, 130, 400));
    puck.releaseHotkey();
    puck.move(pointer(1, 140, 420));
    expect(renderer.transformTouch).toHaveBeenCalledWith({
      from: expect.objectContaining({ x: 130, y: 400 }),
      to: expect.objectContaining({ x: 140, y: 420 }),
      scale: 1,
      rotation: 0
    });
    puck.end(1);
    expect(puck.center()).toBeUndefined();
  });

  it('a right-click or touch invocation closes after one operation', () => {
    const { puck } = setup();
    puck.open();
    puck.releaseHotkey();
    expect(puck.center()).toBeDefined();
    puck.begin('pan', pointer(1, 130, 400));
    puck.end(1);
    expect(puck.center()).toBeUndefined();
  });

  it('starts a direct pan at the exact center without a dead zone', () => {
    const { puck, renderer } = setup();
    puck.open();
    expect(puck.begin('pan', pointer(1, 180, 350))).toBe(true);
    puck.move(pointer(1, 190, 370));
    expect(renderer.transformTouch).toHaveBeenCalledWith({
      from: expect.objectContaining({ x: 180, y: 350 }),
      to: expect.objectContaining({ x: 190, y: 370 }),
      scale: 1,
      rotation: 0
    });
  });

  it('selects the shared pictured 2D zones and enables the 3D orbit quadrant', () => {
    const { puck, setMode } = setup();
    const origin = { x: 180, y: 350 };
    puck.open(origin);
    expect(puck.actionAt({ x: 160, y: 340 }, origin)).toBeUndefined();
    expect(puck.actionAt({ x: 140, y: 310 }, origin)).toBe('pan');
    expect(puck.actionAt({ x: 180, y: 400 }, origin)).toBe('zoom');
    expect(puck.actionAt({ x: 80, y: 350 }, origin)).toBe('rotate');
    setMode('3d');
    expect(puck.actionAt({ x: 220, y: 390 }, origin)).toBe('orbit');
    expect(puck.actionAt({ x: 220, y: 310 }, origin)).toBe('rotate');
    expect(puck.actionAt({ x: 500, y: 900 }, origin)).toBeUndefined();
  });

  it('cancels a held gesture without reopening after pointer loss', () => {
    const { puck } = setup();
    puck.open(undefined, 'held');
    puck.begin('pan', pointer(1, 130, 400));
    puck.cancel(2);
    expect(puck.activeAction()).toBe('pan');
    puck.cancel(1);
    puck.end(1);
    expect(puck.center()).toBeUndefined();
  });

  it('snaps roll to absolute 15 degree angles with Shift', () => {
    const { puck, renderer } = setup();
    puck.open({ x: 145, y: 180 });
    puck.begin('rotate', pointer(1, 280, 350));
    puck.move({ ...pointer(1, 180 + 100 * Math.cos(0.36), 350 + 100 * Math.sin(0.36)), shiftKey: true });
    const rotation = renderer.transformTouch.mock.calls[0]![0].rotation;
    expect((0.1 - rotation) / (Math.PI / 12)).toBeCloseTo(-1);
  });

  it('accumulates small Shift orbit moves until a 15 degree step is reached', () => {
    const { puck, renderer } = setup('3d');
    puck.open();
    puck.begin('orbit', pointer(1, 230, 400));
    for (let i = 1; i <= 30; i++) puck.move({ ...pointer(1, 230 + i, 400), shiftKey: true });
    const total = renderer.orbit.mock.calls.reduce((sum, call) => sum + call[0], 0);
    expect(total * 0.006).toBeCloseTo(Math.PI / 12);
  });
});

function setup(mode: ViewportMode = '2d') {
  const [getMode, setMode] = createSignal(mode);
  const renderer = { orbit: vi.fn(), transformTouch: vi.fn<(gesture: { rotation: number }) => void>() };
  const puck = createNavigationPuck({
    viewport: () => ({ left: 20, top: 30, width: 320, height: 640 }),
    transform: renderer.transformTouch,
    orbit: renderer.orbit,
    mode: getMode,
    rotation: () => -0.1
  });
  return { puck, renderer, setMode };
}

function pointer(pointerId: number, x: number, y: number) {
  return { pointerId, x, y };
}
