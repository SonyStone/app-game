import { describe, expect, it } from 'vitest';
import { defaultCamera } from './camera';
import { createDocument, TILE_BYTES, type DocumentNode, type Layer } from './document';
import { compositionSignature } from './gpu/frameComposer';
import { composeStack } from './layerStack';
import { isFlatStack, type ShownLayer } from './layerTree';
import { readPaintFile, writePaintFile } from './paintFile';
import { decodeDocument, encodeDocument, restoreDocument, snapshotDocument } from './storage';
import { unpackTile } from './tilePixels';

type Doc = ReturnType<typeof createDocument>;

/** A drawing of an opaque `Base` and folder `Group 1` holding `Inner`, both empty; returns their ids. */
function grouped() {
  const doc = createDocument();
  const base = doc.activeId;
  doc.changeLayer({ type: 'update', id: base, patch: { name: 'Base' } });
  doc.changeLayer({ type: 'add-group' });
  const group = doc.activeId;
  doc.changeLayer({ type: 'add', place: { parentId: group, side: 'above' } });
  const inner = doc.activeId;
  doc.changeLayer({ type: 'update', id: inner, patch: { name: 'Inner' } });
  return { doc, base, group, inner };
}

/** Adds a raster at `place`, the top of the root by default, named `name`; returns its id. */
function addLayer(doc: Doc, name: string, place?: Parameters<Doc['changeLayer']>[0] & { type: 'add' }) {
  doc.changeLayer(place ?? { type: 'add' });
  doc.changeLayer({ type: 'update', id: doc.activeId, patch: { name } });
  return doc.activeId;
}

/** Fills tile 0,0 of `layerId` with straight color `rgb` (0–1) at alpha `alpha` (0–1), premultiplied RGBA8. */
function fill(doc: Doc, layerId: string, rgb: [number, number, number], alpha = 1) {
  const pixels = new Uint8Array(TILE_BYTES);
  const value = [...rgb.map((channel) => Math.round(channel * alpha * 255)), Math.round(alpha * 255)];
  for (let index = 0; index < TILE_BYTES; index += 4) {
    pixels.set(value, index);
  }

  doc.commit([{ layerId, key: '0,0', before: undefined, after: pixels }]);
}

/** The CPU composite of tile 0,0 of `doc` as it shows, first pixel, premultiplied 0–1. */
async function composite(doc: Doc, linear = doc.linearBlending()): Promise<number[]> {
  const image = await composeStack(doc.layers, TILE_BYTES / 4, (layer) => tileOf(layer), linear);
  return [...image.subarray(0, 4)];
}

function tileOf(layer: ShownLayer) {
  const data = layer.tiles.get('0,0');
  return data && unpackTile(data as Uint8Array);
}

/** The values of `rgb` (0–255 straight, opaque) in 0–1, as a premultiplied opaque pixel. */
const opaque = (rgb: number[]) => [...rgb.map((value) => value / 255), 1];

/** Expects `actual` within float rounding of `expected`. */
function expectPixel(actual: number[], expected: number[]) {
  expect(actual.map((value) => Number(value.toFixed(4)))).toEqual(expected.map((value) => Number(value.toFixed(4))));
}

const decode = (value: number) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
const encode = (value: number) => (value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055);

/** Backdrop and folder content of the composite cases: 0–255 values that are exact in RGBA8. */
const B = [102, 204, 153];
const C = [153, 255, 255];

describe('folder properties', () => {
  it('take an opacity and any blend mode, Pass Through too, each as one undo step', () => {
    const { doc, group } = grouped();
    const steps = doc.state().historyStates.length;
    doc.changeLayer({ type: 'update', id: group, patch: { opacity: 0.4 } });
    doc.changeLayer({ type: 'update', id: group, patch: { blend: 'multiply' } });
    expect(doc.node(group)).toMatchObject({ opacity: 0.4, blend: 'multiply' });
    expect(doc.state().historyStates).toHaveLength(steps + 2);
    expect(doc.state().nodes.find((node) => node.id === group)).toMatchObject({ opacity: 0.4, blend: 'multiply' });

    doc.undo();
    expect(doc.node(group)).toMatchObject({ opacity: 0.4, blend: 'pass-through' });
    doc.undo();
    expect(doc.node(group)).toMatchObject({ opacity: 1, blend: 'pass-through' });
    doc.redo();
    doc.redo();
    expect(doc.node(group)).toMatchObject({ opacity: 0.4, blend: 'multiply' });
    doc.changeLayer({ type: 'update', id: group, patch: { blend: 'pass-through' } });
    expect(doc.node(group)).toMatchObject({ blend: 'pass-through' });
  });

  it('refuse clipping and alpha lock on a folder, Pass Through on a layer and opacity outside 0–1', () => {
    const { doc, group, inner } = grouped();
    const steps = doc.state().historyStates.length;
    expect(() => doc.changeLayer({ type: 'update', id: group, patch: { clipping: true } })).toThrow('folder');
    expect(() => doc.changeLayer({ type: 'update', id: group, patch: { alphaLock: true } })).toThrow('folder');
    expect(() => doc.changeLayer({ type: 'update', id: inner, patch: { blend: 'pass-through' } })).toThrow(
      'Pass Through'
    );
    expect(() => doc.changeLayer({ type: 'update', id: inner, patch: { opacity: 1.5 } })).toThrow('0 to 1');
    expect(() => doc.changeLayer({ type: 'update', id: group, patch: { opacity: Number.NaN } })).toThrow('0 to 1');
    expect(doc.state().historyStates).toHaveLength(steps);
    // A folder's fixed values are fine.
    doc.changeLayer({ type: 'update', id: group, patch: { clipping: false, alphaLock: false, name: 'Ink' } });
    expect(doc.node(group)).toMatchObject({ name: 'Ink' });
  });

  it('move a layer and clip it to what ends up below it in one undo step', () => {
    const { doc, base, group } = grouped();
    const top = addLayer(doc, 'Top');
    const steps = doc.state().historyStates.length;
    // Onto the folder: right above it, clipped to it.
    doc.changeLayer({ type: 'relocate', id: top, parentId: null, anchorId: group, side: 'above', clipping: true });
    expect(doc.state().historyStates).toHaveLength(steps + 1);
    expect(doc.layers.find((layer) => layer.id === top)?.clipGroup?.id).toBe(group);
    doc.undo();
    expect(doc.node(top)?.clipping).toBeUndefined();
    doc.redo();
    expect(doc.node(top)).toMatchObject({ clipping: true });

    // Onto a raster below a folder, and back out unclipped.
    doc.changeLayer({ type: 'relocate', id: top, parentId: null, anchorId: base, side: 'above', clipping: true });
    expect(doc.layers.map((layer) => [layer.id, !!layer.clipping, layer.clipGroup])).toContainEqual([
      top,
      true,
      undefined
    ]);
    doc.changeLayer({ type: 'relocate', id: top, parentId: null, side: 'above', clipping: false });
    expect(doc.node(top)).toMatchObject({ clipping: false });
    expect(() =>
      doc.changeLayer({ type: 'relocate', id: group, parentId: null, side: 'above', clipping: true })
    ).toThrow('folder');
  });
});

describe('clipping to a folder', () => {
  it('clips the layers right above a folder to it, through other clipped layers, and resolves nothing else', () => {
    const { doc, base, group, inner } = grouped();
    const first = addLayer(doc, 'First');
    const second = addLayer(doc, 'Second');
    const unclipped = addLayer(doc, 'Unclipped');
    doc.changeLayer({ type: 'update', id: first, patch: { clipping: true } });
    doc.changeLayer({ type: 'update', id: second, patch: { clipping: true } });
    const shown = new Map(doc.layers.map((layer) => [layer.id, layer]));
    expect(shown.get(first)?.clipGroup).toMatchObject({ id: group, base: true, blend: 'pass-through', opacity: 1 });
    expect(shown.get(second)?.clipGroup).toBe(shown.get(first)?.clipGroup);
    // The folder's layers compose inside it, as its coverage.
    expect(shown.get(inner)?.group).toBe(shown.get(first)?.clipGroup);
    expect(shown.get(base)?.group).toBeUndefined();
    expect(shown.get(unclipped)).toBe(doc.node(unclipped));
    expect(isFlatStack(doc.layers)).toBe(false);
  });

  it('nests compositing folders by the nearest one around each layer, leaving plain Pass Through folders out', () => {
    const doc = createDocument();
    doc.changeLayer({ type: 'add-group' });
    const outer = doc.activeId;
    doc.changeLayer({ type: 'add-group', place: { parentId: outer, side: 'above' } });
    const middle = doc.activeId;
    doc.changeLayer({ type: 'add-group', place: { parentId: middle, side: 'above' } });
    const inner = doc.activeId;
    const deep = addLayer(doc, 'Deep', { type: 'add', place: { parentId: inner, side: 'above' } });
    doc.changeLayer({ type: 'update', id: outer, patch: { opacity: 0.5 } });
    doc.changeLayer({ type: 'update', id: inner, patch: { blend: 'screen' } });
    const layer = doc.layers.find(({ id }) => id === deep)!;
    expect(layer.group).toMatchObject({ id: inner, blend: 'screen', parent: { id: outer, opacity: 0.5 } });
    expect(layer.group?.parent?.parent).toBeUndefined();
  });

  it('keeps a stack whose folders all show their layers as they are flat, as before', () => {
    const { doc, group } = grouped();
    const top = addLayer(doc, 'Top');
    expect(isFlatStack(doc.layers)).toBe(true);
    expect(doc.layers.find(({ id }) => id === top)).toBe(doc.node(top));
    doc.changeLayer({ type: 'update', id: group, patch: { visible: false } });
    expect(isFlatStack(doc.layers)).toBe(true);
    // The signature the screen damages by reads exactly what it read before folders could blend.
    const layer = doc.layers[0]!;
    expect(compositionSignature([layer])).toBe(`${layer.id.length}:${layer.id},true,1,normal,false;`);
  });
});

describe('the CPU composite', () => {
  /** Base `B` opaque; folder content `C` opaque Multiply. */
  function multiplyInFolder(patch: { opacity?: number; blend?: 'pass-through' | 'normal' | 'multiply' }) {
    const { doc, base, group, inner } = grouped();
    fill(doc, base, B.map((value) => value / 255) as [number, number, number]);
    fill(doc, inner, C.map((value) => value / 255) as [number, number, number]);
    doc.changeLayer({ type: 'update', id: inner, patch: { blend: 'multiply' } });
    doc.changeLayer({ type: 'update', id: group, patch });
    return { doc, base, group, inner };
  }

  const b = B.map((value) => value / 255),
    c = C.map((value) => value / 255);

  it('composites a Pass Through folder at full strength as its layers flat', async () => {
    const { doc } = multiplyInFolder({});
    doc.setLinearBlending(false);
    expectPixel(await composite(doc), [...b.map((value, index) => value * c[index]!), 1]);
  });

  it('isolates a folder with a blend mode: its layers composite on their own, then once into the backdrop', async () => {
    const { doc } = multiplyInFolder({ blend: 'normal', opacity: 0.5 });
    doc.setLinearBlending(false);
    // Multiply onto nothing leaves the layer's own color, which then covers half of the backdrop.
    expectPixel(await composite(doc), [...b.map((value, index) => 0.5 * value + 0.5 * c[index]!), 1]);
    doc.setLinearBlending(true);
    expectPixel(await composite(doc), [
      ...b.map((value, index) => encode(0.5 * decode(value) + 0.5 * decode(c[index]!))),
      1
    ]);

    // Isolated Multiply at full strength looks as Pass Through does here.
    doc.changeLayer({ type: 'update', id: doc.layers[1]!.group!.id, patch: { blend: 'multiply', opacity: 1 } });
    doc.setLinearBlending(false);
    expectPixel(await composite(doc), [...b.map((value, index) => value * c[index]!), 1]);
  });

  it('fades a Pass Through folder below full opacity between the backdrop and its result', async () => {
    const { doc } = multiplyInFolder({ opacity: 0.5 });
    doc.setLinearBlending(false);
    expectPixel(await composite(doc), [...b.map((value, index) => value + 0.5 * (value * c[index]! - value)), 1]);
    doc.setLinearBlending(true);
    expectPixel(await composite(doc), [
      ...b.map((value, index) => {
        const backdrop = decode(value);
        return encode(backdrop + 0.5 * (backdrop * decode(c[index]!) - backdrop));
      }),
      1
    ]);
  });

  it('keeps a transparent backdrop transparent around an isolated or fading folder', async () => {
    for (const patch of [{ blend: 'normal' as const, opacity: 0.5 }, { opacity: 0.5 }]) {
      const { doc, base } = multiplyInFolder(patch);
      doc.changeLayer({ type: 'update', id: base, patch: { visible: false } });
      doc.setLinearBlending(false);
      // Half of the folder's own color, at half alpha, either way.
      expectPixel(await composite(doc), [...c.map((value) => value * 0.5), 0.5]);
    }
  });

  it('clips a layer to a folder’s coverage before the folder’s opacity, and hides it with a hidden base', async () => {
    const { doc, base, group, inner } = grouped();
    fill(doc, base, b as [number, number, number]);
    fill(doc, inner, [1, 0, 0], 0.6);
    const clipped = addLayer(doc, 'Clipped');
    fill(doc, clipped, [0, 1, 0]);
    doc.changeLayer({ type: 'update', id: clipped, patch: { clipping: true } });
    doc.setLinearBlending(false);

    // Pass Through: red at 0.6 over the backdrop, then green through the folder's 0.6 coverage.
    const red = [0.6 + 0.4 * b[0]!, 0.4 * b[1]!, 0.4 * b[2]!];
    expectPixel(await composite(doc), [0.4 * red[0]!, 0.4 * red[1]! + 0.6, 0.4 * red[2]!, 1]);

    // Isolated at half opacity: the red covers 0.3, the green still shows through the folder's own 0.6.
    doc.changeLayer({ type: 'update', id: group, patch: { blend: 'normal', opacity: 0.5 } });
    const half = [0.3 + 0.7 * b[0]!, 0.7 * b[1]!, 0.7 * b[2]!];
    expectPixel(await composite(doc), [0.4 * half[0]!, 0.4 * half[1]! + 0.6, 0.4 * half[2]!, 1]);

    // A hidden base, one at zero opacity and an empty one hide the clipped layer.
    const backdrop = opaque(B);
    doc.changeLayer({ type: 'update', id: group, patch: { visible: false } });
    expectPixel(await composite(doc), backdrop);
    doc.changeLayer({ type: 'update', id: group, patch: { visible: true, opacity: 0 } });
    expectPixel(await composite(doc), backdrop);
    doc.changeLayer({ type: 'update', id: group, patch: { opacity: 1 } });
    doc.changeLayer({ type: 'update', id: inner, patch: { visible: false } });
    expectPixel(await composite(doc), backdrop);
  });

  it('composites nested folders inside out, clipping to a folder inside a folder', async () => {
    const { doc, base, group: outer, inner: below } = grouped();
    fill(doc, base, b as [number, number, number]);
    fill(doc, below, [0, 0, 1]);
    doc.changeLayer({ type: 'add-group', place: { parentId: outer, anchorId: below, side: 'above' } });
    const nested = doc.activeId;
    const red = addLayer(doc, 'Red', { type: 'add', place: { parentId: nested, side: 'above' } });
    fill(doc, red, [1, 0, 0], 0.6);
    const green = addLayer(doc, 'Green', { type: 'add', place: { parentId: outer, anchorId: nested, side: 'above' } });
    fill(doc, green, [0, 1, 0]);
    doc.changeLayer({ type: 'update', id: green, patch: { clipping: true } });
    doc.changeLayer({ type: 'update', id: nested, patch: { blend: 'screen' } });
    doc.changeLayer({ type: 'update', id: outer, patch: { blend: 'normal', opacity: 0.5 } });
    doc.setLinearBlending(false);

    // Inside the outer folder: blue, then red at 0.6 screened onto it, then green through the red's 0.6.
    const screened = [0.6 * (1 - 0) + 0.4 * 0, 0, 0.4 * 1 + 0.6 * 1];
    const inside = [0.4 * screened[0]!, 0.6, 0.4 * screened[2]!];
    expectPixel(await composite(doc), [...b.map((value, index) => 0.5 * value + 0.5 * inside[index]!), 1]);
  });

  it('composites a stack of Pass Through folders exactly as the same layers flat', async () => {
    const { doc, base, inner } = grouped();
    fill(doc, base, b as [number, number, number], 0.8);
    fill(doc, inner, c as [number, number, number], 0.5);
    doc.changeLayer({ type: 'update', id: inner, patch: { blend: 'overlay', opacity: 0.7 } });
    const flat = doc.layers.map(({ parentId: _parentId, ...layer }) => layer as Layer);
    for (const linear of [false, true]) {
      const tree = await composeStack(doc.layers, TILE_BYTES / 4, tileOf, linear);
      expect(await composeStack(flat, TILE_BYTES / 4, tileOf, linear)).toEqual(tree);
    }
  });
});

describe('saved folder properties', () => {
  it('round-trip; a layer clipped to a folder makes version 5 and PAINT6, others stay version 4 and PAINT5', async () => {
    const { doc, base, group } = grouped();
    fill(doc, base, [1, 1, 1]);
    doc.changeLayer({ type: 'update', id: group, patch: { blend: 'screen', opacity: 0.25 } });
    const isolated = snapshotDocument(doc.nodes, doc.activeId, defaultCamera());
    expect(isolated.version).toBe(4);
    expect(restoreDocument(isolated).nodes.find((node) => node.id === group)).toMatchObject({
      blend: 'screen',
      opacity: 0.25
    });
    expect(await magic(isolated)).toBe('PAINT5');

    const clipped = addLayer(doc, 'Clipped');
    doc.changeLayer({ type: 'update', id: clipped, patch: { clipping: true } });
    const saved = snapshotDocument(doc.nodes, doc.activeId, defaultCamera());
    expect(saved.version).toBe(5);
    for (const restored of [
      restoreDocument(saved),
      decodeDocument(encodeDocument(saved)),
      await readPaintFile(await writePaintFile(saved, async (data) => data as Uint8Array))
    ]) {
      expect(properties(restored.nodes)).toEqual(properties(doc.nodes));
    }

    expect(await magic(saved)).toBe('PAINT6');
  });

  it('opens a version 4 layer clipped to a folder unclipped, as it showed', async () => {
    const { doc, group } = grouped();
    const clipped = addLayer(doc, 'Clipped');
    doc.changeLayer({ type: 'update', id: clipped, patch: { clipping: true } });
    const saved = { ...snapshotDocument(doc.nodes, doc.activeId, defaultCamera()), version: 4 };
    const restored = restoreDocument(saved);
    expect(restored.nodes.find((node) => node.id === clipped)).toMatchObject({ clipping: false });
    // Folders stay as they were.
    expect(restored.nodes.find((node) => node.id === group)).toEqual(doc.node(group));
  });

  it('refuses a clipped folder', () => {
    const { doc, group } = grouped();
    const saved = snapshotDocument(doc.nodes, doc.activeId, defaultCamera());
    const clippedFolder = {
      ...saved,
      layers: saved.layers.map((node) => (node.id === group ? { ...node, clipping: true } : node))
    };
    expect(() => restoreDocument(clippedFolder)).toThrow('clipped folders');
  });
});

describe('merging down with folders', () => {
  it('merges only rasters that are siblings, keeping a layer clipped to a folder clipped to it', () => {
    const { doc, base, group, inner } = grouped();
    const first = addLayer(doc, 'First');
    const second = addLayer(doc, 'Second');
    doc.changeLayer({ type: 'update', id: first, patch: { clipping: true } });
    doc.changeLayer({ type: 'update', id: second, patch: { clipping: true } });
    doc.changeLayer({ type: 'update', id: group, patch: { blend: 'multiply' } });
    // A folder below or above refuses.
    expect(() => doc.mergeDown(first, new Map())).toThrow('no layer below');
    expect(() => doc.mergeDown(group, new Map())).toThrow('no layer below');
    expect(() => doc.mergeDown(inner, new Map())).toThrow('no layer below');

    doc.mergeDown(second, new Map());
    expect(doc.layers.find(({ id }) => id === first)?.clipGroup?.id).toBe(group);
    expect(doc.nodes.map(({ id }) => id)).toEqual([base, inner, group, first]);
  });
});

/** The ids, kinds, parents and compositing properties of `nodes`, in order. */
function properties(nodes: readonly DocumentNode[]) {
  return nodes.map(({ id, kind, parentId, opacity, blend, clipping, visible }) => ({
    id,
    kind: kind ?? 'raster',
    parentId,
    opacity,
    blend,
    clipping: !!clipping,
    visible
  }));
}

/** The magic of the `.paint` file `saved` writes, without its line break. */
async function magic(saved: ReturnType<typeof snapshotDocument>) {
  const file = await writePaintFile(saved, async (data) => data as Uint8Array);
  return new TextDecoder().decode(new Uint8Array(await file.slice(0, 6).arrayBuffer()));
}
