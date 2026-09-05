import { describe, expect, it, vi } from 'vitest';
import { createGreaseNavigation } from './greaseNavigation';

describe('Grease camera adapter', () => {
  it('converts counterclockwise camera roll to shared clockwise snapping', () => {
    let roll = 0.1;
    const transformTouch = vi.fn((gesture: { rotation: number }) => {
      roll -= gesture.rotation;
    });
    const puck = createGreaseNavigation({
      viewport: () => ({ left: 0, top: 0, width: 800, height: 600 }),
      mode: () => '2d',
      roll: () => roll,
      renderer: () => ({ transformTouch, orbit: vi.fn() })
    });
    puck.open();
    puck.begin('rotate', { pointerId: 1, x: 500, y: 300 });
    puck.move({ pointerId: 1, x: 400 + 100 * Math.cos(0.36), y: 300 + 100 * Math.sin(0.36), shiftKey: true });
    expect(roll).toBeCloseTo(-Math.PI / 12);
    expect(transformTouch).toHaveBeenCalledWith(
      expect.objectContaining({ from: { x: 400, y: 300 }, to: { x: 400, y: 300 } })
    );
  });
  it('forwards Orbit to the renderer only in 3D', () => {
    let mode: '2d' | '3d' = '2d';
    const orbit = vi.fn();
    const puck = createGreaseNavigation({
      viewport: () => ({ left: 0, top: 0, width: 800, height: 600 }),
      mode: () => mode,
      roll: () => 0,
      renderer: () => ({ transformTouch: vi.fn(), orbit })
    });
    puck.open();
    expect(puck.begin('orbit', { pointerId: 1, x: 450, y: 350 })).toBe(false);
    mode = '3d';
    puck.begin('orbit', { pointerId: 1, x: 450, y: 350 });
    puck.move({ pointerId: 1, x: 465, y: 360 });
    expect(orbit).toHaveBeenCalledWith(15, 10);
  });
});
