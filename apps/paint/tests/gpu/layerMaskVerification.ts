import { createDocument, TILE_BYTES, type BlendMode, type GroupBlendMode } from '@app-game/paint-core/document';
import { createPaintRenderer } from '@app-game/paint-core/gpu/renderer';
import { paperColor } from '@app-game/paint-core/gpu/shaders';
import { MASK_TILE_PIXELS, type MaskPatch } from '@app-game/paint-core/layerMask';
import { composeStack, quantized, tileSources } from '@app-game/paint-core/layerStack';
import type { ShownLayer } from '@app-game/paint-core/layerTree';

/**
 * Renders drawings with layer masks through the real renderer and compares every presented pixel with the CPU
 * compositor (`composeStack`), presented over the same paper: masked rasters, inverted, disabled and Hide all masks,
 * a masked isolated folder, masked Pass Through folders at full and partial opacity (which fade by the mask), masked
 * clipping bases, a raster and folders, with clipped layers above, and a masked layer inside a masked folder; each
 * over a transparent and an opaque backdrop and in both blending settings. Every channel must be within 2 of the CPU
 * result, as `isolated-folders` allows.
 *
 * Then reports the cost of a full-view recomposition of 1920×1080 with 1, 8 and 32 layers covering the view, masked by
 * masks with tiles over the whole view, against the same layers without masks, and the GPU memory the masks add.
 */
export async function verifyLayerMasks(report: (message: string) => void) {
  let worst = 0;
  for (const linear of [false, true]) {
    for (const opaque of [false, true]) {
      for (const [name, build] of Object.entries(scenarios)) {
        const doc = createDocument();
        if (opaque) {
          addLayer(doc, null, 'Backdrop', [210, 190, 120], (x, y) => 128 + ((x + y) % 128), {});
        }

        build(doc);
        doc.setLinearBlending(linear);
        const shown = await renderImage(doc.layers, linear);
        const expected = await reference(doc.layers, linear);
        let error = 0;
        let differing = 0;
        for (let index = 0; index < shown.length; index++) {
          const difference = Math.abs(shown[index]! - expected[index]!);
          error = Math.max(error, difference);
          differing += Number(difference > 0);
        }

        worst = Math.max(worst, error);
        report(
          `${name}, ${opaque ? 'opaque' : 'transparent'} backdrop${linear ? ', smooth color' : ''}: max error ${error}, ${differing} of ${shown.length} channel values differ`
        );
      }
    }
  }

  report(`Largest channel error: ${worst} of 255`);
  if (worst > 2) {
    throw new Error(`Masks composited ${worst} levels away from the CPU compositor.`);
  }

  // Zoomed out, mask tiles show from reduced one-channel display textures with generated mips.
  for (const zoom of [0.5, 0.25, 0.1]) {
    const doc = createDocument();
    scenarios['two masked layers with an Overlay layer between']!(doc);
    const shown = await renderImage(doc.layers, false, zoom);
    const hidden = (
      await renderImage(
        doc.layers.map((layer) => ({ ...layer, mask: undefined })),
        false,
        zoom
      )
    ).some((value, index) => value !== shown[index]);
    report(`Zoomed to ${zoom * 100}%: rendered without errors, masks ${hidden ? 'show' : 'DO NOT show'}`);
    if (!hidden) {
      throw new Error(`Masks did not show at ${zoom * 100}%.`);
    }
  }

  for (const streaming of [true, false]) {
    for (const count of [1, 8, 32]) {
      const plain = await recomposition(count, false, streaming);
      const masked = await recomposition(count, true, streaming);
      report(
        `${count} layer${count > 1 ? 's' : ''} covering 1920×1080${streaming ? ', virtual texture on' : ', tiles only'}: ${masked.ms.toFixed(2)} ms per full frame with masks, ${plain.ms.toFixed(2)} ms without; masks add ${((masked.bytes - plain.bytes) / 1048576).toFixed(1)} MiB of GPU memory (${masked.tiles} resident and ${masked.display} display tiles against ${plain.tiles} and ${plain.display})`
      );
    }
  }
}

type Doc = ReturnType<typeof createDocument>;
type Rgb = [number, number, number];

/** Builders of the compared drawings, each adding its layers above the optional backdrop. */
const scenarios: Record<string, (doc: Doc) => void> = {
  // The flat path without masks, for the rounding the two compositors differ by.
  'no masks (flat path)': (doc) => {
    addLayer(doc, null, 'Red', [220, 40, 30], (x) => x, {});
    addLayer(doc, null, 'Ink', [40, 90, 200], (_x, y) => y, { blend: 'multiply', opacity: 0.7 });
  },
  'a masked raster': (doc) => {
    const id = addLayer(doc, null, 'Red', [220, 40, 30], () => 255, { opacity: 0.9 });
    addMask(doc, id, (x, y) => (x + y) >> 1);
  },
  'an inverted mask on a Multiply layer': (doc) => {
    const id = addLayer(doc, null, 'Ink', [40, 90, 200], (x) => 255 - x, { blend: 'multiply' });
    addMask(doc, id, (_x, y) => y, { inverted: true });
  },
  'a disabled mask': (doc) => {
    const id = addLayer(doc, null, 'Red', [220, 40, 30], (x) => x, {});
    addMask(doc, id, () => 0, { enabled: false });
  },
  'a Hide all mask revealing one tile edge': (doc) => {
    const id = addLayer(doc, null, 'Red', [220, 40, 30], () => 255, {});
    doc.commit([{ layerId: id, key: '1,0', before: undefined, after: solidTile([20, 200, 40], 255) }]);
    addMask(doc, id, (x) => (x > 200 ? 255 : 0), {}, 0);
  },
  'two masked layers with an Overlay layer between': (doc) => {
    const a = addLayer(doc, null, 'Warm', [240, 150, 40], (x, y) => (x * y) % 256, {});
    addMask(doc, a, (x) => x);
    addLayer(doc, null, 'Light', [250, 230, 120], (_x, y) => y, { blend: 'overlay' });
    const b = addLayer(doc, null, 'Cool', [30, 120, 220], () => 200, { blend: 'screen' });
    addMask(doc, b, (x, y) => (((x >> 4) + (y >> 4)) % 2 ? 255 : 30));
  },
  'a masked isolated Multiply folder at 70%': (doc) => {
    const folder = addFolder(doc, null, { blend: 'multiply', opacity: 0.7 });
    addLayer(doc, folder, 'Warm', [240, 150, 40], (x, y) => (x * y) % 256, {});
    addLayer(doc, folder, 'Cool', [30, 120, 220], (x) => 255 - x, { opacity: 0.8, blend: 'screen' });
    addMask(doc, folder, (x) => x);
  },
  'a masked Pass Through folder (fades by the mask)': (doc) => {
    const folder = addFolder(doc, null, {});
    addLayer(doc, folder, 'Shade', [90, 60, 160], (x) => x, { blend: 'multiply' });
    addLayer(doc, folder, 'Light', [250, 230, 120], (_x, y) => y, { blend: 'overlay', opacity: 0.9 });
    addMask(doc, folder, (x, y) => (x + 2 * y) % 256);
  },
  'a masked Pass Through folder at 60%': (doc) => {
    const folder = addFolder(doc, null, { opacity: 0.6 });
    addLayer(doc, folder, 'Shade', [90, 60, 160], () => 255, {});
    addMask(doc, folder, (_x, y) => 255 - y, { inverted: true });
  },
  'layers clipped to a masked raster': (doc) => {
    const base = addLayer(doc, null, 'Base', [120, 200, 220], (x, y) => (((x >> 4) + (y >> 4)) % 2 ? x : 255 - y), {});
    addMask(doc, base, (_x, y) => y);
    addLayer(doc, null, 'Clipped', [250, 60, 60], () => 255, { clipping: true });
    addLayer(doc, null, 'Also clipped', [60, 60, 250], (x) => x, { clipping: true, blend: 'overlay' });
  },
  'a clipped layer with a mask of its own over a masked base': (doc) => {
    const base = addLayer(doc, null, 'Base', [120, 200, 220], () => 255, { opacity: 0.8 });
    addMask(doc, base, (x) => x);
    const clipped = addLayer(doc, null, 'Clipped', [250, 60, 60], () => 255, { clipping: true });
    addMask(doc, clipped, (_x, y) => y, { inverted: true });
  },
  'layers clipped to a masked isolated folder': (doc) => {
    const folder = addFolder(doc, null, { blend: 'normal', opacity: 0.5 });
    addLayer(doc, folder, 'Under', [120, 200, 220], (x, y) => (x ^ y) & 255, {});
    addMask(doc, folder, (_x, y) => y);
    addLayer(doc, null, 'Clipped', [250, 200, 30], (x) => x, { clipping: true });
  },
  'a layer clipped to a masked Pass Through folder': (doc) => {
    const folder = addFolder(doc, null, {});
    addLayer(doc, folder, 'Under', [120, 200, 220], (x) => x, { blend: 'multiply' });
    addMask(doc, folder, (x, y) => (x + y) >> 1, { inverted: true });
    addLayer(doc, null, 'Clipped', [30, 250, 60], () => 255, { clipping: true, opacity: 0.8 });
  },
  'a masked layer inside a masked folder': (doc) => {
    const folder = addFolder(doc, null, { blend: 'screen', opacity: 0.9 });
    const inner = addLayer(doc, folder, 'Inner', [200, 70, 140], () => 230, {});
    addMask(doc, inner, (x) => 255 - x);
    addMask(doc, folder, (_x, y) => y);
  }
};

/** Adds a folder at the top of folder `parent` (the root for `null`) with `patch`; returns its id. */
function addFolder(doc: Doc, parent: string | null, patch: { blend?: GroupBlendMode; opacity?: number }) {
  doc.changeLayer({ type: 'add-group', place: { parentId: parent, side: 'above' } });
  const id = doc.activeId;
  if (Object.keys(patch).length) {
    doc.changeLayer({ type: 'update', id, patch });
  }

  return id;
}

/**
 * Adds a raster at the top of folder `parent` (the root for `null`) whose tile 0,0 is `color` at the premultiplied
 * alpha `alpha(x, y)`, with `patch`; returns its id.
 */
function addLayer(
  doc: Doc,
  parent: string | null,
  name: string,
  color: Rgb,
  alpha: (x: number, y: number) => number,
  patch: { blend?: BlendMode; opacity?: number; clipping?: boolean }
) {
  doc.changeLayer({ type: 'add', place: { parentId: parent, side: 'above' } });
  const id = doc.activeId;
  doc.changeLayer({ type: 'update', id, patch: { name, ...patch } });
  const pixels = new Uint8Array(TILE_BYTES);
  for (let y = 0; y < 256; y++) {
    for (let x = 0; x < 256; x++) {
      const a = alpha(x, y);
      pixels.set([...color.map((channel) => Math.round((channel * a) / 255)), a], (y * 256 + x) * 4);
    }
  }

  doc.commit([{ layerId: id, key: '0,0', before: undefined, after: pixels }]);
  return id;
}

/** Gives node `id` a mask whose tile 0,0 has stored coverage `value(x, y)`, then `patch`, over `outside`. */
function addMask(doc: Doc, id: string, value: (x: number, y: number) => number, patch: MaskPatch = {}, outside = 255) {
  doc.changeLayer({ type: 'add-mask', id });
  const tile = new Uint8Array(MASK_TILE_PIXELS);
  for (let y = 0; y < 256; y++) {
    for (let x = 0; x < 256; x++) {
      tile[y * 256 + x] = value(x, y);
    }
  }

  const mask = doc.node(id)!.mask!;
  if (outside !== mask.outside) {
    // A Hide all mask: the drawing's own saved form carries `outside`; set it through a replaced tree.
    const nodes = doc.nodes.map((node) => (node.id === id ? { ...node, mask: { ...mask, outside } } : node));
    doc.replace(nodes, doc.activeId, doc.linearBlending());
  }

  const current = doc.node(id)!.mask!;
  doc.commit([{ layerId: current.id, key: '0,0', before: undefined, after: tile }]);
  if (Object.keys(patch).length) {
    doc.changeLayer({ type: 'update-mask', id, patch });
  }
}

function solidTile(color: Rgb, alpha: number) {
  const pixels = new Uint8Array(TILE_BYTES);
  for (let index = 0; index < TILE_BYTES; index += 4) {
    pixels.set([...color.map((channel) => Math.round((channel * alpha) / 255)), alpha], index);
  }

  return pixels;
}

/** The CPU composite of tile 0,0, resolved to 8 bits and presented over the paper as `presentFragment` does. */
async function reference(layers: ShownLayer[], linear: boolean): Promise<Uint8ClampedArray> {
  const sources = tileSources('0,0', (data) => data as Uint8Array);
  const image = quantized(
    await composeStack(layers, TILE_BYTES / 4, sources.read, linear, undefined, sources.readMask)
  );
  const out = new Uint8ClampedArray(image.length);
  for (let index = 0; index < image.length; index += 4) {
    const alpha = image[index + 3]! / 255;
    for (let channel = 0; channel < 3; channel++) {
      out[index + channel] = Math.round((image[index + channel]! / 255 + paperColor[channel]! * (1 - alpha)) * 255);
    }

    out[index + 3] = 255;
  }

  return out;
}

/** The presented pixels of tile 0,0 at 100%. */
async function renderImage(layers: ShownLayer[], linear: boolean, zoom = 1): Promise<Uint8ClampedArray> {
  const errors: string[] = [];
  const canvas = new OffscreenCanvas(256, 256);
  const renderer = await createPaintRenderer(canvas, (message) => errors.push(message));
  renderer.setLinearBlending(linear);
  try {
    await renderer.render(
      layers,
      { x: 128, y: 128, zoom, angle: 0, mirrored: false },
      { width: 256, height: 256 },
      1,
      true
    );
    await renderer.submitted();
    const bitmap = await createImageBitmap(await canvas.convertToBlob());
    const copy = new OffscreenCanvas(bitmap.width, bitmap.height).getContext('2d')!;
    copy.drawImage(bitmap, 0, 0);
    if (errors.length) {
      throw new Error(errors.join('\n'));
    }

    return copy.getImageData(0, 0, 256, 256).data;
  } finally {
    renderer.destroy();
  }
}

/**
 * Median GPU-inclusive time to recompose a 1920×1080 view of `count` translucent layers covering it over an opaque
 * backdrop, each with a mask whose tiles cover it too when `masked`; and the renderer's GPU bytes and tile counts.
 */
async function recomposition(count: number, masked: boolean, streaming: boolean) {
  const size = { width: 1920, height: 1080 };
  const columns = Math.ceil(size.width / 256),
    rows = Math.ceil(size.height / 256);
  // Paged, as a drawing kept in storage is: shared tile versions would otherwise count once per layer.
  const doc = createDocument({ paged: true });
  const cover = (layerId: string, tile: Uint8Array) => {
    const changes = [];
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < columns; x++) {
        changes.push({ layerId, key: `${x},${y}`, before: undefined, after: tile });
      }
    }

    doc.commit(changes);
  };
  cover(doc.activeId, solidTile([30, 40, 60], 255));
  const coverage = new Uint8Array(MASK_TILE_PIXELS);
  for (let index = 0; index < coverage.length; index++) {
    coverage[index] = (index * 7) & 255;
  }

  for (let layer = 0; layer < count; layer++) {
    doc.changeLayer({ type: 'add' });
    const id = doc.activeId;
    cover(id, solidTile([230, 180 - layer * 4, 90], 128));
    if (masked) {
      doc.changeLayer({ type: 'add-mask', id });
      cover(doc.node(id)!.mask!.id, coverage);
    }
  }

  // As the editor runs it: committed pixels stream through the virtual texture, masks are drawn from their tiles.
  const renderer = await createPaintRenderer(new OffscreenCanvas(size.width, size.height), () => {}, {
    cacheTiles: 1024,
    ...(streaming ? { virtualTexture: true, readTile: async (data) => data as Uint8Array } : {})
  });
  try {
    const camera = { x: size.width / 2, y: size.height / 2, zoom: 1, angle: 0, mirrored: false };
    await renderer.prepareOverview(doc.layers);
    await renderer.render(doc.layers, camera, size, 1);
    await renderer.submitted();
    await renderer.render(doc.layers, camera, size, 1);
    await renderer.submitted();
    const times: number[] = [];
    for (let frame = 0; frame < 15; frame++) {
      renderer.invalidateView();
      const start = performance.now();
      await renderer.render(doc.layers, camera, size, 1);
      await renderer.submitted();
      times.push(performance.now() - start);
    }

    const stats = renderer.stats();
    return {
      ms: times.sort((a, b) => a - b)[7]!,
      bytes: stats.gpuBytes,
      tiles: stats.residentTiles,
      display: stats.displayTiles
    };
  } finally {
    renderer.destroy();
  }
}
