import { defaultBrush } from '../brush';
import { defaultCamera } from '../camera';
import { createDocument } from '../document';
import { createPaintRenderer } from './renderer';

/** Checks display-only brush/eraser tails against actual rasterization under scratch eviction. */
export async function verifyLiveTail(report: (message: string) => void) {
  for (const virtualTexture of [false, true])
    for (const tool of ['brush', 'eraser'] as const) {
      const document = createDocument();
      const base = new Uint8Array(256 * 256 * 4);
      for (let i = 0; i < base.length; i += 4) base.set([30, 70, 90, 160], i);
      for (let x = 0; x < 3; x++) document.active.tiles.set(`${x},0`, base.slice());
      const errors: string[] = [];
      const canvas = new OffscreenCanvas(768, 256);
      const renderer = await createPaintRenderer(canvas, (message) => errors.push(message), {
        cacheTiles: 2,
        virtualTexture,
        onError: (error) => errors.push(String(error))
      });
      const camera = { ...defaultCamera(), x: 384, y: 128, zoom: 1 };
      const draw = async () => {
        await renderer.render(document.layers, camera, { width: 768, height: 256 }, 1);
        await renderer.submitted();
        const context = new OffscreenCanvas(768, 256).getContext('2d')!;
        context.drawImage(canvas, 0, 0);
        return context.getImageData(0, 0, 768, 256).data;
      };
      const equal = (a: Uint8ClampedArray, b: Uint8ClampedArray, label: string) => {
        if (a.some((value, i) => value !== b[i])) throw new Error(`${tool}: ${label}`);
      };
      try {
        await renderer.prepareOverview(document.layers);
        if (virtualTexture) {
          const deadline = performance.now() + 5000;
          for (;;) {
            await draw();
            const pages = renderer.debugPages();
            if (pages.length && pages.every((page) => page.resident && !page.fallback)) break;
            if (performance.now() > deadline) throw new Error('Tail test detail did not become resident');
            await new Promise((resolve) => setTimeout(resolve, 16));
          }
        }
        const brush = { ...defaultBrush(), tool, opacity: 0.4 };
        const first = [{ x: 245, y: 128, radius: 20, flow: 0.4 }];
        const tail = Array.from({ length: 100 }, (_, i) => ({ x: 250 + i * 4, y: 128, radius: 20, flow: 0.4 }));
        renderer.begin(document.active, brush);
        await renderer.paint(first);
        const before = await draw();
        renderer.preview(tail);
        const visible = await draw();
        if (!visible.some((value, i) => value !== before[i])) throw new Error('Tail was not displayed');
        // Rebuilding the same preview must not deposit extra ink or lose masks after eviction.
        renderer.invalidateView();
        equal(visible, await draw(), 'preview accumulated extra opacity');
        renderer.preview([]);
        equal(before, await draw(), 'clearing the tail did not restore committed output');
        renderer.preview(tail);
        await draw();
        const changes = await renderer.finish();
        renderer.reset();
        renderer.begin(document.active, brush);
        await renderer.paint(first);
        const reference = await renderer.finish();
        if (JSON.stringify(changes) !== JSON.stringify(reference)) throw new Error('Preview entered readback/history');
        renderer.reset();
        renderer.begin(document.active, brush);
        await renderer.paint([...first, ...tail]);
        equal(visible, await draw(), 'preview differs from the real brush/eraser result');
        renderer.cancel();
        if (errors.length) throw new Error(errors.join('\n'));
        report(
          `PASS: ${virtualTexture ? 'virtual' : 'native'} ${tool} tail matches real pixels, survives eviction, clears without ghosts and stays out of history`
        );
      } finally {
        renderer.destroy();
      }
    }
}
