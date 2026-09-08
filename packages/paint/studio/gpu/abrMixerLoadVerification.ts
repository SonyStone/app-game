import { defaultBrush } from '../brush';
import { viewerBrush } from '../brushLibrary/viewerBrush';
import { abrBrush } from '../composition/abrBrushEngine';
import { createBrushResources } from '../composition/brushResources';
import { createResourceSession } from '../composition/resourceSession';
import { createDocument } from '../document';
import { createRawProcessor } from '../strokeProcessors';
import { unpackTile } from '../tilePixels';
import { createPaintRenderer } from './renderer';

/** Exercises sampled loads through the registered engine, including refills and transparent canvas.
 * Tests tool invariants, not Photoshop's unmeasured pickup footprint or pigment exchange constants.
 */
export async function verifyAbrMixerLoad(report: (message: string) => void) {
  const area = await loadAndStamp({ solid: false });
  const solid = await loadAndStamp({ solid: true });
  const left = 124 * 4,
    right = 132 * 4;
  if (area[0]![left]! < 240 || area[0]![right + 2]! < 240 || area[0]![left + 2]! > 10 || area[0]![right]! > 10)
    throw new Error('A multi-color Mixer load lost its red/blue variation.');
  if (solid[0]![left + 2]! < 240 || solid[0]![right + 2]! < 240 || solid[0]![left]! > 1)
    throw new Error('Load Solid Colors Only did not load the selected blue pixel uniformly.');
  if (!area[0]!.every((value, i) => value === area[1]![i]))
    throw new Error('Auto Load replaced the sampled colors after a stroke.');
  const restored = await loadAndStamp({ solid: false, replace: true });
  if (area.some((row, i) => row.some((value, j) => value !== restored[i]![j])))
    throw new Error('Renderer replacement lost the multi-color load or its Auto Load template.');
  const half = await loadAndStamp({ solid: true, alpha: 128 });
  if (Math.abs(half[0]![right + 3]! - 128) > 1 || Math.abs(half[0]![right + 2]! - 128) > 1)
    throw new Error('Sampling partially transparent paint did not retain premultiplied color/alpha.');
  const blank = await loadAndStamp({ solid: false, blank: true });
  if (blank.some((row) => row.some(Boolean))) throw new Error('An empty canvas load manufactured paint.');
  const current = await loadAndStamp({ solid: true, otherLayer: true });
  const all = await loadAndStamp({ solid: true, otherLayer: true, allLayers: true });
  if (current.some((row) => row.some(Boolean)) || all[0]![right + 2]! < 240)
    throw new Error('Loading paint did not honor Sample All Layers.');
  report(
    'ABR Mixer canvas load: multi-color vs exact solid pixel, sampled Auto Load, transparent/empty paint, current/all layers and renderer handoff passed.'
  );
}

async function loadAndStamp(options: {
  solid: boolean;
  alpha?: number;
  blank?: boolean;
  otherLayer?: boolean;
  allLayers?: boolean;
  replace?: boolean;
}) {
  const document = createDocument();
  const source = new Uint8Array(256 * 256 * 4);
  const alpha = options.alpha ?? 255;
  for (let y = 0; y < 256; y++)
    for (let x = 0; x < 256; x++) source.set(x < 128 ? [alpha, 0, 0, alpha] : [0, 0, alpha, alpha], (y * 256 + x) * 4);
  document.active.tiles.set('0,0', source);
  if (options.otherLayer) document.changeLayer({ type: 'add' });
  const preset = viewerBrush({
    id: 'load-qa',
    name: 'Mixer load',
    type: 'computed',
    diameter: 32,
    hardness: 100,
    spacing: 25,
    settings: {
      toolOptions: {
        __classId: 'MixB',
        wetness: 0,
        dryness: 100,
        mix: 0,
        flow: 100,
        autoFill: true,
        autoClean: true,
        loadSolidColorOnly: options.solid,
        sampleAllLayers: options.allLayers ?? false
      }
    }
  });
  const resources = createBrushResources();
  for (const resource of preset.resources) resources.put(resource);
  const brush = { ...defaultBrush(), color: '#00ff00', size: 32, flow: 1, opacity: 1, mixing: 'classic' as const };
  const errors: string[] = [];
  const createRenderer = () =>
    createPaintRenderer(new OffscreenCanvas(512, 256), (error) => errors.push(error), {
      cacheTiles: 1
    });
  let renderer = await createRenderer();
  try {
    const scope = resources.open();
    try {
      await abrBrush.engine.command!({
        resources: scope,
        renderer,
        brush,
        layer: document.active,
        layers: document.layers,
        settings: preset.engine.settings,
        command: { type: 'load-canvas', point: { x: options.blank ? -512 : 128, y: 128 } }
      });
    } finally {
      scope.release();
    }
    if (document.active.tiles.has('1,0')) throw new Error('Loading a brush painted on the document.');
    const rows: Uint8Array[] = [];
    for (const y of [64, 192]) {
      if (options.replace) {
        const tools = await renderer.snapshotTools();
        renderer.destroy();
        renderer = await createRenderer();
        renderer.restoreTools(structuredClone(tools));
      }
      const stroke = createResourceSession(resources, (resources) =>
        abrBrush.engine({
          resources,
          renderer,
          brush,
          layer: document.active,
          layers: document.layers,
          processor: createRawProcessor(),
          settings: { ...preset.engine.settings, seed: 1 }
        })
      );
      await stroke.add([{ x: 384, y, pressure: 1, time: 1 }]);
      document.commit(await stroke.finish());
      await renderer.submitted();
      if (errors.length) throw new Error(errors.join('\n'));
      const pixels = document.active.tiles.get('1,0');
      rows.push(pixels ? unpackTile(pixels).slice(y * 256 * 4, (y + 1) * 256 * 4) : new Uint8Array(256 * 4));
    }
    return rows;
  } finally {
    renderer.destroy();
    resources.dispose();
  }
}
