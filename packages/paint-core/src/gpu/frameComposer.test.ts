import { expect, it } from 'vitest';
import { createDocument, TILE_BYTES, type Layer } from '../document';
import { mergeTilePixels } from '../layerMerge';
import { unpackTile } from '../tilePixels';
import { compositionSignature } from './frameComposer';

/**
 * A drawing of `Base` (opaque red), a folder holding `Ink` (half-transparent blue, Multiply) and `Shade` (green,
 * clipped to Ink), then `Top` (white at half opacity), and the same layers flat.
 */
function drawings() {
  const grouped = createDocument();
  const base = grouped.activeId;
  paint(grouped, base, [255, 0, 0, 255]);
  grouped.changeLayer({ type: 'add-group' });
  const folder = grouped.activeId;
  grouped.changeLayer({ type: 'add', place: { parentId: folder, side: 'above' } });
  const ink = grouped.activeId;
  grouped.changeLayer({ type: 'update', id: ink, patch: { blend: 'multiply' } });
  paint(grouped, ink, [0, 0, 128, 128]);
  grouped.changeLayer({ type: 'add', place: { parentId: folder, anchorId: ink, side: 'above' } });
  const shade = grouped.activeId;
  grouped.changeLayer({ type: 'update', id: shade, patch: { clipping: true } });
  paint(grouped, shade, [0, 255, 0, 255]);
  grouped.changeLayer({ type: 'add' });
  const top = grouped.activeId;
  grouped.changeLayer({ type: 'update', id: top, patch: { opacity: 0.5 } });
  paint(grouped, top, [255, 255, 255, 255]);

  const flat = createDocument();
  flat.replace(
    grouped.layers.map(({ parentId: _parentId, ...layer }) => ({ ...layer, tiles: new Map(layer.tiles) })),
    top
  );
  return { grouped, flat, ids: { base, folder, ink, shade, top } };
}

function paint(doc: ReturnType<typeof createDocument>, layerId: string, [r, g, b, a]: number[]) {
  const pixels = new Uint8Array(TILE_BYTES);
  for (let index = 0; index < TILE_BYTES; index += 4) pixels.set([r!, g!, b!, a!], index);
  doc.commit([{ layerId, key: '0,0', before: undefined, after: pixels }]);
}

/** Composites tile `0,0` of `layers` bottom to top on the CPU, with the frame composer's clipping-base rule. */
function composite(layers: readonly Layer[], linear: boolean) {
  let result: Uint8Array | undefined;
  let base: 'none' | 'hidden' | Uint8Array | undefined = 'none';
  for (const layer of layers) {
    const clipped = !!layer.clipping && base !== 'none';
    if (clipped && base === 'hidden') continue;
    if (!layer.visible || layer.opacity <= 0) {
      if (!clipped) base = 'hidden';
      continue;
    }

    const pixels = unpackTile(layer.tiles.get('0,0') as Uint8Array);
    if (!clipped) base = pixels;
    result = mergeTilePixels(
      result,
      pixels,
      layer.blend,
      layer.opacity,
      clipped ? { base: base as Uint8Array } : undefined,
      linear
    );
  }

  return result;
}

it('composites layers in visible folders exactly as the same layers flat', () => {
  const { grouped, flat } = drawings();
  expect(compositionSignature(grouped.layers)).toBe(compositionSignature(flat.layers));
  for (const linear of [false, true]) {
    expect(sameBytes(composite(grouped.layers, linear), composite(flat.layers, linear))).toBe(true);
  }
});

it('changes the composition when a folder is hidden, as hiding its layers does', () => {
  const { grouped, flat, ids } = drawings();
  const shown = compositionSignature(grouped.layers);
  grouped.changeLayer({ type: 'update', id: ids.folder, patch: { visible: false } });
  flat.changeLayer({ type: 'update', id: ids.ink, patch: { visible: false } });
  flat.changeLayer({ type: 'update', id: ids.shade, patch: { visible: false } });
  expect(compositionSignature(grouped.layers)).not.toBe(shown);
  expect(compositionSignature(grouped.layers)).toBe(compositionSignature(flat.layers));
  expect(sameBytes(composite(grouped.layers, true), composite(flat.layers, true))).toBe(true);
});

it('clips a layer right above a folder to the folder, which the composition signature tells apart', () => {
  const { grouped, flat, ids } = drawings();
  grouped.changeLayer({ type: 'update', id: ids.top, patch: { clipping: true } });
  flat.changeLayer({ type: 'update', id: ids.top, patch: { clipping: true } });
  expect(grouped.layers.at(-1)).toMatchObject({ clipping: true, clipGroup: { id: ids.folder, base: true } });
  // Flat, Top would clip to Shade alone; clipped to the folder, it shows through Ink and Shade.
  expect(compositionSignature(grouped.layers)).not.toBe(compositionSignature(flat.layers));
});

it('tells a folder’s blend mode, opacity and nesting apart in the composition signature', () => {
  const { grouped, ids } = drawings();
  const signatures = new Set([compositionSignature(grouped.layers)]);
  grouped.changeLayer({ type: 'update', id: ids.folder, patch: { opacity: 0.5 } });
  signatures.add(compositionSignature(grouped.layers));
  grouped.changeLayer({ type: 'update', id: ids.folder, patch: { blend: 'normal' } });
  signatures.add(compositionSignature(grouped.layers));
  grouped.changeLayer({ type: 'update', id: ids.folder, patch: { opacity: 1 } });
  signatures.add(compositionSignature(grouped.layers));
  grouped.changeLayer({ type: 'group', ids: [ids.folder] });
  grouped.changeLayer({ type: 'update', id: grouped.activeId, patch: { blend: 'screen' } });
  signatures.add(compositionSignature(grouped.layers));
  expect(signatures.size).toBe(5);
});

/** Whether two composited tiles hold the same bytes; a deep `toEqual` would walk them an element at a time. */
function sameBytes(a: Uint8Array | undefined, b: Uint8Array | undefined) {
  return !!a && !!b && Buffer.compare(a, b) === 0;
}
