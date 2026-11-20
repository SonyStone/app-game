// CPU-only probe. Run with PAINT_ROUND_COST=1 to print median microseconds per engine call.
import { it } from 'vitest';
import { defaultBrush } from '../brush';
import { createDocument } from '../document';
import type { PaintRenderer } from './contracts';
import { drawRound } from './studioBrushRecipe';

it.runIf(process.env.PAINT_ROUND_COST)('measures round engine startup and one 88px packet without a GPU', async () => {
  const renderer = { supportsPaintRound: true, begin() {}, async paint() {}, cancel() {} } as unknown as PaintRenderer;
  const processor = { preview: () => [], finish: () => [] };
  for (const [size, pressure] of [
    [4, 0.05],
    [32, 1]
  ] as const) {
    for (const route of ['round', 'abr'] as const) {
      const brush = { ...defaultBrush(), size };
      const points = Array.from({ length: 17 }, (_, i) => ({ x: 20 + 5.5 * i, y: 32, pressure, time: i * 8 }));
      const layer = createDocument().active;
      const begin: number[] = [],
        add: number[] = [];
      for (let i = 0; i < 551; i++) {
        const start = performance.now();
        const session = drawRound(
          {
            brush,
            settings: undefined,
            layer,
            renderer,
            seed: 12345,
            resources: {
              get() {
                throw Error('unexpected tip');
              }
            },
            processor: { ...processor, add: (samples) => [...samples] }
          },
          route
        );
        const sampled = performance.now();
        await session.add(points);
        const end = performance.now();
        session.cancel();
        if (i >= 50) {
          begin.push((sampled - start) * 1000);
          add.push((end - sampled) * 1000);
        }
      }
      process.stdout.write(
        JSON.stringify([route, size, begin.sort((a, b) => a - b)[250], add.sort((a, b) => a - b)[250]]) + '\n'
      );
    }
  }
});
