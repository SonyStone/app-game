import { describe, expect, it } from 'vitest';
import { createDemoRecording } from './demo-recording';
import { applyPointerSample, createPlayback, stylusReveal, type VirtualPointer } from './pointer-recording';

describe('default demo', () => {
  it('plays pen, mouse and touch in order with finite, bounded measurements', () => {
    const take = createDemoRecording();
    expect(take.duration).toBe(18_000);
    expect([
      ...new Set(take.samples.filter((sample) => sample.type === 'pointerdown').map((sample) => sample.pointerType))
    ]).toEqual(['pen', 'mouse', 'touch']);
    let previousTime = 0;
    for (const sample of take.samples) {
      expect(sample.time).toBeGreaterThanOrEqual(previousTime);
      expect(sample.time).toBeLessThanOrEqual(take.duration);
      expect(sample.x).toBeGreaterThan(0);
      expect(sample.x).toBeLessThan(take.width);
      expect(sample.y).toBeGreaterThan(0);
      expect(sample.y).toBeLessThan(take.height);
      expect(sample.pressure).toBeGreaterThanOrEqual(0);
      expect(sample.pressure).toBeLessThanOrEqual(1);
      for (const value of Object.values(sample)) {
        if (typeof value === 'number') expect(Number.isFinite(value)).toBe(true);
      }
      previousTime = sample.time;
    }
  });

  it('varies pen pressure and tilt and gives every contact an explicit release', () => {
    const take = createDemoRecording();
    const pen = take.samples.filter((sample) => sample.pointerType === 'pen' && sample.buttons === 1);
    expect(
      Math.max(...pen.map((sample) => sample.pressure)) - Math.min(...pen.map((sample) => sample.pressure))
    ).toBeGreaterThan(0.5);
    expect(
      Math.max(...pen.map((sample) => sample.tiltX)) - Math.min(...pen.map((sample) => sample.tiltX))
    ).toBeGreaterThan(30);
    const pressed = new Set<number>();
    for (const sample of take.samples) {
      if (sample.type === 'pointerdown') {
        expect(pressed.has(sample.pointerId)).toBe(false);
        pressed.add(sample.pointerId);
      }
      if (sample.type === 'pointerup') {
        expect(pressed.has(sample.pointerId)).toBe(true);
        pressed.delete(sample.pointerId);
      }
      if (sample.buttons === 0) expect(pressed.has(sample.pointerId)).toBe(false);
    }
    expect(pressed.size).toBe(0);
  });

  it('reconstructs three simultaneous fingers and pen hover when seeking backwards', () => {
    const pointers = new Map<number, VirtualPointer>();
    const take = createDemoRecording();
    const player = createPlayback(take, {
      reset() {
        pointers.clear();
      },
      apply(sample) {
        applyPointerSample(pointers, sample);
      }
    });
    player.seek(14_000);
    const expected = structuredClone([...pointers]);
    expect(
      [...pointers.values()].filter((pointer) => pointer.down).map((pointer) => pointer.sample.pointerType)
    ).toEqual(['touch', 'touch', 'touch']);
    player.seek(take.duration);
    expect([...pointers.values()].every((pointer) => !pointer.down)).toBe(true);
    player.seek(14_000);
    expect([...pointers]).toEqual(expected);
    player.seek(7300);
    const pen = pointers.get(1);
    expect(pen).toBeDefined();
    if (!pen) throw new Error('Missing demo pen');
    expect(pen.down).toBe(false);
    expect(stylusReveal(pen, 7300)).toBe(0);
    player.seek(0);
    expect([...pointers.values()].every((pointer) => !pointer.down)).toBe(true);
  });
});
