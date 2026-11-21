import { createBrushResources, type BrushResource } from '@app-game/abr-paint/resources';
import { defaultBrush } from '@app-game/paint-core/brush';
import { defaultCamera } from '@app-game/paint-core/camera';
import { abrBrush } from '@app-game/paint-core/composition/abrBrushEngine';
import { createResourceSession } from '@app-game/paint-core/composition/resourceSession';
import { createDocument } from '@app-game/paint-core/document';
import { createPaintRenderer } from '@app-game/paint-core/gpu/renderer';
import { createRawProcessor } from '@app-game/paint-core/strokeProcessors';
import { unpackTile } from '@app-game/paint-core/tilePixels';
import { sampledFixture } from './sampledFixture';

/** Checks actual sampled GPU pixels, including preview, tile corners, readback and renderer recovery. */
export async function verifySampledBrush(report: (message: string) => void, loadTip: () => Promise<BrushResource>) {
  const canvas = new OffscreenCanvas(512, 512);
  let document = createDocument();
  const resources = createBrushResources();
  const errors: string[] = [];
  let renderer = await createPaintRenderer(canvas, (message) => errors.push(message), { cacheTiles: 4 });
  const camera = { ...defaultCamera(), x: 256, y: 256 };
  const size = { width: 512, height: 512 };
  const draw = async () => {
    await renderer.render(document.layers, camera, size, 1);
    await renderer.submitted();
    return readCanvas(canvas);
  };
  const loaded = new Set<string>();
  const begin = async (image: BrushResource, angleDeg = 0, tool: 'brush' | 'eraser' = 'brush', opacity = 0.5) => {
    const brush = {
      ...defaultBrush(),
      size: 128,
      pressureSize: false,
      flow: 1,
      opacity,
      mixing: 'classic' as const,
      tool
    };
    const sampled = await sampledFixture(image, angleDeg, brush);
    if (!loaded.has(sampled.resource.id)) {
      resources.put(sampled.resource);
      loaded.add(sampled.resource.id);
    }
    return createResourceSession(resources, (resources) =>
      abrBrush.engine({
        brush: sampled.brush,
        seed: 7,
        settings: sampled.brush.engine!.settings,
        resources,
        layer: document.active,
        processor: { ...createRawProcessor(), preview: () => [{ x: 350, y: 350, pressure: 1, time: 10 }] },
        renderer
      })
    );
  };
  const sample = { x: 200, y: 200, pressure: 1, time: 0 };
  const alpha = (x: number, y: number) => {
    const tile = document.active.tiles.get(`${Math.floor(x / 256)},${Math.floor(y / 256)}`);
    return tile ? unpackTile(tile)[((y % 256) * 256 + (x % 256)) * 4 + 3]! : 0;
  };
  const assert = (value: boolean, message: string) => {
    if (!value) {
      throw new Error(message);
    }
  };
  try {
    const pixels = new Uint8Array(8 * 4);
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) pixels[y * 8 + x] = 255;
    const half = { id: 'half', width: 8, height: 4, format: 'r8unorm' as const, pixels };
    const stroke = await begin(half);
    await stroke.add([sample]);
    const active = await draw();
    stroke.preview(true);
    assert(
      (await draw()).some((value, i) => value !== active[i]),
      'Sampled live tail did not render.'
    );
    stroke.preview(false);
    assert(
      (await draw()).every((value, i) => value === active[i]),
      'Removing the sampled live tail changed actual ink.'
    );
    document.commit(await stroke.finish());
    const committed = await draw();
    assert(
      active.every((value, i) => value === committed[i]),
      'Sampled stroke changed pixels on commit.'
    );
    assert(alpha(150, 180) >= 126 && alpha(150, 180) <= 129, 'Native coverage/opacity was not rasterized.');
    assert(alpha(240, 200) === 0 && alpha(150, 245) === 0, 'Tip transparency or native aspect ratio was lost.');
    report('PASS: native tip aspect, transparent pixels and opacity; active output equals committed pixels');
    const baseline = committed;
    const cancelled = await begin(half, -90);
    await cancelled.add([{ ...sample, x: 320 }]);
    await draw();
    cancelled.cancel();
    assert(
      (await draw()).every((value, i) => value === baseline[i]),
      'Cancel changed the committed document.'
    );
    const rotated = await begin(half, -90);
    await rotated.add([{ ...sample, x: 320 }]);
    document.commit(await rotated.finish());
    assert(alpha(320, 150) >= 126 && alpha(320, 250) === 0, 'Clockwise tip rotation is incorrect.');
    // The original 128 px half-tip dab summed to 524288 alpha units. Its left edge lies inside tile (1,0).
    const rotatedPixels = unpackTile(document.active.tiles.get('1,0')!);
    let coverage = 0;
    for (let offset = 3; offset < rotatedPixels.length; offset += 4) {
      coverage += rotatedPixels[offset]!;
    }
    assert(Math.abs(coverage / 524288 - 1) < 0.02, 'Enlarging the small sampled tip changed its coverage by over 2%.');
    report('PASS: rotation, small-tip coverage and cancellation');
    const squareTip = {
      id: 'square',
      width: 64,
      height: 64,
      format: 'r8unorm' as const,
      pixels: new Uint8Array(4096).fill(255)
    };
    const corner = { ...sample, y: 250 };
    const square = await begin(squareTip, -45);
    await square.add([corner]);
    document.commit(await square.finish());
    for (const x of [255, 256]) {
      for (const y of [255, 256]) {
        assert(alpha(x, y) === 128, 'Sampled opacity changed across the four-tile junction.');
      }
    }
    assert(alpha(292, 250) === 0, 'Rotated tip exceeded its bounds.');
    assert(alpha(275, 260) >= 126, 'Rectangular corner was clipped while binning across tile boundaries.');
    document.undo();
    renderer.reset();
    assert(alpha(275, 260) === 0, 'Undo did not remove the sampled corner.');
    document.redo();
    renderer.reset();
    assert(alpha(275, 260) >= 126, 'Redo did not restore the sampled corner.');
    const eraser = await begin(squareTip, -45, 'eraser', 1);
    await eraser.add([corner]);
    document.commit(await eraser.finish());
    assert(alpha(275, 260) === 0, 'Sampled eraser did not use destination-out.');
    document.undo();
    renderer.reset();
    const beforeRecovery = await draw();
    renderer.destroy();
    renderer = await createPaintRenderer(canvas, (message) => errors.push(message));
    assert(
      (await draw()).every((value, i) => value === beforeRecovery[i]),
      'Recovery changed sampled document pixels.'
    );
    const recoveredStroke = await begin(half);
    await recoveredStroke.add([{ ...sample, x: 400, y: 400 }]);
    document.commit(await recoveredStroke.finish());
    assert(alpha(350, 380) >= 126, 'Recovered renderer did not rasterize the sampled tip.');
    report('PASS: tile corners, undo/redo, sampled erasing and a new renderer preserve raster document behavior');
    const tip = await loadTip();
    document = createDocument();
    renderer.reset();
    const abrStroke = await begin(tip);
    await abrStroke.add([sample, { ...sample, x: 340, y: 300, time: 10 }]);
    document.commit(await abrStroke.finish());
    assert(document.active.tiles.size > 0, 'The actual ABR tip did not produce raster tiles.');
    await draw();
    report(`PASS: decoded repository ABR tip ${tip.width}×${tip.height} renders through the Studio engine`);
    await renderer.submitted();
    assert(errors.length === 0, errors.join('\n'));
    report('ALL SAMPLED BRUSH CHECKS PASSED');
  } finally {
    renderer.destroy();
    resources.dispose();
  }
}

async function readCanvas(canvas: OffscreenCanvas) {
  const bitmap = await createImageBitmap(canvas);
  const copy = new OffscreenCanvas(canvas.width, canvas.height);
  const context = copy.getContext('2d')!;
  context.drawImage(bitmap, 0, 0);
  bitmap.close();
  return context.getImageData(0, 0, copy.width, copy.height).data;
}
