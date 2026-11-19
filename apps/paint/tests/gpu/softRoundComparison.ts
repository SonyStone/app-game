import { initAbr } from '@app-game/abr-parser';
import { createBrushResources } from '@app-game/abr-paint/resources';
import { defaultBrush, TILE_SIZE, type Sample } from '@app-game/paint-core/brush';
import { studioBrushRecipe } from '@app-game/paint-core/composition/studioBrushRecipe';
import { createResourceSession } from '@app-game/paint-core/composition/resourceSession';
import { createDocument } from '@app-game/paint-core/document';
import { createPaintRenderer } from '@app-game/paint-core/gpu/renderer';
import { createStudioProcessor } from '@app-game/paint-core/strokeProcessors';
import { unpackTile } from '@app-game/paint-core/tilePixels';
import { softRoundCandidate } from '../fixtures/softRound';

/** Writes a contact sheet's source cells as grayscale alpha PNGs to the verification log. */
export async function compareSoftRound(report: (message: string) => void) {
  await initAbr();
  const width = 128,
    height = 64;
  const errors: string[] = [];
  const renderer = await createPaintRenderer(new OffscreenCanvas(width, height), (message) => errors.push(message), {
    cacheTiles: 2
  });
  const cache = createBrushResources();
  const loaded = new Set<string>();
  try {
    for (const row of referenceRows()) {
      const preset = softRoundCandidate(row.size, row.erase, row.flow);
      for (const resource of preset.resources) {
        if (!loaded.has(resource.id)) {
          cache.put(resource);
          loaded.add(resource.id);
        }
      }
      for (const abr of [false, true]) {
        renderer.reset();
        renderer.setLinearBlending(true);
        const document = createDocument();
        if (row.erase) {
          const patch = new Uint8Array(TILE_SIZE * TILE_SIZE * 4);
          for (let i = 3; i < patch.length; i += 4) {
            patch[i] = 255;
          }
          document.active.tiles.set('0,0', patch);
        }
        const brush = abr
          ? preset.brush
          : { ...defaultBrush(), size: row.size, tool: preset.brush.tool, color: '#000000', flow: row.flow };
        const engine = studioBrushRecipe.engines[abr ? 'abr' : 'round'];
        let count = 0;
        const session = createResourceSession(cache, (resources) =>
          engine({
            brush,
            settings: brush.engine?.settings,
            resources,
            layer: document.active,
            seed: 12345,
            processor: createStudioProcessor(brush),
            renderer: {
              ...renderer,
              async paint(dabs) {
                count += dabs.length;
                return renderer.paint(dabs);
              }
            }
          })
        );
        await session.add(row.points);
        document.commit(await session.finish());
        const tile = document.active.tiles.get('0,0');
        const pixels = tile && unpackTile(tile);
        const canvas = window.document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d')!;
        const image = context.createImageData(width, height);
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            const alpha = pixels?.[(y * TILE_SIZE + x) * 4 + 3] ?? 0;
            const i = (y * width + x) * 4;
            image.data.set([alpha, alpha, alpha, 255], i);
          }
        }
        context.putImageData(image, 0, 0);
        report(JSON.stringify({ label: row.label, size: row.size, abr, count, alpha: canvas.toDataURL() }));
      }
    }
    if (errors.length) {
      throw new Error(errors.join('\n'));
    }
  } finally {
    renderer.destroy();
    cache.dispose();
  }
}

function* referenceRows() {
  for (const size of [32, 4]) {
    for (const label of ['Tap', '5%', '25%', '50%', '100%', 'Ramp', 'Fast S']) {
      const ramp = label === 'Ramp' || label === 'Fast S';
      const points: Sample[] = Array.from({ length: label === 'Tap' ? 1 : 17 }, (_, i) => {
        const t = i / 16;
        return {
          x: label === 'Tap' ? 64 : 20 + 88 * t,
          y: 32 + (label === 'Fast S' ? 12 * Math.sin(t * 2 * Math.PI) : 0),
          pressure: ramp ? 1 - Math.abs(2 * t - 1) : label === 'Tap' ? 1 : parseInt(label) / 100,
          pointerType: 'pen',
          time: i * (label === 'Fast S' ? 2 : 8)
        };
      });
      yield { size, label, points, erase: false, flow: 0.35 };
    }
  }
  for (const flow of [1, 0.35]) {
    yield {
      label: 'Erase ' + flow * 100 + '%',
      size: 32,
      erase: true,
      flow,
      points: [20, 108].map((x, i) => ({ x, y: 32, pressure: 1, time: i * 16 }))
    };
  }
}
