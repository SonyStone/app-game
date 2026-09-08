import { defaultBrush } from '../brush';
import { viewerBrush } from '../brushLibrary/viewerBrush';
import { abrBrush } from '../composition/abrBrushEngine';
import { createBrushResources } from '../composition/brushResources';
import { createResourceSession } from '../composition/resourceSession';
import { createDocument } from '../document';
import { createRawProcessor } from '../strokeProcessors';
import { packTile, unpackTile } from '../tilePixels';
import { createPaintRenderer } from './renderer';

/** Real Pencil ink: binary edges, stroke opacity, contact-based Auto Erase and tile/history invariants. */
export async function verifyAbrPencil(report: (message: string) => void) {
  const background = await render({ auto: true });
  const foreground = await render({ auto: true, reverse: true });
  const plain = await render({});
  const faint = await render({ opacity: 0.25 });
  const evicted = await render({ auto: true, cache: 1, batch: 1 });
  for (const x of [8, 20, 30]) {
    const i = (128 * 256 + x) * 4;
    if (background[i] !== 0 || background[i + 2] !== 255 || background[i + 3] !== 255)
      throw new Error('Pencil Auto Erase failed to retain background color after leaving foreground pixels.');
    if (foreground[i] !== 255 || foreground[i + 2] !== 0 || plain[i] !== 255)
      throw new Error('Pencil painted background despite starting on empty canvas or disabling Auto Erase.');
    if (faint[i + 3] !== 64)
      throw new Error('Pencil discarded the tool opacity ceiling or accumulated it on retracing.');
  }
  if (background.some((value, i) => value !== evicted[i]))
    throw new Error('Pencil Auto Erase changed with batching or eviction.');
  for (let i = 3; i < plain.length; i += 4)
    if (plain[i] !== 0 && plain[i] !== 255) throw new Error('Pencil introduced antialiased edge pixels.');
  const tiny = await render({ size: 1 });
  for (const x of [0, 1, 15, 30])
    if (tiny[(128 * 256 + x) * 4 + 3] !== 255) throw new Error('One-pixel Pencil disappeared at integer coordinates.');
  report(
    'ABR Pencil: binary edges, 1px continuity, opacity, ignored Flow, Auto Erase contact/crossing, cancellation, batching/eviction and undo/redo passed.'
  );
}

async function render(options: {
  auto?: boolean;
  reverse?: boolean;
  opacity?: number;
  cache?: number;
  batch?: number;
  size?: number;
}) {
  const document = createDocument();
  const red = new Uint8Array(256 * 256 * 4);
  for (let i = 0; i < red.length; i += 4) red.set([255, 0, 0, 255], i);
  document.active.tiles.set('-1,0', packTile(red));
  const preset = viewerBrush({
    id: 'pencil-qa',
    name: 'Pencil QA',
    type: 'computed',
    diameter: options.size ?? 32,
    hardness: 0,
    spacing: 10,
    settings: { toolOptions: { __classId: 'PcTl', PncA: options.auto ?? false, flow: 1 } }
  });
  const resources = createBrushResources();
  for (const resource of preset.resources) resources.put(resource);
  const renderer = await createPaintRenderer(
    new OffscreenCanvas(256, 256),
    (message) => {
      throw new Error(message);
    },
    {
      cacheTiles: options.cache ?? 16
    }
  );
  try {
    const stroke = () =>
      createResourceSession(resources, (resources) =>
        abrBrush.engine({
          resources,
          renderer,
          layer: document.active,
          layers: document.layers,
          processor: createRawProcessor(),
          brush: {
            ...defaultBrush(),
            size: options.size ?? 32,
            color: '#ff0000',
            flow: 0.01,
            opacity: options.opacity ?? 1
          },
          settings: { ...preset.engine.settings, secondaryColor: '#0000ff', seed: 1 }
        })
      );
    const points = [-16, 8, 32, 8, 32].map((x, i) => ({ x, y: 128, pressure: 1, time: i * 10 }));
    if (options.reverse) points[0]!.x = 32;
    const cancel = stroke();
    await cancel.add(points);
    cancel.preview(true);
    cancel.cancel();
    const current = stroke();
    for (let i = 0; i < points.length; i += options.batch ?? points.length) {
      await current.add(points.slice(i, i + (options.batch ?? points.length)));
      current.preview(true);
    }
    document.commit(await current.finish());
    const tile = document.active.tiles.get('0,0');
    if (!tile) throw new Error('Pencil failed to commit pixels.');
    const result = unpackTile(tile);
    document.undo();
    if (document.active.tiles.has('0,0') || unpackTile(document.active.tiles.get('-1,0')!).some((v, i) => v !== red[i]))
      throw new Error('Pencil undo did not restore original tiles.');
    document.redo();
    if (unpackTile(document.active.tiles.get('0,0')!).some((v, i) => v !== result[i]))
      throw new Error('Pencil redo changed committed pixels.');
    return result;
  } finally {
    renderer.destroy();
    resources.dispose();
  }
}
