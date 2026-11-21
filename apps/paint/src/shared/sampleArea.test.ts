import { createDocument, TILE_BYTES } from '@app-game/paint-core/document';
import { coverageReader, MASK_TILE_PIXELS } from '@app-game/paint-core/layerMask';
import { composeStack, quantized } from '@app-game/paint-core/layerStack';
import { unpackTile, type TileData } from '@app-game/paint-core/tilePixels';
import { expect, it } from 'vitest';
import { sampleArea } from './sampleArea';

/** A drawing of an opaque base and a folder holding a translucent Multiply layer, each filling tile 0,0. */
function drawing() {
  const doc = createDocument();
  const fill = (layerId: string, rgba: number[]) => {
    const pixels = new Uint8Array(TILE_BYTES);
    for (let index = 0; index < TILE_BYTES; index += 4) {
      pixels.set(rgba, index);
    }

    doc.commit([{ layerId, key: '0,0', before: undefined, after: pixels }]);
  };
  fill(doc.activeId, [200, 160, 120, 255]);
  doc.changeLayer({ type: 'add-group' });
  const folder = doc.activeId;
  doc.changeLayer({ type: 'add', place: { parentId: folder, side: 'above' } });
  const ink = doc.activeId;
  doc.changeLayer({ type: 'update', id: ink, patch: { blend: 'multiply' } });
  fill(ink, [20, 40, 100, 128]);
  return { doc, folder };
}

const context = (doc: ReturnType<typeof drawing>['doc']) => ({
  layers: doc.layers,
  active: doc.activeLayer,
  readTile: async (pixels: TileData) => unpackTile(pixels),
  readCoverage: coverageReader((data) => data as Uint8Array),
  linearBlending: doc.linearBlending()
});
const area = { left: 0, top: 0, width: 4, height: 4 };

it('samples all layers through a folder that composites on its own as the display composites them', async () => {
  const { doc, folder } = drawing();
  const passThrough = (await sampleArea(context(doc), area, 'all')).get('0,0')!;
  doc.changeLayer({ type: 'update', id: folder, patch: { blend: 'normal', opacity: 0.5 } });
  const isolated = (await sampleArea(context(doc), area, 'all')).get('0,0')!;
  const expected = quantized(
    await composeStack(
      doc.layers,
      TILE_BYTES / 4,
      (layer) => {
        const data = layer.tiles.get('0,0');
        return data && unpackTile(data);
      },
      doc.linearBlending()
    )
  );
  expect([...isolated.subarray(0, 4)]).toEqual([...expected.subarray(0, 4)]);
  // Isolated, the Multiply layer no longer darkens the base: it shows its own color at half strength.
  expect(isolated[0]).not.toBe(passThrough[0]);
});

it('samples all layers through their masks, as the display shows them', async () => {
  const { doc } = drawing();
  const plain = (await sampleArea(context(doc), area, 'all')).get('0,0')!;
  const top = doc.layers.at(-1)!.id;
  doc.changeLayer({ type: 'add-mask', id: top });
  const mask = doc.node(top)!.mask!;
  doc.commit([{ layerId: mask.id, key: '0,0', before: undefined, after: new Uint8Array(MASK_TILE_PIXELS) }]);
  const hidden = (await sampleArea(context(doc), area, 'all')).get('0,0')!;
  expect(hidden).not.toEqual(plain);
  doc.changeLayer({ type: 'update-mask', id: top, patch: { enabled: false } });
  expect((await sampleArea(context(doc), area, 'all')).get('0,0')).toEqual(plain);
});
