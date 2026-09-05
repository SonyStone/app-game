// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createNavigationPuck } from '../src/controller';
import { attachNavigationPuck } from '../src/input';

const cleanups: (() => void)[] = [];
afterEach(() => {
  cleanups.splice(0).forEach((dispose) => dispose());
  document.body.replaceChildren();
});
describe('shared canvas navigation bindings', () => {
  it.each(['2d', '3d'] as const)('keeps Space lifecycle and client coordinates identical in %s', (mode) => {
    const { canvas, puck, pointer } = setup(mode);
    pointer('pointermove', 250, 200);
    key('keydown', 'Space');
    expect(puck.center()).toEqual({ x: 250, y: 200 });
    puck.begin('pan', { x: 300, y: 200, pointerId: 1 });
    key('keyup', 'Space');
    expect(puck.activeAction()).toBe('pan');
    puck.move({ x: 320, y: 230, pointerId: 1 });
    puck.end(1);
    expect(puck.center()).toBeUndefined();
    expect(canvas.tabIndex).toBe(0);
  });
  it('consumes right-drag and its release before the editor sees paint events', () => {
    const { puck, pointer, paint, transform, canvas } = setup();
    pointer('pointerdown', 400, 300, 2);
    pointer('pointermove', 300, 300, 2);
    expect(puck.activeAction()).toBe('rotate');
    pointer('pointermove', 270, 310, 2);
    pointer('pointerup', 260, 320, 2);
    canvas.dispatchEvent(new MouseEvent('contextmenu', { cancelable: true }));
    expect(transform).toHaveBeenCalled();
    expect(paint).not.toHaveBeenCalled();
    expect(puck.center()).toBeUndefined();
  });
  it('right-drag selects Orbit in 3D through the same binding', () => {
    const { puck, pointer, orbit } = setup('3d');
    pointer('pointerdown', 400, 300, 2);
    pointer('pointermove', 450, 350, 2);
    expect(puck.activeAction()).toBe('orbit');
    pointer('pointermove', 460, 360, 2);
    expect(orbit).toHaveBeenCalledWith(10, 10);
  });
  it('rejects a second right pointer and cancels the owner on capture loss', () => {
    const { puck, pointer } = setup();
    pointer('pointerdown', 400, 300, 2);
    pointer('pointermove', 300, 300, 2);
    pointer('pointerdown', 600, 400, 2, 2);
    expect(puck.activeAction()).toBe('rotate');
    pointer('lostpointercapture', 300, 300, 2);
    expect(puck.center()).toBeUndefined();
  });
  it('does not intercept text entry, buttons, modified Space or a busy canvas', () => {
    const { puck, busy } = setup();
    busy(true);
    key('keydown', 'Space');
    expect(puck.center()).toBeUndefined();
    busy(false);
    const input = document.createElement('input');
    document.body.append(input);
    input.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ', bubbles: true }));
    expect(puck.center()).toBeUndefined();
    const button = document.createElement('button');
    document.body.append(button);
    button.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ', bubbles: true }));
    key('keydown', 'Space', { ctrlKey: true });
    expect(puck.center()).toBeUndefined();
  });
  it.each(['2d', '3d'] as const)('preserves the first drag when focus moves to a button in %s', (mode) => {
    const { canvas, puck, transform } = setup(mode);
    const button = document.createElement('button');
    document.body.append(button);
    canvas.focus();
    key('keydown', 'KeyV', { key: 'v' });
    button.focus();
    expect(puck.center()).toBeDefined();
    expect(puck.begin('pan', { x: 460, y: 350, pointerId: 1 })).toBe(true);
    puck.move({ x: 480, y: 380, pointerId: 1 });
    expect(transform).toHaveBeenCalledWith({
      from: expect.objectContaining({ x: 460, y: 350 }),
      to: expect.objectContaining({ x: 480, y: 380 }),
      scale: 1,
      rotation: 0
    });
    puck.end(1);
    expect(puck.center()).toBeUndefined();
  });
  it.each(['blur', 'resize'])('clears held state on %s and leaves no stale drag', (event) => {
    const { puck } = setup();
    key('keydown', 'Space');
    window.dispatchEvent(new Event(event));
    expect(puck.center()).toBeUndefined();
    key('keyup', 'Space');
    expect(puck.center()).toBeUndefined();
  });
  it('supports V and Escape, and removes every listener on disposal', () => {
    const { puck, dispose } = setup();
    key('keydown', 'KeyV', { key: 'v' });
    expect(puck.center()).toBeDefined();
    key('keydown', 'Escape', { key: 'Escape' });
    expect(puck.center()).toBeUndefined();
    dispose();
    key('keydown', 'Space');
    expect(puck.center()).toBeUndefined();
  });
});
function setup(mode: '2d' | '3d' = '2d') {
  const canvas = document.createElement('canvas');
  canvas.tabIndex = 0;
  canvas.setPointerCapture = vi.fn();
  document.body.append(canvas);
  const transform = vi.fn(),
    orbit = vi.fn(),
    paint = vi.fn();
  let busy = false;
  const puck = createNavigationPuck({
    viewport: () => ({ left: 20, top: 30, width: 800, height: 600 }),
    mode: () => mode,
    rotation: () => 0,
    transform,
    orbit
  });
  const dispose = attachNavigationPuck(canvas, puck, { busy: () => busy });
  cleanups.push(dispose);
  for (const type of ['pointerdown', 'pointermove', 'pointerup']) canvas.addEventListener(type, paint);
  const pointer = (type: string, x: number, y: number, button = 0, id = 1) => {
    const event = new MouseEvent(type, { clientX: x, clientY: y, button, bubbles: true, cancelable: true });
    Object.defineProperty(event, 'pointerId', { value: id });
    canvas.dispatchEvent(event);
  };
  return {
    canvas,
    puck,
    pointer,
    paint,
    transform,
    orbit,
    dispose,
    busy: (value: boolean) => {
      busy = value;
    }
  };
}
function key(type: string, code: string, extra: KeyboardEventInit = {}) {
  window.dispatchEvent(
    new KeyboardEvent(type, { code, key: code === 'Space' ? ' ' : code, cancelable: true, ...extra })
  );
}
