import { defaultBrush, type Brush } from '@app-game/paint-core/brush';
import { createSaiFilter, saiCode } from '@app-game/paint-core/stabilizerStroke';
import { normalizeStrokeSettings, type StrokeSettings } from '@app-game/paint-core/strokeSettings';
import { describe, expect, it } from 'vitest';
import { getBrushSetting, type NumberSetting, type ToggleSetting } from './schema';
import { maxSmoothing, smoothingLevel, smoothingTrail, withSmoothing } from './smoothing';

const stroke = (patch: Partial<StrokeSettings>) => normalizeStrokeSettings({ ...defaultBrush().stroke, ...patch });

describe('Smoothing level', () => {
  it('reads raw input and Studio as 0 and the stabilizer as its level', () => {
    expect(smoothingLevel(stroke({ mode: 'none', stabilizer: 9 }))).toBe(0);
    expect(smoothingLevel(stroke({ mode: 'studio', stabilizer: 9 }))).toBe(0);
    for (let level = 0; level <= maxSmoothing; level++) {
      expect(smoothingLevel(stroke({ mode: 'stabilizer', stabilizer: level }))).toBe(level);
    }
  });

  it('reads a Leonardo window as the level whose trailing is nearest', () => {
    // Windows up to 16 samples trail as the level one below them; longer ones as the S level nearest.
    const table: [window: number, level: number][] = [
      [1, 0],
      [2, 1],
      [11, 10],
      [16, 15],
      [17, 16],
      [19, 16],
      [20, 17],
      [21, 17],
      [27, 18],
      [35, 19],
      [45, 20],
      [50, 20]
    ];
    for (const [window, level] of table) {
      expect(smoothingLevel(stroke({ mode: 'normal', normal: window - 1, smooth: 0 })), `normal ${window}`).toBe(level);
      expect(smoothingLevel(stroke({ mode: 'smooth', smooth: window - 1, normal: 0 })), `smooth ${window}`).toBe(level);
    }
  });

  it('writes 0 as Studio and every other level as the stabilizer, keeping the pressure curve and catch-up', () => {
    const from = stroke({ mode: 'smooth', smooth: 12, catchUp: false, minimum: 0.2, maximum: 0.7, firmness: 2 });
    expect(withSmoothing(from, 0)).toEqual({ ...from, mode: 'studio' });
    for (let level = 1; level <= maxSmoothing; level++) {
      expect(withSmoothing(from, level)).toEqual({ ...from, mode: 'stabilizer', stabilizer: level });
    }
    expect(withSmoothing(from, 99).stabilizer).toBe(maxSmoothing);
    expect(withSmoothing(from, -3).mode).toBe('studio');
    expect(withSmoothing(from, 4.4).stabilizer).toBe(4);
  });

  it('trails as far as the stabilizer filter does on a steady stroke', () => {
    for (let level = 0; level <= maxSmoothing; level++) {
      const sample = (x: number) => ({ x, y: 0, pressure: 1, time: x });
      const filter = createSaiFilter(saiCode(level), sample(0), false);
      let output = 0;
      for (let x = 1; x <= 300; x++) {
        output = filter.update(sample(x)).x;
      }
      expect(300 - output, `level ${level}`).toBeCloseTo(smoothingTrail(level), 2);
    }
  });
});

describe('Smoothing and catch-up rows', () => {
  const smoothing = getBrushSetting('smoothing') as NumberSetting;
  const catchUp = getBrushSetting('catch-up') as ToggleSetting;
  const brush = (patch: Partial<StrokeSettings>, abr = false): Brush => ({
    ...defaultBrush(),
    ...(abr ? { engine: { id: 'abr', settings: {} } } : {}),
    stroke: stroke(patch)
  });

  it('reads a Leonardo brush as its level and converts it only once the slider moves', () => {
    const leonardo = brush({ mode: 'smooth', smooth: 10 });
    expect(smoothing.read(leonardo)).toBe(10);
    expect(smoothing.write(leonardo, 12).stroke).toMatchObject({ mode: 'stabilizer', stabilizer: 12, smooth: 10 });
    expect(smoothing.write(leonardo, 0).stroke).toMatchObject({ mode: 'studio' });
  });

  it('reads a raw-input brush as 0 and writes levels from there', () => {
    const raw = brush({ mode: 'none' });
    expect(smoothing.read(raw)).toBe(0);
    expect(catchUp.enabled(raw)).toBe(false);
    expect(smoothing.write(raw, 3).stroke).toMatchObject({ mode: 'stabilizer', stabilizer: 3 });
  });

  it('enables catch-up above 0 only, and switching it turns a Leonardo brush into the stabilizer at its level', () => {
    expect(catchUp.enabled(brush({ mode: 'studio' }))).toBe(false);
    expect(catchUp.enabled(brush({ mode: 'stabilizer', stabilizer: 1 }))).toBe(true);
    const leonardo = brush({ mode: 'normal', normal: 5, catchUp: true });
    expect(catchUp.enabled(leonardo)).toBe(true);
    expect(catchUp.write(leonardo, false).stroke).toMatchObject({ mode: 'stabilizer', stabilizer: 5, catchUp: false });
    const stabilized = brush({ mode: 'stabilizer', stabilizer: 7, catchUp: false });
    expect(catchUp.write(stabilized, true).stroke).toEqual({ ...stabilized.stroke, catchUp: true });
  });

  it('reads an ABR brush as 0 unless it uses the stabilizer, as its preset smooths it otherwise', () => {
    for (const mode of ['none', 'studio', 'normal', 'smooth'] as const) {
      expect(smoothing.read(brush({ mode, normal: 20, smooth: 20 }, true)), mode).toBe(0);
      expect(catchUp.enabled(brush({ mode }, true)), mode).toBe(false);
    }
    expect(smoothing.read(brush({ mode: 'stabilizer', stabilizer: 18 }, true))).toBe(18);
  });
});
