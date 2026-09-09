import { defaultBrush, type Sample } from '../brush';
import { viewerBrush } from '../brushLibrary/viewerBrush';
import { abrBrush } from '../composition/abrBrushEngine';
import { createBrushResources } from '../composition/brushResources';
import { createResourceSession } from '../composition/resourceSession';
import { createDocument } from '../document';
import { createRawProcessor } from '../strokeProcessors';
import { unpackTile } from '../tilePixels';
import { verifyAbrMixerLoad } from './abrMixerLoadVerification';
import { createPaintRenderer } from './renderer';

/** Pixel checks for native MixB routing, paint depletion and cross-stroke well ownership.
 * These establish tool behavior and state invariants, not numerical Photoshop mixing parity.
 */
export async function verifyAbrMixer(report: (message: string) => void) {
  const dry = await renderMixer({ wet: 0, mix: 100 });
  const loaded = await renderMixer({ wet: 0, mix: 0 });
  assertEqual(dry, loaded, 'Wet 0 must use loaded color regardless of Mix.');
  const wet = await renderMixer({ wet: 100, mix: 100 });
  const empty = await renderMixer({ wet: 100, mix: 100, otherLayer: true });
  const all = await renderMixer({ wet: 100, mix: 100, otherLayer: true, allLayers: true });
  const moved = (row: Uint8Array) => row[240 * 4]!;
  if (moved(wet[0]!) < 20 || moved(all[0]!) < 20 || empty[0]!.some(Boolean))
    throw new Error('Mixer wet pickup did not respect current/all-layer sampling.');
  if (dry[0]![300 * 4 + 2]! < 240 || dry[0]![300 * 4]! > 5)
    throw new Error('Dry Mixer failed to deposit loaded blue paint.');
  const mixed = await renderMixer({ wet: 100, mix: 50 });
  if (mixed[0]![240 * 4]! <= 0 || mixed[0]![240 * 4 + 2]! <= 0)
    throw new Error('Mix did not combine loaded blue and picked-up red.');
  const lowLoad = await renderMixer({ load: 1 });
  if (lowLoad[0]![350 * 4 + 3]! !== 0 || loaded[0]![350 * 4 + 3]! < 200)
    throw new Error('Load did not limit the length of a dry stroke.');
  const lowFlow = await renderMixer({ flow: 10 });
  if (lowFlow[0]![300 * 4 + 3]! >= loaded[0]![300 * 4 + 3]!) throw new Error('Flow did not change deposited paint.');
  const retained = await renderMixer({ load: 1, strokes: 2 });
  const refilled = await renderMixer({ load: 1, strokes: 2, autoFill: true });
  const cleaned = await renderMixer({ strokes: 2, autoClean: true });
  const both = await renderMixer({ strokes: 2, autoClean: true, autoFill: true });
  if (retained[1]![204 * 4 + 3]! !== 0 || cleaned[1]![300 * 4 + 3]! !== 0)
    throw new Error('A depleted/cleaned Mixer reservoir silently refilled between strokes.');
  assertEqual([refilled[0]!], [refilled[1]!], 'Auto Load did not restore the loaded paint.');
  assertEqual([both[0]!], [both[1]!], 'Auto Clean + Auto Load left the brush empty.');
  const manualLoad = await renderMixer({ load: 1, strokes: 2, between: 'load' });
  assertEqual([manualLoad[0]!], [manualLoad[1]!], 'Manual Load did not restore a depleted reservoir.');
  const manualClean = await renderMixer({ strokes: 2, between: 'clean' });
  if (manualClean[1]![300 * 4 + 3]! !== 0) throw new Error('Manual Clean left paint in the reservoir.');
  const cleanNew = await renderMixer({ before: 'clean', autoFill: true });
  if (cleanNew[0]![300 * 4 + 3]! !== 0) throw new Error('Beginning a new preset undid manual Clean.');
  const cancelled = await renderMixer({ wet: 100, mix: 50, cancelFirst: true });
  assertEqual(mixed, cancelled, 'Cancelling Mixer changed the next stroke.');
  const evicted = await renderMixer({ wet: 100, mix: 50, capacity: 1, batch: 7 });
  assertEqual(mixed, evicted, 'Mixer changed with event batching or tile eviction.');
  for (const settings of [{ wet: 100, mix: 50 }, { load: 1 }, { autoClean: true }]) {
    const expected = await renderMixer({ ...settings, strokes: 2 });
    const restored = await renderMixer({ ...settings, strokes: 2, replace: true });
    assertEqual(expected, restored, 'Renderer handoff changed retained, depleted or cleaned Mixer paint.');
  }
  report(
    'ABR MixB: Wet/Mix/Load/Flow, current/all-layer pickup, automatic/manual Load/Clean, clean-before-first-stroke, cancellation, batching, eviction and exact tool-state handoff passed.'
  );
  await verifyAbrMixerLoad(report);
}

async function renderMixer(options: {
  wet?: number;
  mix?: number;
  load?: number;
  flow?: number;
  autoFill?: boolean;
  autoClean?: boolean;
  otherLayer?: boolean;
  allLayers?: boolean;
  strokes?: number;
  cancelFirst?: boolean;
  capacity?: number;
  batch?: number;
  before?: 'load' | 'clean';
  between?: 'load' | 'clean';
  replace?: boolean;
}): Promise<Uint8Array[]> {
  const document = createDocument();
  const pixels = new Uint8Array(256 * 256 * 4);
  for (let y = 0; y < 256; y++) for (let x = 0; x < 200; x++) pixels.set([255, 0, 0, 255], (y * 256 + x) * 4);
  document.active.tiles.set('0,0', pixels);
  if (options.otherLayer) document.changeLayer({ type: 'add' });
  const preset = viewerBrush({
    id: 'mixer-qa',
    name: 'Mixer',
    type: 'computed',
    diameter: 32,
    spacing: 12.5,
    hardness: 100,
    settings: {
      toolOptions: {
        __classId: 'MixB',
        wetness: options.wet ?? 0,
        dryness: options.load ?? 100,
        mix: options.mix ?? 0,
        flow: options.flow ?? 100,
        autoFill: options.autoFill ?? false,
        autoClean: options.autoClean ?? false,
        sampleAllLayers: options.allLayers ?? false
      }
    }
  });
  const resources = createBrushResources();
  preset.resources.forEach((resource) => resources.put(resource));
  const errors: string[] = [];
  const createRenderer = () =>
    createPaintRenderer(new OffscreenCanvas(512, 256), (message) => errors.push(message), {
      cacheTiles: options.capacity ?? 8
    });
  let renderer = await createRenderer();
  try {
    const brush = {
      ...defaultBrush(),
      size: 32,
      color: '#0000ff',
      opacity: preset.opacity!,
      flow: preset.flow!,
      mixing: 'classic' as const
    };
    const action = async (command: 'load' | 'clean') => {
      const scope = resources.open();
      try {
        await abrBrush.engine.command!({
          resources: scope,
          renderer,
          layer: document.active,
          brush,
          settings: preset.engine.settings,
          command
        });
      } finally {
        scope.release();
      }
    };
    if (options.before) await action(options.before);
    const rows: Uint8Array[] = [];
    for (let index = options.cancelFirst ? -1 : 0; index < (options.strokes ?? 1); index++) {
      if (index > 0 && options.replace) {
        const state = await renderer.snapshotTools();
        renderer.destroy();
        renderer = await createRenderer();
        renderer.restoreTools(structuredClone(state));
        const restored = await renderer.snapshotTools();
        if (
          state.mixer?.remaining !== restored.mixer?.remaining ||
          state.mixer?.pixels.some((value, i) => value !== restored.mixer?.pixels[i])
        )
          throw new Error('Renderer handoff changed rgba16float pigment or remaining load.');
      }
      if (index > 0 && options.between) await action(options.between);
      const y = 80 + Math.max(0, index) * 80;
      const stroke = createResourceSession(resources, (resources) =>
        abrBrush.engine({
          resources,
          renderer,
          layer: document.active,
          layers: document.layers,
          processor: createRawProcessor(),
          brush: {
            ...defaultBrush(),
            size: 32,
            color: '#0000ff',
            opacity: preset.opacity!,
            flow: preset.flow!,
            mixing: 'classic'
          },
          settings: { ...preset.engine.settings, seed: 1 }
        })
      );
      const points: Sample[] = Array.from({ length: 55 }, (_, i) => ({ x: 184 + i * 4, y, pressure: 1, time: i * 8 }));
      const batch = options.batch ?? 1;
      for (let i = 0; i < points.length; i += batch) {
        await stroke.add(points.slice(i, i + batch));
        stroke.preview(true);
      }
      if (index < 0) {
        stroke.cancel();
        continue;
      }
      document.commit(await stroke.finish());
      await renderer.submitted();
      if (errors.length) throw new Error(errors.join('\n'));
      const row = new Uint8Array(512 * 4);
      for (let tx = 0; tx < 2; tx++) {
        const tile = document.active.tiles.get(`${tx},0`);
        if (tile) row.set(unpackTile(tile).subarray(y * 256 * 4, (y + 1) * 256 * 4), tx * 256 * 4);
      }
      rows.push(row);
    }
    return rows;
  } finally {
    renderer.destroy();
    resources.dispose();
  }
}

function assertEqual(expected: Uint8Array[], actual: Uint8Array[], message: string) {
  if (expected.length !== actual.length || expected.some((row, i) => row.some((value, j) => value !== actual[i]![j])))
    throw new Error(message);
}
