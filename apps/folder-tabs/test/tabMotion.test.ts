import { createRoot, createSignal, flush } from 'solid-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTabMotion } from '../src/createTabMotion';

const disposers: (() => void)[] = [];
afterEach(() => {
  disposers.splice(0).forEach((dispose) => dispose());
  vi.unstubAllGlobals();
});

describe('tab catch-up motion', () => {
  it('uses the same cruising speed but lets a farther tab arrive later', () => {
    const f = fixture();
    f.setTargets([{ id: 'near', x: 50 }, { id: 'far', x: 150 }]);
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
    f.setTargets([{ id: 'near', x: 50 }, { id: 'far', x: 150 }]);
    flush();
    f.advance(20);
    const before = f.positions().get('far')!;
    f.setTargets([{ id: 'near', x: 0 }, { id: 'far', x: 0 }]);
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

  it('settles immediately for reduced motion and cancels its frame on disposal', () => {
    const f = fixture();
    f.setTargets([{ id: 'near', x: 50 }, { id: 'far', x: 150 }]);
    flush();
    f.advance(3);
    f.setReduced(true);
    flush();
    expect(f.positions().get('far')).toBe(150);
    expect(f.pending()).toBe(0);
    f.setReduced(false);
    f.setTargets([{ id: 'near', x: 0 }, { id: 'far', x: 0 }]);
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
    const [targets, setTargets] = createSignal([{ id: 'near', x: 0 }, { id: 'far', x: 0 }]);
    const [drag, setDrag] = createSignal<number>();
    const [reduced, setReduced] = createSignal(false);
    const positions = createTabMotion(targets, drag, reduced);
    return { setTargets, setDrag, setReduced, positions, dispose };
  });
  flush();
  return {
    ...state,
    pending: () => frames.size,
    advance(count: number) {
      for (let i = 0; i < count; i++) {
        time += 1000 / 60;
        const callbacks = [...frames.values()];
        frames.clear();
        callbacks.forEach((callback) => callback(time));
        flush();
      }
    }
  };
}
