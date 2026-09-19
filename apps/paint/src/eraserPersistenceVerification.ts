import { prepareAbrBrush } from '@app-game/abr-paint/preset';
import { initAbr, percent, pixels } from '@app-game/abr-parser';
import { unwrapResult } from '@app-game/paint-core/asyncResult';
import { defaultBrush, type Brush, type Sample } from '@app-game/paint-core/brush';
import { defaultCamera } from '@app-game/paint-core/camera';
import { createDocument } from '@app-game/paint-core/document';
import { readPaintFile, writePaintFile } from '@app-game/paint-core/paintFile';
import type { PaintEvent } from '@app-game/paint-core/protocol';
import { snapshotDocument } from '@app-game/paint-core/storage';
import { packTile, unpackTile } from '@app-game/paint-core/tilePixels';
import { createTileStore } from '@app-game/paint-core/tileStore';
import { openVerificationEndpoint } from './verificationEndpoint';

/** Real endpoint checks: autosave must publish exact eraser pixels before shutdown can save anything. */
export async function verifyEraserPersistence(report: (message: string) => void) {
  await initAbr();
  const fixture = await coloredTiles();
  for (const main of [true, false]) {
    const name = `paint-eraser-persistence-${crypto.randomUUID()}`;
    let connection = await openVerificationEndpoint(main, name);
    try {
      for (const mode of [1, 2, 3]) {
        const imported = connection.wait('state', saved);
        await connection.command({ type: 'import', file: fixture }, 'restored');
        await imported;
        const state = await connection.command({ type: 'debug', enabled: false }, 'state');
        await connection.command({ type: 'history-source', id: state.document.historyCurrentId }, 'state');
        const preset = prepareAbrBrush({
          id: `eraser-persistence-${mode}`,
          name: 'Eraser persistence',
          preset: {
            kind: 'brush',
            sourceId: 'fixture',
            ...{ toolOptions: { kind: 'ErTl', eraserMode: mode, eraseToHistory: false, opacity: 60, flow: 25 } },
            tip: { kind: 'computed', diameter: pixels(48), spacing: percent(10), hardness: percent(100) }
          },
          resources: [],
          source: { format: 'photoshop-abr/v1' as const, bytes: new Uint8Array() }
        });
        const brush: Brush = {
          ...defaultBrush(),
          size: 48,
          opacity: preset.opacity!,
          flow: preset.flow!,
          engine: preset.engine,
          stroke: { ...defaultBrush().stroke, mode: 'none' }
        };
        const upload = async () => {
          for (const resource of preset.resources) {
            const result = await connection.command(
              {
                type: 'brush-resources',
                action: 'put',
                requestId: resource.id,
                resource
              },
              'brush-resources'
            );
            if (!result.result.ok) throw new Error(result.result.error);
          }
        };
        await upload();
        const draw = async (altKey: boolean) => {
          // Ignore a late Saved event from the preceding operation until this stroke becomes dirty.
          let sawUnsaved = false;
          const completed = connection.wait('state', (event) => {
            if (!event.saved) sawUnsaved = true;
            return sawUnsaved && saved(event);
          });
          const points: Sample[] = Array.from({ length: 33 }, (_, index) => ({
            x: -32 + index * 16,
            y: 128 * Math.sin(index / 5),
            pressure: 1,
            time: index * 10
          }));
          connection.post({ type: 'begin', brush, zoom: 0.5, modifiers: { altKey }, samples: [points[0]!] });
          for (const point of points.slice(1)) connection.post({ type: 'samples', samples: [point] });
          // Only the normal idle autosave is allowed to publish the result.
          connection.post({ type: 'end' });
          await completed;
          const exported = (await connection.command({ type: 'download' }, 'download')).blob;
          await assertPublished(name, exported);
          return exported;
        };
        const erased = await draw(false);
        await assertChanged(fixture, erased, 'Eraser did not change the tiled fixture.');
        const decoded = await readPaintFile(erased);
        const tile = decoded.layers[0]!.tiles.get('-1,0');
        if (!tile) throw new Error('The eraser dropped the partially covered negative-coordinate tile.');
        const alpha = unpackTile(tile)[224 * 4 + 3]!;
        if (mode === 3 ? alpha !== 0 : alpha <= 0 || alpha >= 255)
          throw new Error(`Eraser mode ${mode} lost its opacity behavior: alpha ${alpha}.`);
        const restored = await draw(true);
        await assertChanged(erased, restored, 'Erase to History did not restore any ink.');
        const restoredTile = (await readPaintFile(restored)).layers[0]!.tiles.get('-1,0');
        if (!restoredTile || unpackTile(restoredTile)[224 * 4 + 3]! <= alpha)
          throw new Error('Erase to History did not restore coverage at the original contact.');
        // A second storage connection already checked autosave; disposal cannot hide a missing checkpoint.
        await connection.close();
        connection = await openVerificationEndpoint(main, name);
        await assertEqual(restored, (await connection.command({ type: 'download' }, 'download')).blob);
        await upload();
        const next = await draw(false);
        await assertChanged(restored, next, 'Temporary history mode leaked across reopening.');
        report(
          `PASS: ${main ? 'main' : 'worker'} Eraser ${mode}: tiled drag, opacity, idle autosave, history restoration and reopen preserve exact bytes`
        );
      }
    } finally {
      await connection.close();
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.deleteDatabase(name);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(new Error('Persistence verification left its database open.'));
      });
    }
  }
}

function saved(event: Extract<PaintEvent, { type: 'state' }>) {
  return event.saved && event.saveState === 'saved';
}

/** Opens a separate cache so unflushed pixels in the renderer process cannot satisfy this check. */
async function assertPublished(name: string, expected: Blob) {
  const store = await createTileStore(name);
  try {
    const loaded = await store.load();
    if (!loaded) throw new Error('Saved status was published without a document checkpoint.');
    await assertEqual(
      expected,
      await writePaintFile(snapshotDocument(loaded.layers, loaded.activeId, loaded.camera), store.read)
    );
  } finally {
    unwrapResult(await store.close());
  }
}

async function assertEqual(a: Blob, b: Blob) {
  if (!(await equalBytes(a, b))) throw new Error('Autosave or reopening changed eraser document bytes.');
}

async function assertChanged(a: Blob, b: Blob, message: string) {
  if (await equalBytes(a, b)) throw new Error(message);
}

async function equalBytes(a: Blob, b: Blob) {
  const first = new Uint8Array(await a.arrayBuffer()),
    second = new Uint8Array(await b.arrayBuffer());
  return first.length === second.length && first.every((byte, index) => byte === second[index]);
}

/** Distinct opaque colors expose lost tiles or accidental restoration from the wrong source. */
async function coloredTiles() {
  const model = createDocument();
  for (let y = -1; y <= 1; y++)
    for (let x = -1; x <= 1; x++) {
      const rgba = [80 + x * 30, 90 + y * 25, 170, 255];
      model.active.tiles.set(
        `${x},${y}`,
        packTile(Uint8Array.from({ length: 256 * 256 * 4 }, (_, index) => rgba[index % 4]!))
      );
    }
  return writePaintFile(snapshotDocument(model.layers, model.active.id, defaultCamera()), async (tile) => {
    if (!(tile instanceof Uint8Array)) throw new Error('The generated fixture unexpectedly requires storage.');
    return tile;
  });
}
