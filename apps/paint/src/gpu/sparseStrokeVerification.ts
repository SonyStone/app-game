import { createStrokeSampler, defaultBrush } from '../brush';
import { defaultCamera } from '../camera';
import { createDocument } from '../document';
import { unpackTile } from '../tilePixels';
import { createPaintRenderer } from './renderer';

/** Regression for a continuous stroke crossing the old 1024-tile document ceiling on a real GPU. */
export async function verifySparseStroke(report: (message: string) => void) {
  const errors: string[] = [];
  const canvas = new OffscreenCanvas(512, 256);
  const renderer = await createPaintRenderer(canvas, (message) => errors.push(message), { cacheTiles: 4 });
  const document = createDocument();
  const brush = { ...defaultBrush(), pressureSize: false };
  const sampler = createStrokeSampler(brush);
  try {
    renderer.begin(document.active, brush);
    for (let start = 0; start <= 1100; start += 32) {
      const samples = Array.from({ length: Math.min(32, 1101 - start) }, (_, i) => ({
        x: 128 + (start + i) * 256,
        y: 128,
        pressure: 1,
        time: start + i
      }));
      await renderer.paint(sampler.add(samples));
    }
    document.commit(await renderer.finish());
    const state = document.state();
    if (state.tileCount <= 1024 || state.pixelBytes >= 64 * 1048576 || !state.canUndo)
      throw new Error('Sparse stroke exceeded its storage or undo budget.');
    const first = document.active.tiles.get('0,0')!;
    const last = document.active.tiles.get('1100,0')!;
    if (!unpackTile(first)[(128 * 256 + 128) * 4 + 3] || !unpackTile(last)[(128 * 256 + 128) * 4 + 3])
      throw new Error('Stroke endpoints were lost during eviction.');
    document.undo();
    if (document.state().tileCount) throw new Error('Undo did not remove the stroke.');
    document.redo();
    renderer.reset();
    await renderer.render(
      document.layers,
      { ...defaultCamera(), x: 128, y: 128, zoom: 0.05 },
      { width: 512, height: 256 },
      1
    );
    await renderer.submitted();
    if (errors.length) throw new Error(errors.join('\n'));
    report(
      `PASS: continuous ${state.tileCount}-tile stroke, ${(state.tileCount / 4).toFixed(2)} MiB raw → ${(state.pixelBytes / 1048576).toFixed(2)} MiB stored; endpoints, undo/redo and 5% GPU display preserved`
    );
  } finally {
    renderer.destroy();
  }
}
