import type { DocumentEditContext, PreviewTile } from '@app-game/paint-core/composition/documentEdit';
import { createDocument, TILE_BYTES } from '@app-game/paint-core/document';
import { emptySelection } from '@app-game/paint-core/selectionMask';
import { snapshotDocument } from '@app-game/paint-core/storage';
import { defaultCamera } from '@app-game/paint-core/camera';
import { unpackTile, type TileData } from '@app-game/paint-core/tilePixels';
import { expect, it, vi } from 'vitest';
import { localUndoEdit, type LocalUndoCommand, type LocalUndoReply } from './localUndoEdit';

it('applies the shown region as exactly one undo step, which Undo reverts', async () => {
  const { document, run, apply, pixel } = drawing();
  stroke(document, 10, 10, red);
  stroke(document, 10, 10, blue);
  stroke(document, 100, 100, green);

  const reply = await run({ type: 'lasso', points: square(0, 0, 50), mode: 'replace', depth: 1 });
  expect(reply).toMatchObject({ kind: 'region', depth: 1, count: 2 });
  expect((await run({ type: 'depth', depth: 2 }))!).toMatchObject({ depth: 2, count: 2 });
  // Deeper than the history reaches returns as far as it goes.
  expect((await run({ type: 'depth', depth: 5 }))!).toMatchObject({ depth: 2, count: 2 });
  await run({ type: 'depth', depth: 1 });

  const steps = document.undoSteps().length;
  await apply();
  expect(document.undoSteps()).toHaveLength(steps + 1);
  expect(pixel(10, 10)).toEqual(red);
  expect(pixel(100, 100)).toEqual(green);

  // The applied step is an ordinary one: a new session at depth 1 returns to before it.
  const session = drawing(document);
  expect(await session.run({ type: 'lasso', points: square(0, 0, 50), mode: 'replace', depth: 1 })).toMatchObject({
    depth: 1,
    count: 3
  });
  expect(session.shownPixel(10, 10)).toEqual(blue);
  await session.run({ type: 'cancel' });

  document.undo();
  expect(pixel(10, 10)).toEqual(blue);
  expect(pixel(100, 100)).toEqual(green);
});

it('cancels without changes, and refuses to apply after the drawing changed', async () => {
  const { document, run, apply, preview } = drawing();
  stroke(document, 10, 10, red);
  await run({ type: 'lasso', points: square(0, 0, 50), mode: 'replace', depth: 1 });
  expect((await run({ type: 'cancel' }))).toBeUndefined();
  expect(preview.clear).toHaveBeenCalled();
  expect(document.undoSteps()).toHaveLength(1);
  expect(await apply()).toEqual([]);

  await run({ type: 'lasso', points: square(0, 0, 50), mode: 'replace', depth: 1 });
  stroke(document, 20, 20, blue);
  await expect(apply()).rejects.toThrow('The drawing changed');
  expect(document.undoSteps()).toHaveLength(2);
});

it('ends the session when anything else changes the document, outside its history too', async () => {
  const { document, run, apply, pixel } = drawing();
  stroke(document, 10, 10, red);
  stroke(document, 100, 100, blue);

  // Choosing the active layer again adds no step, but the runtime drops the preview, so the session ends with it.
  await run({ type: 'lasso', points: square(0, 0, 50), mode: 'replace', depth: 1 });
  document.changeLayer({ type: 'select', id: document.active.id });
  await expect(apply()).rejects.toThrow('The drawing changed');

  // After Smooth color changes, an added outline starts a new session: it is the whole region.
  await run({ type: 'lasso', points: square(0, 0, 50), mode: 'replace', depth: 1 });
  document.setLinearBlending(!document.linearBlending());
  expect(await run({ type: 'lasso', points: square(90, 90, 20), mode: 'add', depth: 1 })).toMatchObject({ count: 1 });
  await apply();
  expect(pixel(10, 10)).toEqual(red);
  expect(pixel(100, 100)).toEqual([0, 0, 0, 0]);
});

it('shows the past only in the preview, never in the document or its autosave', async () => {
  const { document, run, shownPixel, pixel } = drawing();
  stroke(document, 10, 10, red);
  stroke(document, 10, 10, blue);
  const saved = () =>
    JSON.stringify(
      snapshotDocument(document.layers, document.active.id, defaultCamera()).layers.map(({ tiles }) =>
        tiles.map(({ key, pixels }) => [key, [...unpackTile(pixels as TileData).subarray(0, 64)]])
      )
    );
  const before = saved();

  await run({ type: 'brush', points: [{ x: 10.5, y: 10.5, radius: 6 }], hardness: 1, erase: false, depth: 1 });
  expect(shownPixel(10, 10)).toEqual(red);
  expect(pixel(10, 10)).toEqual(blue);
  expect(saved()).toBe(before);
  expect(document.undoSteps()).toHaveLength(2);

  // Erasing the dab from the region shows the current pixels again; growing it back keeps the step touching it.
  await run({ type: 'brush', points: [{ x: 10.5, y: 10.5, radius: 6 }], hardness: 1, erase: true, depth: 1 });
  expect(shownPixel(10, 10)).toBeUndefined();
  const grown = await run({
    type: 'brush',
    points: [
      { x: 2, y: 2, radius: 3 },
      { x: 12, y: 12, radius: 3 }
    ],
    hardness: 1,
    erase: false,
    depth: 1
  });
  expect(grown).toMatchObject({ depth: 1, count: 2 });
  expect(shownPixel(10, 10)).toEqual(red);

  // A soft edge mixes the past into the current pixels.
  await run({ type: 'cancel' });
  await run({ type: 'brush', points: [{ x: 13, y: 10.5, radius: 6 }], hardness: 0, erase: false, depth: 1 });
  const soft = shownPixel(10, 10)!;
  expect(soft[0]).toBeGreaterThan(0);
  expect(soft[2]).toBeGreaterThan(0);
});

it('removes the stroke under a tap, goes deeper on another tap there, and adds strokes tapped elsewhere', async () => {
  const { document, run, apply, shownPixel } = drawing();
  stroke(document, 10, 10, red, 2);
  stroke(document, 10, 10, blue, 2);
  stroke(document, 60, 60, green, 2);

  // The newest step under the pen disappears, its antialiased pixel grown by one with it.
  expect(await run({ type: 'tap', point: { x: 10.4, y: 10.6 } })).toMatchObject({ removed: 1, found: true });
  expect(shownPixel(10, 10)).toEqual(red);
  expect(shownPixel(60, 60)).toEqual(green);

  // Another tap at that place removes the older stroke under it too.
  expect(await run({ type: 'tap', point: { x: 11.2, y: 10.1 } })).toMatchObject({ removed: 2, found: true });
  expect(shownPixel(10, 10)).toEqual([0, 0, 0, 0]);
  expect(await run({ type: 'tap', point: { x: 10, y: 10 } })).toMatchObject({ removed: 2, found: false });

  // A tap elsewhere adds that stroke, and everything applies as one step.
  expect(await run({ type: 'tap', point: { x: 60, y: 60 } })).toMatchObject({ removed: 3, found: true });
  expect(shownPixel(60, 60)).toEqual([0, 0, 0, 0]);
  await apply();
  expect(document.active.tiles.size).toBe(0);
  expect(document.undoSteps()).toHaveLength(4);
});

it('refuses a region larger than the limit and leaves the session as it was', async () => {
  const { document, run } = drawing();
  stroke(document, 10, 10, red);
  await run({ type: 'lasso', points: square(0, 0, 50), mode: 'replace', depth: 1 });
  await expect(run({ type: 'lasso', points: square(0, 0, 5000), mode: 'add', depth: 1 })).rejects.toThrow(
    'too large'
  );
  expect(await run({ type: 'depth', depth: 1 })).toMatchObject({ depth: 1, count: 1 });
});

const red = [255, 0, 0, 255];
const green = [0, 255, 0, 255];
const blue = [0, 0, 255, 255];

/**
 * A drawing and a local undo session on it: `run` sends a command with one edit state, `shownPixel` reads what the
 * preview shows at a pixel (`undefined` where it shows the layer's own tile), `pixel` reads the document.
 */
function drawing(document = createDocument()) {
  let state: unknown;
  let shown = new Map<string, Uint8Array | undefined>();
  const preview = {
    show: vi.fn((tiles: readonly PreviewTile[]) => {
      shown = new Map(tiles.map(({ key, pixels }) => [key, pixels]));
    }),
    clear: vi.fn(() => {
      shown = new Map();
    })
  };
  const send = (command: LocalUndoCommand) =>
    localUndoEdit.run(context(document, preview, { get: () => state, set: (value) => (state = value) }), command);
  const run = async (command: LocalUndoCommand) => (await send(command)).reply as LocalUndoReply | undefined;
  const read = (pixels: Uint8Array | undefined, x: number, y: number) =>
    pixels ? [...pixels.subarray((y * 256 + x) * 4, (y * 256 + x) * 4 + 4)] : [0, 0, 0, 0];
  return {
    document,
    run,
    /** Applies the session and commits its changes; returns them. */
    async apply() {
      const { changes } = await send({ type: 'apply' });
      document.commit(changes);
      return changes;
    },
    preview,
    pixel: (x: number, y: number) => {
      const tile = document.active.tiles.get('0,0');
      return read(tile && unpackTile(tile), x, y);
    },
    shownPixel: (x: number, y: number) => (shown.has('0,0') ? read(shown.get('0,0'), x, y) : undefined)
  };
}

function context(
  document: ReturnType<typeof createDocument>,
  preview: DocumentEditContext['preview'] = { show: () => {}, clear: () => {} },
  state: DocumentEditContext['state'] = { get: () => undefined, set: () => {} }
): DocumentEditContext {
  return {
    layers: document.layers,
    active: document.active,
    readTile: async (pixels) => unpackTile(pixels),
    linearBlending: false,
    selection: emptySelection,
    state,
    floating: { show: () => {}, move: () => {}, clear: async () => {} },
    history: document.undoSteps(),
    revision: document.revision,
    preview
  };
}

/** Commits a step painting a `size` × `size` square at (`x`, `y`) in tile 0,0. */
function stroke(document: ReturnType<typeof createDocument>, x: number, y: number, rgba: number[], size = 1) {
  const before = document.active.tiles.get('0,0');
  const after = before ? unpackTile(before).slice() : new Uint8Array(TILE_BYTES);
  for (let dy = 0; dy < size; dy++) {
    for (let dx = 0; dx < size; dx++) {
      after.set(rgba, ((y + dy) * 256 + x + dx) * 4);
    }
  }

  document.commit([{ layerId: document.active.id, key: '0,0', before, after }]);
}

function square(left: number, top: number, side: number) {
  return [
    { x: left, y: top },
    { x: left + side, y: top },
    { x: left + side, y: top + side },
    { x: left, y: top + side }
  ];
}
