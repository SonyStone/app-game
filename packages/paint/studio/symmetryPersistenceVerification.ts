import { unwrapResult } from './asyncResult';
import { defaultBrush } from './brush';
import { readPaintFile, writePaintFile } from './paintFile';
import { snapshotDocument } from './storage';
import { defaultPaintSymmetry, type PaintSymmetry } from './symmetry';
import { unpackTile } from './tilePixels';
import { createTileStore } from './tileStore';
import { openVerificationEndpoint } from './verificationEndpoint';

/** Actual main/worker transports: guide state, mirrored ink, idle autosave, file import and renderer handoff. */
export async function verifySymmetryPersistence(report: (message: string) => void) {
  const name = `paint-symmetry-${crypto.randomUUID()}`;
  let connection = await openVerificationEndpoint(true, name);
  try {
    for (const main of [true, false]) {
      const initial = (await connection.command({ type: 'download' }, 'download')).blob;
      const symmetry: PaintSymmetry = {
        ...defaultPaintSymmetry(),
        mode: 'vertical',
        x: 17,
        y: -40,
        visible: false
      };
      await connection.command({ type: 'symmetry', settings: symmetry }, 'state');
      const empty = (await connection.command({ type: 'download' }, 'download')).blob;
      let dirty = false;
      const saved = connection.wait('state', (event) => {
        if (!event.saved) dirty = true;
        return dirty && event.saved && event.saveState === 'saved';
      });
      connection.post({
        type: 'begin',
        brush: { ...defaultBrush(), size: 20, flow: 1, opacity: 1, hardness: 1, pressureSize: false },
        samples: [{ x: -80, y: -40, pressure: 1, time: 0 }]
      });
      connection.post({ type: 'end' });
      // Read persisted state before download/dispose can implicitly checkpoint the document.
      await saved;
      const store = await createTileStore(name);
      let published: Blob;
      try {
        const loaded = await store.load();
        if (!loaded) throw new Error('Symmetry idle autosave did not publish a document.');
        published = await writePaintFile(
          snapshotDocument(loaded.layers, loaded.activeId, loaded.camera, loaded.symmetry),
          store.read
        );
      } finally {
        unwrapResult(await store.close());
      }
      const painted = (await connection.command({ type: 'download' }, 'download')).blob;
      await equal(published, painted);
      const restored = await readPaintFile(painted);
      if (JSON.stringify(restored.symmetry) !== JSON.stringify(symmetry)) throw new Error('Guide settings were lost.');
      for (const x of [-80, 113]) {
        const tx = Math.floor(x / 256),
          ty = -1;
        const tile = restored.layers[0]!.tiles.get(`${tx},${ty}`);
        if (!tile || unpackTile(tile)[((256 - 40) * 256 + x - tx * 256) * 4 + 3] !== 255)
          throw new Error(`Symmetry did not paint both contacts: ${x},-40.`);
      }
      connection.post({ type: 'undo' });
      await equal(empty, (await connection.command({ type: 'download' }, 'download')).blob);
      connection.post({ type: 'redo' });
      await equal(painted, (await connection.command({ type: 'download' }, 'download')).blob);
      await connection.command({ type: 'symmetry', settings: defaultPaintSymmetry() }, 'state');
      const imported = await connection.command({ type: 'import', file: painted }, 'restored');
      if (JSON.stringify(imported.symmetry) !== JSON.stringify(symmetry)) throw new Error('Import lost symmetry.');
      await equal(painted, (await connection.command({ type: 'download' }, 'download')).blob);
      await connection.command({ type: 'checkpoint' }, 'checkpointed');
      await connection.close();
      connection = await openVerificationEndpoint(!main, name);
      await equal(painted, (await connection.command({ type: 'download' }, 'download')).blob);
      await connection.command({ type: 'import', file: initial }, 'restored');
      report(
        `PASS: ${main ? 'main → worker' : 'worker → main'} symmetry: exact pixels, Undo/Redo, idle autosave and file/renderer restoration`
      );
    }
  } finally {
    await connection.close();
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase(name);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('Symmetry verification left its database open.'));
    });
  }
}

async function equal(a: Blob, b: Blob) {
  const first = new Uint8Array(await a.arrayBuffer()),
    second = new Uint8Array(await b.arrayBuffer());
  if (first.length !== second.length || first.some((byte, i) => byte !== second[i]))
    throw new Error('Symmetry persistence changed document metadata or pixels.');
}
