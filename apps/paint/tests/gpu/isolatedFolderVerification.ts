import { createDocument, TILE_BYTES, type BlendMode, type GroupBlendMode } from '@app-game/paint-core/document';
import { createPaintRenderer } from '@app-game/paint-core/gpu/renderer';
import { paperColor } from '@app-game/paint-core/gpu/shaders';
import { composeStack, quantized } from '@app-game/paint-core/layerStack';
import { MAX_FOLDER_DEPTH, type ShownLayer } from '@app-game/paint-core/layerTree';
import { unpackTile } from '@app-game/paint-core/tilePixels';

/**
 * Renders drawings with folders that composite on their own through the real renderer and compares every presented
 * pixel with the CPU compositor (`composeStack`), presented over the same paper: isolated folders in each blend mode
 * at fractional opacity, fading Pass Through folders, nested folders down to `MAX_FOLDER_DEPTH`, layers clipped to
 * isolated, fading and Pass Through folders, and hidden and empty clipping bases; each over a transparent and an
 * opaque backdrop, so a folder that leaked its backdrop would show, and in both blending settings. Every channel must
 * be within 2 of the CPU result, as `layer-composite` allows against its exact formulas.
 *
 * Then reports the cost of a full-view recomposition of 1920×1080 for nesting depths 1, 3 and `MAX_FOLDER_DEPTH`,
 * against the same layers in plain Pass Through folders: the frame time and the further composition textures it held.
 */
export async function verifyIsolatedFolders(report: (message: string) => void) {
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
    throw new Error(`Folders composited ${worst} levels away from the CPU compositor.`);
  }

  for (const covering of [true, false]) {
    for (const depth of [1, 3, MAX_FOLDER_DEPTH]) {
      const nested = await recomposition(depth, 'normal', covering);
      const flat = await recomposition(depth, 'pass-through', covering);
      report(
        `Depth ${depth}, 1920×1080 full view, layers ${covering ? 'covering the view' : 'of one tile'}: ${nested.ms.toFixed(2)} ms per frame with isolated folders, ${flat.ms.toFixed(2)} ms in Pass Through folders; ${nested.textures} further composition textures, ${(nested.bytes / 1048576).toFixed(1)} MiB`
      );
    }
  }
}

type Doc = ReturnType<typeof createDocument>;
type Rgb = [number, number, number];

/** Builders of the compared drawings, each adding its layers above the optional backdrop. */
const scenarios: Record<string, (doc: Doc) => void> = {
  // The flat path against the CPU compositor, for the rounding the two differ by without folders.
  'no folders (flat path)': (doc) => {
    addLayer(doc, null, 'Red', [220, 40, 30], (x) => x, {});
    addLayer(doc, null, 'Ink', [40, 90, 200], (_x, y) => y, { blend: 'multiply', opacity: 0.7 });
    addLayer(doc, null, 'Light', [250, 230, 120], (x, y) => (x + y) % 256, { blend: 'overlay', clipping: true });
  },
  'isolated Normal folder at 60% over a Multiply layer': (doc) => {
    const folder = addFolder(doc, null, { blend: 'normal', opacity: 0.6 });
    addLayer(doc, folder, 'Red', [220, 40, 30], (x) => x, {});
    addLayer(doc, folder, 'Ink', [40, 90, 200], (_x, y) => y, { blend: 'multiply' });
  },
  ...Object.fromEntries(
    (['normal', 'multiply', 'screen', 'overlay'] as const).map((blend) => [
      `${blend} folder at 70%`,
      (doc: Doc) => {
        const folder = addFolder(doc, null, { blend, opacity: 0.7 });
        addLayer(doc, folder, 'Warm', [240, 150, 40], (x, y) => (x * y) % 256, {});
        addLayer(doc, folder, 'Cool', [30, 120, 220], (x) => 255 - x, { opacity: 0.8, blend: 'screen' });
      }
    ])
  ),
  'Pass Through folder at 45% with Multiply and Overlay layers': (doc) => {
    const folder = addFolder(doc, null, { opacity: 0.45 });
    addLayer(doc, folder, 'Shade', [90, 60, 160], (x) => x, { blend: 'multiply' });
    addLayer(doc, folder, 'Light', [250, 230, 120], (_x, y) => y, { blend: 'overlay', opacity: 0.9 });
  },
  'nested folders: Screen in Overlay in Normal at 60%': (doc) => {
    const outer = addFolder(doc, null, { blend: 'normal', opacity: 0.6 });
    addLayer(doc, outer, 'Bottom', [30, 160, 90], (x, y) => (x + 2 * y) % 256, {});
    const middle = addFolder(doc, outer, { blend: 'overlay', opacity: 0.85 });
    addLayer(doc, middle, 'Middle', [200, 70, 140], (x) => x, {});
    const inner = addFolder(doc, middle, { blend: 'screen', opacity: 0.5 });
    addLayer(doc, inner, 'Inner', [250, 250, 80], (_x, y) => y, { blend: 'multiply' });
    addLayer(doc, outer, 'Glaze', [20, 20, 120], (x) => 255 - x, { opacity: 0.3 });
  },
  'layers clipped to an isolated folder': (doc) => {
    const folder = addFolder(doc, null, { blend: 'multiply', opacity: 0.5 });
    addLayer(doc, folder, 'Mask', [120, 200, 220], (x, y) => (((x >> 4) + (y >> 4)) % 2 ? x : 255 - y), {});
    addLayer(doc, null, 'Clipped', [250, 60, 60], () => 255, { clipping: true });
    addLayer(doc, null, 'Also clipped', [60, 60, 250], (x) => x, { clipping: true, blend: 'overlay' });
  },
  'layers clipped to a Pass Through folder': (doc) => {
    const folder = addFolder(doc, null, {});
    addLayer(doc, folder, 'Under', [120, 200, 220], (x) => x, { blend: 'multiply' });
    addLayer(doc, folder, 'Over', [200, 100, 40], (_x, y) => y, { opacity: 0.6 });
    addLayer(doc, null, 'Clipped', [30, 250, 60], () => 255, { clipping: true, opacity: 0.8 });
  },
  'a layer clipped to a fading Pass Through folder': (doc) => {
    const folder = addFolder(doc, null, { opacity: 0.4 });
    addLayer(doc, folder, 'Under', [120, 200, 220], (x, y) => (x ^ y) & 255, { blend: 'screen' });
    addLayer(doc, null, 'Clipped', [250, 200, 30], (x) => x, { clipping: true });
  },
  'a clipped layer whose folder base is hidden': (doc) => {
    const folder = addFolder(doc, null, { blend: 'normal', opacity: 0.8 });
    addLayer(doc, folder, 'Hidden', [120, 200, 220], (x) => x, {});
    doc.changeLayer({ type: 'update', id: folder, patch: { visible: false } });
    addLayer(doc, null, 'Clipped', [250, 60, 60], () => 255, { clipping: true });
    addLayer(doc, null, 'Above', [60, 60, 250], (_x, y) => y, {});
  },
  'a clipped layer whose folder base is empty': (doc) => {
    addFolder(doc, null, { blend: 'screen' });
    addLayer(doc, null, 'Clipped', [250, 60, 60], () => 255, { clipping: true });
  },
  [`${MAX_FOLDER_DEPTH} nested folders`]: (doc) => {
    const blends: GroupBlendMode[] = ['normal', 'multiply', 'pass-through', 'screen', 'overlay'];
    let parent: string | null = null;
    for (let depth = 0; depth < MAX_FOLDER_DEPTH; depth++) {
      const blend = blends[depth % blends.length]!;
      parent = addFolder(doc, parent, { blend, opacity: blend === 'pass-through' ? 0.75 : 0.9 });
      addLayer(
        doc,
        parent,
        `Level ${depth}`,
        [(40 * depth) % 256, 200 - 15 * depth, 90 + 12 * depth],
        (x, y) => (x + y * depth) % 256,
        { opacity: 0.85 }
      );
    }
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

/** The CPU composite of tile 0,0, resolved to 8 bits and presented over the paper as `presentFragment` does. */
async function reference(layers: ShownLayer[], linear: boolean): Promise<Uint8ClampedArray> {
  const image = quantized(
    await composeStack(
      layers,
      TILE_BYTES / 4,
      (layer) => {
        const data = layer.tiles.get('0,0');
        return data && unpackTile(data as Uint8Array);
      },
      linear
    )
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
async function renderImage(layers: ShownLayer[], linear: boolean): Promise<Uint8ClampedArray> {
  const errors: string[] = [];
  const canvas = new OffscreenCanvas(256, 256);
  const renderer = await createPaintRenderer(canvas, (message) => errors.push(message));
  renderer.setLinearBlending(linear);
  try {
    await renderer.render(
      layers,
      { x: 128, y: 128, zoom: 1, angle: 0, mirrored: false },
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
 * Median GPU-inclusive time to recompose a 1920×1080 view of `depth` nested folders blending as `blend`, each holding
 * one translucent layer that covers the view, or only its first tile without `covering`, over an opaque backdrop; and
 * the further composition textures the frame held, with their bytes.
 */
async function recomposition(depth: number, blend: GroupBlendMode, covering: boolean) {
  const size = { width: 1920, height: 1080 };
  const doc = createDocument();
  const cover = (layerId: string, color: Rgb, alpha: number) => {
    const pixels = new Uint8Array(TILE_BYTES);
    for (let index = 0; index < TILE_BYTES; index += 4) {
      pixels.set([...color.map((channel) => Math.round((channel * alpha) / 255)), alpha], index);
    }

    const changes = [];
    for (let y = 0; y < (covering ? Math.ceil(size.height / 256) : 1); y++) {
      for (let x = 0; x < (covering ? Math.ceil(size.width / 256) : 1); x++) {
        changes.push({ layerId, key: `${x},${y}`, before: undefined, after: pixels });
      }
    }

    doc.commit(changes);
  };
  cover(doc.activeId, [30, 40, 60], 255);
  let parent: string | null = null;
  for (let level = 0; level < depth; level++) {
    parent = addFolder(doc, parent, blend === 'pass-through' ? {} : { blend, opacity: 0.8 });
    doc.changeLayer({ type: 'add', place: { parentId: parent, side: 'above' } });
    cover(doc.activeId, [230, 180 - 10 * level, 90], 128);
  }

  const renderer = await createPaintRenderer(new OffscreenCanvas(size.width, size.height), () => {}, {
    cacheTiles: 1024
  });
  try {
    const camera = { x: size.width / 2, y: size.height / 2, zoom: 1, angle: 0, mirrored: false };
    await renderer.render(doc.layers, camera, size, 1);
    await renderer.submitted();
    const times: number[] = [];
    for (let frame = 0; frame < 25; frame++) {
      renderer.invalidateView();
      const start = performance.now();
      await renderer.render(doc.layers, camera, size, 1);
      await renderer.submitted();
      times.push(performance.now() - start);
    }

    const textures = renderer.stats().scratchTextures;
    return { ms: times.sort((a, b) => a - b)[12]!, textures, bytes: textures * size.width * size.height * 8 };
  } finally {
    renderer.destroy();
  }
}
