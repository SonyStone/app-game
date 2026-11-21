import { createDocument, TILE_BYTES, type Layer } from '@app-game/paint-core/document';
import { createPaintRenderer } from '@app-game/paint-core/gpu/renderer';

/**
 * Renders a drawing whose layers sit in folders, and the same layers flat, through the real renderer and compares
 * every presented pixel: folders are Pass Through at full strength, so they must composite exactly as the flat stack.
 * Covers a clipped layer inside a folder, a hidden folder, and a clipped layer right above a folder, which shows
 * unclipped as clipping to a folder is not supported; in both blending modes.
 */
export async function verifyLayerFolders(report: (message: string) => void) {
  for (const linear of [false, true]) {
    for (const variant of ['visible folder', 'hidden folder', 'clipped above folder'] as const) {
      const { grouped, flat } = drawings(variant);
      const shown = await renderImage(grouped.layers, linear);
      const expected = await renderImage(flat.layers, linear);
      let differing = 0;
      for (let index = 0; index < shown.length; index++) {
        if (shown[index] !== expected[index]) {
          differing++;
        }
      }

      report(`${variant}${linear ? ' (smooth color)' : ''}: ${differing} of ${shown.length} channel values differ`);
      if (differing) {
        throw new Error(`Folders composited differently from the same layers flat (${variant}).`);
      }
    }
  }
}

/**
 * `Base`, a folder of `Ink` (Multiply) and `Shade` (clipped to Ink), and `Top` at half opacity, each with its own
 * alpha ramp; and the same layers flat, with the visibility and clipping they show with.
 */
function drawings(variant: 'visible folder' | 'hidden folder' | 'clipped above folder') {
  const grouped = createDocument();
  const base = grouped.activeId;
  paint(grouped, base, [250, 240, 220], (x) => 255 - x);
  grouped.changeLayer({ type: 'add-group' });
  const folder = grouped.activeId;
  grouped.changeLayer({ type: 'add', place: { parentId: folder, side: 'above' } });
  const ink = grouped.activeId;
  grouped.changeLayer({ type: 'update', id: ink, patch: { blend: 'multiply' } });
  paint(grouped, ink, [20, 60, 160], (x, y) => (x + y) % 256);
  grouped.changeLayer({ type: 'add', place: { parentId: folder, anchorId: ink, side: 'above' } });
  const shade = grouped.activeId;
  grouped.changeLayer({ type: 'update', id: shade, patch: { clipping: true } });
  paint(grouped, shade, [200, 40, 40], (_x, y) => y);
  grouped.changeLayer({ type: 'add' });
  const top = grouped.activeId;
  grouped.changeLayer({
    type: 'update',
    id: top,
    patch: { opacity: 0.5, clipping: variant === 'clipped above folder' }
  });
  paint(grouped, top, [255, 255, 255], (x) => x);
  if (variant === 'hidden folder') {
    grouped.changeLayer({ type: 'update', id: folder, patch: { visible: false } });
  }

  const flat = createDocument();
  flat.replace(
    grouped.layers.map(({ parentId: _parentId, ...layer }) => ({ ...layer, tiles: new Map(layer.tiles) })),
    top
  );
  return { grouped, flat };
}

/** Fills tile 0,0 of layer `layerId` with `color` at the premultiplied alpha `alpha(x, y)`. */
function paint(
  doc: ReturnType<typeof createDocument>,
  layerId: string,
  color: [number, number, number],
  alpha: (x: number, y: number) => number
) {
  const pixels = new Uint8Array(TILE_BYTES);
  for (let y = 0; y < 256; y++) {
    for (let x = 0; x < 256; x++) {
      const a = alpha(x, y);
      pixels.set([...color.map((channel) => Math.round((channel * a) / 255)), a], (y * 256 + x) * 4);
    }
  }

  doc.commit([{ layerId, key: '0,0', before: undefined, after: pixels }]);
}

/** The presented pixels of tile 0,0 at 100%, exactly. */
async function renderImage(layers: Layer[], linear: boolean): Promise<Uint8ClampedArray> {
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
