import { beforeAll, expect, it } from 'vitest';
import { initAbr } from '@app-game/abr-parser';
import { createAbrStrokeSampler } from '@app-game/abr-brush/stroke';
import { createStrokeSampler, defaultBrush } from '@app-game/paint-core/brush';
import { softRoundCandidate } from '../../../tests/fixtures/softRound';

beforeAll(async () => {
  await initAbr();
});

it('records constant-pressure placement over 32 document pixels', () => {
  const preset = softRoundCandidate();
  const measurements = [0.05, 0.25, 0.5, 1].map((pressure) => {
    const points = [0, 32].map((x) => ({ x, y: 0, pressure, time: x, tiltX: 0, tiltY: 0, rotation: 0 }));
    const native = createStrokeSampler(defaultBrush()).add(points);
    const abr = createAbrStrokeSampler(
      {
        values: preset.engine.settings.values,
        size: 32,
        seed: 12345,
        flow: 0.35,
        opacity: 1,
        color: '#000000'
      },
      preset.resource
    ).add(points);
    return [native.length, native[1]!.x, native[0]!.radius, abr.count, abr.data[16]! - abr.data[0]!, abr.data[2]!].map(
      (value) => Number(value.toFixed(4))
    );
  });

  // Document the placement gap. Each triple is dab count, first advance and horizontal tip radius.
  expect(measurements).toEqual([
    [167, 0.192, 0.8, 33, 1, 1.804],
    [34, 0.96, 4, 30, 1.0752, 5.74],
    [17, 1.92, 8, 17, 1.9968, 10.66],
    [9, 3.84, 16, 9, 3.84, 20.5]
  ]);
});
