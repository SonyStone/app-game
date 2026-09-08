import type { ColorMixing } from '@app-game/abr-brush/effects';
import { defaultBrush } from '../brush';
import { viewerBrush } from '../brushLibrary/viewerBrush';
import { abrBrush } from '../composition/abrBrushEngine';
import { createBrushResources } from '../composition/brushResources';
import { createResourceSession } from '../composition/resourceSession';
import { createDocument } from '../document';
import { createRawProcessor } from '../strokeProcessors';
import { packTile, unpackTile } from '../tilePixels';
import { createPaintRenderer } from './renderer';

/** Exercises actual ABR tile compositing across a tile boundary, including switching, rollback and history. */
export async function verifyAbrColorMixing(report: (message: string) => void) {
  for (const tool of ['PbTl', 'PcTl']) {
    const classic = await render(tool, 'classic', 'Nrml');
    const smooth = await render(tool, 'linear', 'Nrml');
    const multiply = await render(tool, 'linear', 'Mltp');
    for (const x of [250, 260]) {
      const read = (tiles: Map<string, Uint8Array>) => {
        const tile = tiles.get(`${Math.floor(x / 256)},0`)!;
        return Array.from(tile.slice((128 * 256 + (x % 256)) * 4, (128 * 256 + (x % 256)) * 4 + 4));
      };
      const check = (actual: number[], expected: number[]) => {
        if (actual.some((value, i) => Math.abs(value - expected[i]!) > 1))
          throw new Error(`${tool} at ${x}: expected ${expected}, received ${actual}`);
      };
      check(read(classic), [128, 128, 0, 255]);
      check(read(smooth), [188, 188, 0, 255]);
      check(read(multiply), [0, 128, 0, 255]);
    }
  }
  for (const tool of ['SmTl', 'BlTl']) {
    const classic = await render(tool, 'classic', 'Nrml', true);
    const smooth = await render(tool, 'linear', 'Nrml', true);
    const a = classic.get('1,0')!,
      b = smooth.get('1,0')!;
    if (tool === 'BlTl') {
      const i = 128 * 256 * 4;
      if (
        Math.abs(a[i]! - 64) > 1 ||
        Math.abs(a[i + 1]! - 191) > 1 ||
        Math.abs(b[i]! - 137) > 1 ||
        Math.abs(b[i + 1]! - 225) > 1
      )
        throw new Error(`Blur must average in linear light: classic ${a.slice(i, i + 4)}, smooth ${b.slice(i, i + 4)}`);
    }
    let brighter = false;
    for (let i = 0; i < a.length; i += 4) {
      if (a[i + 3] !== b[i + 3]) throw new Error('Retouch mixing changed alpha coverage.');
      if (b[i]! > a[i]! + 10 && b[i + 1]! > a[i + 1]! + 10) brighter = true;
    }
    if (!brighter) throw new Error(`${tool} still mixes red and green in Classic space.`);
    report(`PASS: ${tool} honors Smooth color across tiles, with identical alpha and reversible history.`);
  }
  report(
    'PASS: ABR Brush/Pencil Smooth color = RGB(188,188,0), Classic = RGB(128,128,0); Multiply, tile boundaries, cancellation and undo/redo preserved.'
  );
}

async function render(tool: string, mixing: ColorMixing, mode: string, retouch = false) {
  const document = createDocument();
  const green = new Uint8Array(256 * 256 * 4);
  for (let i = 0; i < green.length; i += 4) green.set([0, 255, 0, 255], i);
  for (const key of ['0,0', '1,0']) document.active.tiles.set(key, packTile(green));
  if (retouch) {
    const red = new Uint8Array(green.length);
    for (let i = 0; i < red.length; i += 4) red.set([255, 0, 0, 255], i);
    document.active.tiles.set('0,0', packTile(red));
  }
  const before = new Map([...document.active.tiles].map(([key, tile]) => [key, unpackTile(tile)]));
  const preset = viewerBrush({
    id: 'mixing',
    name: 'Mixing QA',
    type: 'computed',
    diameter: 32,
    hardness: 100,
    spacing: 10,
    settings: {
      toolOptions: { __classId: tool, 'Prs ': tool === 'SmTl' ? 50 : 100, Md: { enumType: 'BlnM', value: mode } }
    }
  });
  const resources = createBrushResources();
  for (const resource of preset.resources) resources.put(resource);
  const errors: string[] = [];
  const renderer = await createPaintRenderer(new OffscreenCanvas(512, 256), (error) => errors.push(error), {
    cacheTiles: 2
  });
  try {
    const start = () =>
      createResourceSession(resources, (resources) =>
        abrBrush.engine({
          resources,
          renderer,
          layer: document.active,
          layers: document.layers,
          processor: createRawProcessor(),
          brush: { ...defaultBrush(), color: '#ff0000', size: 32, flow: 1, opacity: 0.5, mixing },
          settings: { ...preset.engine.settings, blendMode: mode, seed: 1 }
        })
      );
    const points = (tool === 'BlTl' ? [256] : [240, 256, 272]).map((x, i) => ({
      x,
      y: 128,
      pressure: 1,
      time: i * 10
    }));
    const cancelled = start();
    await cancelled.add(points);
    cancelled.cancel();
    const stroke = start();
    for (const point of points) await stroke.add([point]);
    document.commit(await stroke.finish());
    await renderer.submitted();
    if (errors.length) throw new Error(errors.join('\n'));
    const result = new Map([...document.active.tiles].map(([key, tile]) => [key, unpackTile(tile)]));
    document.undo();
    if ([...document.active.tiles].some(([key, tile]) => unpackTile(tile).some((v, i) => v !== before.get(key)![i])))
      throw new Error('Color mixing undo failed to restore original pixels.');
    document.redo();
    for (const [key, tile] of document.active.tiles)
      if (unpackTile(tile).some((v, i) => v !== result.get(key)![i]))
        throw new Error('Color mixing redo changed pixels.');
    return result;
  } finally {
    renderer.destroy();
    resources.dispose();
  }
}
