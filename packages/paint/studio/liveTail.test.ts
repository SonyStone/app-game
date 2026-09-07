import { expect, it } from 'vitest';
import { defaultBrush, type Sample } from './brush';
import { createSmoothStroke } from './smoothStroke';

it.each(['none', 'studio', 'normal', 'smooth'] as const)(
  '%s previews do not change committed pressure, spacing or curve state',
  (mode) => {
    const brush = defaultBrush();
    brush.stroke.mode = mode;
    const live = createSmoothStroke(brush);
    const reference = createSmoothStroke(brush);
    const samples: Sample[] = Array.from({ length: 12 }, (_, i) => ({
      x: i * 20,
      y: Math.sin(i) * 20,
      pressure: 0.1 + i * 0.07,
      time: i * 8
    }));
    for (const sample of samples) {
      expect(live.add([sample])).toEqual(reference.add([sample]));
      const preview = live.preview();
      expect(live.preview()).toEqual(preview);
      if (sample.x > 0 && mode !== 'none') expect(preview.length).toBeGreaterThan(0);
    }
    expect(live.finish()).toEqual(reference.finish());
    expect(live.preview()).toEqual([]);
  }
);
