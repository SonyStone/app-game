import { defaultStrokeSettings } from '@app-game/paint-core/strokeSettings';
import { describe, expect, it } from 'vitest';
import { correctionPenSamples, strokeCorrectionFrame } from './correctionDemoSimulation';

const settings = defaultStrokeSettings();
const distance = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

describe('stroke correction demo', () => {
  it.each(['none', 'studio', 'normal', 'smooth', 'stabilizer'] as const)(
    '%s produces a finite pressure-sensitive line',
    (mode) => {
      const frame = strokeCorrectionFrame({ ...settings, mode }, 1800);
      expect(frame.line.length).toBeGreaterThan(2);
      expect(frame.line.every((p) => [p.x, p.y, p.pressure].every(Number.isFinite))).toBe(true);
      expect(new Set(frame.line.map((p) => p.pressure)).size).toBeGreaterThan(1);
    }
  );

  it('higher stabilizer levels leave the line farther behind mid-stroke', () => {
    const gaps = [0, 15, 22].map((stabilizer) => {
      const frame = strokeCorrectionFrame({ ...settings, mode: 'stabilizer', stabilizer }, 2100);
      return distance(frame.line.at(-1)!, frame.pen!);
    });
    expect(gaps[1]).toBeGreaterThan(gaps[0]! + 2);
    expect(gaps[2]).toBeGreaterThan(gaps[1]! + 2);
  });

  it('Smooth catch-up closes the gap on lift and disabling it leaves a gap', () => {
    const gaps = [true, false].map((catchUp) => {
      const frame = strokeCorrectionFrame({ ...settings, mode: 'smooth', catchUp }, 2700);
      return distance(frame.line.at(-1)!, frame.pen!);
    });
    expect(gaps[0]).toBeLessThan(2);
    expect(gaps[1]).toBeGreaterThanOrEqual(40);
  });

  it.each([0, 15, 22])('stabilizer %s finishes within the pen marker regardless of catch-up', (stabilizer) => {
    for (const catchUp of [true, false]) {
      const frame = strokeCorrectionFrame({ ...settings, mode: 'stabilizer', stabilizer, catchUp }, 2700);
      expect(distance(frame.line.at(-1)!, frame.pen!)).toBeLessThan(2);
    }
  });

  it.each([15, 22])('reports the before/after lift split for stabilizer %s', (stabilizer) => {
    const frame = strokeCorrectionFrame({ ...settings, mode: 'stabilizer', stabilizer }, 2700);
    expect(frame.afterLift.length).toBeGreaterThan(0);
    expect(frame.line).toEqual([...frame.beforeLift, ...frame.afterLift]);
    expect(distance(frame.beforeLift.at(-1)!, frame.pen!)).toBeGreaterThan(40);
  });

  it('reports Smooth finish separately from committed ink and keeps the same lift point', () => {
    const on = strokeCorrectionFrame({ ...settings, mode: 'smooth', catchUp: true }, 2500);
    const off = strokeCorrectionFrame({ ...settings, mode: 'smooth', catchUp: false }, 2500);
    expect(on.beforeLift).toEqual(off.beforeLift);
    expect(on.pen).toEqual(off.pen);
    expect(on.line).toEqual([...on.beforeLift, ...on.afterLift]);
    expect(distance(on.beforeLift.at(-1)!, on.pen!)).toBeGreaterThan(40);
    expect(strokeCorrectionFrame(settings, 2499).afterLift).toEqual([]);
  });

  it.each([240, 360, 700])('lays out input for a %s CSS pixel strip without scaling its height', (width) => {
    const samples = correctionPenSamples(width);
    expect(samples.at(-1)!.x).toBe(width - 16);
    expect(samples.map((p) => p.y)).toEqual(correctionPenSamples().map((p) => p.y));
    const frame = strokeCorrectionFrame({ ...settings, mode: 'smooth', catchUp: false }, 2500, samples);
    expect(distance(frame.line.at(-1)!, frame.pen!)).toBeGreaterThanOrEqual(40);
  });

  it('replays identically with explicit samples', () => {
    const samples = correctionPenSamples();
    expect(strokeCorrectionFrame(settings, 1600, samples)).toEqual(strokeCorrectionFrame(settings, 1600, samples));
    expect(samples.every((p) => p.pointerType === 'pen')).toBe(true);
  });

  it('lets the stabilizer approach a resting pen through idle', () => {
    const stroke = { ...settings, mode: 'stabilizer' as const, stabilizer: 22 };
    const before = strokeCorrectionFrame(stroke, 1150);
    const rest = strokeCorrectionFrame(stroke, 1340);
    expect(distance(rest.line.at(-1)!, rest.pen!)).toBeLessThan(distance(before.line.at(-1)!, before.pen!));
  });
});
