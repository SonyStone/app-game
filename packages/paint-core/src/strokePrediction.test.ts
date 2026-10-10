import { percent, pixels } from '@app-game/abr-parser';
import { prepareAbrBrush } from '@app-game/abr-paint/preset';
import { describe, expect, it } from 'vitest';
import { defaultBrush, type Sample } from './brush';
import { createAbrProcessor } from './composition/abrStrokeProcessor';
import { createLeonardoProcessor } from './leonardoStroke';
import { createStabilizerProcessor } from './stabilizerStroke';
import { predictedTail, withPrediction } from './strokePrediction';
import { createRawProcessor, createStudioProcessor } from './strokeProcessors';

const sample = (x: number, time: number, pressure = 0.5): Sample => ({ x, y: 0, pressure, time });

describe('predictedTail', () => {
  it('keeps the latest pressure and axes, and drops points behind it, too far ahead or not finite', () => {
    const latest = { ...sample(10, 100, 0.3), tiltX: 20, pointerType: 'pen' };
    const tail = predictedTail(latest, [
      sample(5, 99),
      sample(20, 110, 0),
      sample(Number.NaN, 120),
      sample(30, 140, 0),
      sample(40, 160)
    ]);
    expect(tail).toEqual([
      { ...latest, x: 20, time: 110 },
      { ...latest, x: 30, time: 140 }
    ]);
    expect(predictedTail(undefined, [sample(20, 110)])).toEqual([]);
  });
});

describe('withPrediction', () => {
  it.each([
    ['none', createRawProcessor],
    ['studio', createStudioProcessor],
    ['normal', createLeonardoProcessor]
  ] as const)('runs the %s preview on to the predicted points without committing them', (_mode, create) => {
    let predicted: Sample[] = [];
    const processor = withPrediction(create(defaultBrush(), 1), () => predicted);
    const committed = processor.add([sample(0, 1), sample(10, 2), sample(20, 3)]);
    const without = processor.preview();
    predicted = [sample(30, 10), sample(40, 18)];
    const preview = processor.preview();
    expect(preview.slice(0, without.length)).toEqual(without);
    expect(preview.slice(without.length).map((point) => point.x)).toEqual([30, 40]);
    // The prediction keeps the pressure the processor shows for the latest real point.
    const shown = without.at(-1) ?? committed.at(-1)!;
    expect(preview.at(-1)!.pressure).toBe(shown.pressure);
    predicted = [];
    expect(processor.preview()).toEqual(without);
    expect([...committed, ...processor.finish()].every((point) => point.x <= 20)).toBe(true);
    predicted = [sample(30, 10)];
    expect(processor.preview()).toEqual([]);
  });

  it('leaves processors that trail the pen unchanged', () => {
    const stabilizer = createStabilizerProcessor(defaultBrush(), 1);
    expect(withPrediction(stabilizer, () => [sample(30, 10)])).toBe(stabilizer);
  });

  it('predicts for ABR presets only without smoothing', () => {
    const prepared = prepareAbrBrush({
      id: 'round',
      name: 'Round',
      preset: {
        kind: 'brush',
        sourceId: 'fixture',
        tip: { kind: 'computed', diameter: pixels(16), spacing: percent(25), hardness: percent(100) }
      },
      resources: [],
      source: { format: 'photoshop-abr/v1' as const, bytes: new Uint8Array() }
    });
    const preset = (useSmoothing: boolean) => {
      const values = prepared.engine.settings.values;
      return {
        ...defaultBrush(),
        engine: {
          id: 'abr',
          settings: { values: { ...values, useSmoothing, smoothing: { ...values.smoothing, amount: 50 } } }
        }
      };
    };
    expect(createAbrProcessor(preset(true), 1).predict).toBeUndefined();
    const processor = createAbrProcessor(preset(false), 1);
    processor.add([sample(0, 1), sample(10, 2)]);
    expect(processor.predict?.([sample(30, 10)]).map((point) => point.x)).toEqual([30]);
  });
});
