import { defaultBrush, type Brush } from '@app-game/paint-core/brush';
import { createDocument, TILE_BYTES, type DocumentNode } from '@app-game/paint-core/document';
import { maskPlane } from '@app-game/paint-core/gpu/maskPlane';
import { createPaintRenderer } from '@app-game/paint-core/gpu/renderer';
import { MASK_TILE_PIXELS, maskCoverage, type LayerMask } from '@app-game/paint-core/layerMask';
import { maskStrokeBrush } from '@app-game/paint-core/maskStroke';

/**
 * Paints masks through the real renderer, as the runtime does on a mask target (`maskStrokeBrush` on the mask's
 * plane), and checks the committed stored coverage against hand-computed bytes: a hard dab at half opacity moves the
 * mask half way, `old + 0.5 × (goal − old)`, towards Reveal (255), Hide (0) or, with the eraser, Hide; an inverted mask
 * stores the goals reversed; a stroke that leaves a tile all `outside` commits no tile; and pixels outside the dab keep
 * their coverage. Checks that the stroke in progress shows on the canvas before it is committed, the mask's own
 * damage. Then reports the frame cost of a mask stroke in progress against a stroke on the layer's pixels.
 */
export async function verifyMaskPainting(report: (message: string) => void) {
  const cases: {
    name: string;
    outside: number;
    inverted?: boolean;
    color?: string;
    tool?: Brush['tool'];
    opacity?: number;
    center: number;
    tile: boolean;
  }[] = [
    { name: 'Reveal on Hide all', outside: 0, color: '#ffffff', center: 128, tile: true },
    { name: 'Hide on Reveal all', outside: 255, color: '#000000', center: 127, tile: true },
    { name: 'the eraser on Reveal all', outside: 255, tool: 'eraser', center: 127, tile: true },
    {
      name: 'Reveal on an inverted Reveal all (hidden)',
      outside: 255,
      inverted: true,
      color: '#ffffff',
      center: 127,
      tile: true
    },
    {
      name: 'the eraser on an inverted Hide all (shown)',
      outside: 0,
      inverted: true,
      tool: 'eraser',
      center: 128,
      tile: true
    },
    { name: 'full Reveal on Reveal all', outside: 255, color: '#ffffff', opacity: 1, center: 255, tile: false }
  ];
  for (const test of cases) {
    const doc = maskedDrawing(test.outside, test.inverted);
    const mask = doc.activeMask!;
    const errors: string[] = [];
    const canvas = new OffscreenCanvas(256, 256);
    const renderer = await createPaintRenderer(canvas, (message) => errors.push(message));
    try {
      const camera = { x: 128, y: 128, zoom: 1, angle: 0, mirrored: false };
      const size = { width: 256, height: 256 };
      await renderer.render(doc.layers, camera, size, 1);
      const before = await renderer.readPresented();
      const brush: Brush = {
        ...defaultBrush(),
        color: test.color ?? '#000000',
        tool: test.tool ?? 'brush',
        hardness: 1,
        opacity: test.opacity ?? 0.5,
        flow: 1,
        pressureSize: false
      };
      renderer.begin(maskPlane(mask), maskStrokeBrush(brush, mask, test.color === '#000000' ? 0 : 255));
      await renderer.paint([{ x: 128.5, y: 128.5, radius: 40, flow: 1 }]);
      await renderer.render(doc.layers, camera, size, 1);
      const during = await renderer.readPresented();
      const live = during.data.some((value, index) => value !== before.data[index]);
      const changes = await renderer.finish();
      doc.commit(changes);
      const stored = doc.activeMask!.tiles.get('0,0');
      const coverage = maskCoverage(stored as Uint8Array | undefined, test.outside);
      const center = coverage[128 * 256 + 128]!;
      const corner = coverage[0]!;
      const failures = [
        Math.abs(center - test.center) > 1 && `centre ${center}, expected ${test.center}`,
        corner !== test.outside && `corner ${corner}, expected ${test.outside}`,
        !!stored !== test.tile && (test.tile ? 'no tile committed' : 'a tile of only `outside` was committed'),
        test.tile && !live && 'the stroke did not show before it was committed',
        changes.some((change) => change.layerId !== mask.id) && 'a change outside the mask plane',
        errors.length && errors.join('\n')
      ].filter(Boolean);
      report(
        `${test.name}: centre ${center}, corner ${corner}, ${stored ? 'one tile' : 'no tile'}${live ? ', shown live' : ''}`
      );
      if (failures.length) {
        throw new Error(`${test.name}: ${failures.join('; ')}`);
      }
    } finally {
      renderer.destroy();
    }
  }

  await verifyOverlay(report);

  for (const target of ['pixels', 'mask'] as const) {
    report(
      `Stroke in progress on the ${target}, 1920×1080, masked layer covering the view: ${(await strokeFrame(target)).toFixed(2)} ms per frame`
    );
  }
}

/**
 * The red overlay shows on the presented canvas, in proportion to what the mask hides, and never in the composed image
 * that exports, captures and colour sampling read, nor in an exact render.
 */
async function verifyOverlay(report: (message: string) => void) {
  const doc = maskedDrawing(255);
  const mask = doc.activeMask!;
  // Hide the left half of tile 0,0.
  const coverage = new Uint8Array(MASK_TILE_PIXELS).fill(255);
  for (let y = 0; y < 256; y++) {
    coverage.fill(0, y * 256, y * 256 + 128);
  }

  doc.commit([{ layerId: mask.id, key: '0,0', before: undefined, after: coverage }]);
  const canvas = new OffscreenCanvas(256, 256);
  const errors: string[] = [];
  const renderer = await createPaintRenderer(canvas, (message) => errors.push(message));
  const camera = { x: 128, y: 128, zoom: 1, angle: 0, mirrored: false };
  const size = { width: 256, height: 256 };
  const shown = async () => {
    const bitmap = await createImageBitmap(await canvas.convertToBlob());
    const copy = new OffscreenCanvas(256, 256).getContext('2d')!;
    copy.drawImage(bitmap, 0, 0);
    return copy.getImageData(0, 0, 256, 256).data;
  };
  try {
    await renderer.render(doc.layers, camera, size, 1);
    const plain = await shown();
    const composedPlain = (await renderer.readPresented()).data;
    renderer.setMaskOverlay(doc.activeMask, 0.5);
    await renderer.render(doc.layers, camera, size, 1);
    const overlaid = await shown();
    const composed = (await renderer.readPresented()).data;
    await renderer.render(doc.layers, camera, size, 1, true);
    const exact = await shown();
    const at = (pixels: Uint8ClampedArray, x: number, y: number) => [
      ...pixels.subarray((y * 256 + x) * 4, (y * 256 + x) * 4 + 3)
    ];
    const hiddenBefore = at(plain, 64, 64),
      hiddenAfter = at(overlaid, 64, 64);
    const shownBefore = at(plain, 192, 64),
      shownAfter = at(overlaid, 192, 64);
    const redder = hiddenAfter[0]! > hiddenBefore[0]! && hiddenAfter[1]! < hiddenBefore[1]!;
    const same = (a: Uint8ClampedArray, b: Uint8ClampedArray) => a.every((value, index) => value === b[index]);
    const failures = [
      !redder && `hidden pixel ${hiddenBefore} → ${hiddenAfter}, not redder`,
      shownAfter.join() !== shownBefore.join() && `revealed pixel ${shownBefore} → ${shownAfter}`,
      !same(composed, composedPlain) && 'the composed image has the overlay',
      !same(exact, plain) && 'an exact render has the overlay',
      errors.length && errors.join('; ')
    ].filter(Boolean);
    report(
      `Red overlay: hidden ${hiddenBefore} → ${hiddenAfter}, revealed ${shownAfter}; composed and exact images unchanged: ${failures.length ? 'no' : 'yes'}`
    );
    if (failures.length) {
      throw new Error(`Red overlay: ${failures.join('; ')}`);
    }
  } finally {
    renderer.destroy();
  }
}

/** A drawing with one opaque layer at tile 0,0 whose mask, the paint target, has `outside` and `inverted`. */
function maskedDrawing(outside: number, inverted = false) {
  const doc = createDocument();
  const id = doc.activeId;
  const pixels = new Uint8Array(TILE_BYTES);
  for (let index = 0; index < TILE_BYTES; index += 4) {
    pixels.set([200, 80, 40, 255], index);
  }

  doc.commit([{ layerId: id, key: '0,0', before: undefined, after: pixels }]);
  doc.changeLayer({ type: 'add-mask', id });
  const mask: LayerMask = { ...doc.node(id)!.mask!, outside, inverted };
  const nodes = doc.nodes.map((node): DocumentNode => (node.id === id ? { ...node, mask } : node));
  doc.replace(nodes, id, doc.linearBlending(), undefined, true);
  return doc;
}

/** Median frame time while a stroke on `target` is in progress, over a 1920×1080 masked layer covering the view. */
async function strokeFrame(target: 'pixels' | 'mask') {
  const size = { width: 1920, height: 1080 };
  const doc = createDocument({ paged: true });
  const id = doc.activeId;
  const pixels = new Uint8Array(TILE_BYTES).fill(200);
  const coverage = new Uint8Array(MASK_TILE_PIXELS).fill(180);
  doc.changeLayer({ type: 'add-mask', id });
  const maskId = doc.node(id)!.mask!.id;
  const changes = [];
  for (let y = 0; y < Math.ceil(size.height / 256); y++) {
    for (let x = 0; x < Math.ceil(size.width / 256); x++) {
      changes.push({ layerId: id, key: `${x},${y}`, before: undefined, after: pixels });
      changes.push({ layerId: maskId, key: `${x},${y}`, before: undefined, after: coverage });
    }
  }

  doc.commit(changes);
  const renderer = await createPaintRenderer(new OffscreenCanvas(size.width, size.height), () => {}, {
    cacheTiles: 1024,
    virtualTexture: true,
    readTile: async (data) => data as Uint8Array
  });
  try {
    const camera = { x: size.width / 2, y: size.height / 2, zoom: 1, angle: 0, mirrored: false };
    await renderer.prepareOverview(doc.layers);
    await renderer.render(doc.layers, camera, size, 1);
    await renderer.submitted();
    const brush: Brush = { ...defaultBrush(), color: '#000000', size: 60, pressureSize: false };
    const mask = doc.node(id)!.mask!;
    renderer.begin(
      target === 'mask' ? maskPlane(mask) : doc.layers[0]!,
      target === 'mask' ? maskStrokeBrush(brush, mask, 0) : brush
    );
    const times: number[] = [];
    for (let step = 0; step < 30; step++) {
      await renderer.paint([{ x: 300 + step * 40, y: 500, radius: 30, flow: 0.35 }]);
      const start = performance.now();
      await renderer.render(doc.layers, camera, size, 1);
      await renderer.submitted();
      times.push(performance.now() - start);
    }

    await renderer.finish();
    return times.sort((a, b) => a - b)[15]!;
  } finally {
    renderer.destroy();
  }
}
