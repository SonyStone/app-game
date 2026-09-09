import { createRoot, createSignal, flush } from 'solid-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTabMotion } from '../src/createTabMotion';

const disposers: (() => void)[] = [];
afterEach(() => {
  disposers.splice(0).forEach((dispose) => dispose());
  vi.unstubAllGlobals();
});

describe('tab catch-up motion', () => {
  it('does not invalidate subscribers when a frame or a repeated target changes no coordinates', () => {
    const f = fixture();
    const initial = f.positions();
    f.advance(1);
    expect(f.positions()).toBe(initial);
    f.setDirect('near');
    f.setTargets([{ id: 'near', x: 0 }, { id: 'far', x: 0 }]);
    flush();
    f.advance(1);
    expect(f.positions()).toBe(initial);
    f.setTargets([{ id: 'near', x: 1 }, { id: 'far', x: 0 }]);
    flush();
    expect(f.positions()).not.toBe(initial);
    expect(f.positions().get('near')).toBe(1);
  });

  it('preserves motion speed when the browser delivers frames at 20 or 30 Hz', () => {
    const distanceAt = (fps: number) => {
      const f = fixture();
      f.setTargets([{ id: 'near', x: 250 }, { id: 'far', x: 400 }]);
      flush();
      f.advance(1);
      f.advance(fps, 1000 / fps);
      const distance = f.positions().get('far')!;
      f.dispose();
      return distance;
    };
    const reference = distanceAt(60);
    expect(distanceAt(30)).toBeCloseTo(reference, 3);
    expect(distanceAt(20)).toBeCloseTo(reference, 3);
  });

  it('uses the same cruising speed but lets a farther tab arrive later', () => {
    const f = fixture();
    f.setTargets([
      { id: 'near', x: 50 },
      { id: 'far', x: 150 }
    ]);
    flush();
    f.advance(20);
    const before = f.positions();
    f.advance(1);
    expect(f.positions().get('near')! - before.get('near')!).toBeCloseTo(100 / 60);
    expect(f.positions().get('far')! - before.get('far')!).toBeCloseTo(100 / 60);
    f.advance(30);
    expect(f.positions().get('near')).toBe(50);
    expect(f.positions().get('far')).toBeLessThan(150);
    f.advance(80);
    expect(f.positions().get('far')).toBe(150);
    expect(f.pending()).toBe(0);
  });

  it('retargets without teleporting and keeps direct swipes attached to the painted tabs', () => {
    const f = fixture();
    f.setTargets([
      { id: 'near', x: 50 },
      { id: 'far', x: 150 }
    ]);
    flush();
    f.advance(20);
    const before = f.positions().get('far')!;
    f.setTargets([
      { id: 'near', x: 0 },
      { id: 'far', x: 0 }
    ]);
    flush();
    expect(f.positions().get('far')).toBe(before);
    f.setDrag(0);
    flush();
    expect(f.positions().get('far')).toBe(before);
    f.setDrag(12);
    flush();
    expect(f.positions().get('far')).toBeCloseTo(before - 12);
    expect(f.pending()).toBe(0);
    f.setDrag(undefined);
    flush();
    f.advance(120);
    expect(f.positions().get('far')).toBe(0);
  });

  it('keeps the grabbed item direct while other items move at their own speed and reverse smoothly', () => {
    const f = fixture();
    f.setDirect('near');
    f.setTargets([
      { id: 'near', x: 200 },
      { id: 'far', x: 200 }
    ]);
    flush();
    expect(f.positions().get('near')).toBe(200);
    expect(f.positions().get('far')).toBe(0);
    f.advance(20);
    const before = f.positions().get('far')!;
    f.setTargets([
      { id: 'near', x: 400 },
      { id: 'far', x: 400 }
    ]);
    flush();
    expect(f.positions().get('near')).toBe(400);
    expect(f.positions().get('far')).toBe(before);
    f.advance(1);
    expect(f.positions().get('far')! - before).toBeCloseTo(100 / 60);
    const turning = f.positions().get('far')!;
    f.setDirect(undefined);
    f.setTargets([
      { id: 'near', x: 0 },
      { id: 'far', x: 0 }
    ]);
    flush();
    expect(f.positions().get('far')).toBe(turning);
    f.advance(360);
    expect(f.positions().get('near')).toBe(0);
    expect(f.positions().get('far')).toBe(0);
    expect(f.pending()).toBe(0);
  });

  it('matches a screen-length click exit in about 600 ms across viewport heights', () => {
    for (const distance of [100, 240]) {
      const f = fixture();
      f.setSpeed(distance / (0.6 - 1 / 6));
      f.setTargets([
        { id: 'near', x: distance },
        { id: 'far', x: distance * 2 }
      ]);
      flush();
      f.advance(36);
      expect(f.positions().get('near')!).toBeGreaterThan(distance * 0.98);
      expect(f.positions().get('far')!).toBeLessThan(distance * 2);
      f.dispose();
    }
  });

  it('settles immediately for reduced motion and cancels its frame on disposal', () => {
    const f = fixture();
    f.setTargets([
      { id: 'near', x: 50 },
      { id: 'far', x: 150 }
    ]);
    flush();
    f.advance(3);
    f.setReduced(true);
    flush();
    expect(f.positions().get('far')).toBe(150);
    expect(f.pending()).toBe(0);
    f.setReduced(false);
    f.setTargets([
      { id: 'near', x: 0 },
      { id: 'far', x: 0 }
    ]);
    flush();
    expect(f.pending()).toBe(1);
    f.dispose();
    expect(f.pending()).toBe(0);
  });
});

function fixture() {
  let time = 0;
  let sequence = 0;
  const frames = new Map<number, FrameRequestCallback>();
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.set(++sequence, callback);
    return sequence;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
  const state = createRoot((dispose) => {
    disposers.push(dispose);
    const [targets, setTargets] = createSignal([
      { id: 'near', x: 0 },
      { id: 'far', x: 0 }
    ]);
    const [drag, setDrag] = createSignal<number>();
    const [reduced, setReduced] = createSignal(false);
    const [direct, setDirect] = createSignal<string>();
    const [speed, setSpeed] = createSignal(100);
    const positions = createTabMotion(targets, drag, reduced, speed, direct);
    return { setSpeed, setDirect, setTargets, setDrag, setReduced, positions, dispose };
  });
  flush();
  return {
    ...state,
    pending: () => frames.size,
    advance(count: number, interval = 1000 / 60) {
      for (let i = 0; i < count; i++) {
        time += interval;
        const callbacks = [...frames.values()];
        frames.clear();
        callbacks.forEach((callback) => callback(time));
        flush();
      }
    }
  };
}
