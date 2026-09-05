import { defaultBrush } from './brush';
import { defaultCamera } from './camera';
import Worker from './paint.worker?worker';
import type { PaintCommand, PaintEvent } from './protocol';
import { readPaintFile } from './paintFile';
import { unpackTile } from './tilePixels';

/** Exercises the production worker protocol and IndexedDB using a unique disposable database. */
export async function verifyWorker(report: (message: string) => void) {
  const storageName = `paint-studio-qa-${crypto.randomUUID()}`;
  let worker = new Worker();
  let latest: Extract<PaintEvent, { type: 'state' }> | undefined;
  const wait = (predicate: (event: PaintEvent) => boolean) =>
    new Promise<PaintEvent>((resolve, reject) => {
      const current = worker;
      const cleanup = () => {
        clearTimeout(timer);
        current.removeEventListener('message', receive);
        current.removeEventListener('error', error);
      };
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error('Worker response timed out.'));
      }, 15_000);
      const error = (event: ErrorEvent) => {
        cleanup();
        reject(new Error(event.message || 'Worker stopped.'));
      };
      const receive = (event: MessageEvent<PaintEvent>) => {
        if (event.data.type === 'error') {
          cleanup();
          reject(new Error(event.data.message));
        } else if (predicate(event.data)) {
          cleanup();
          resolve(event.data);
        }
      };
      current.addEventListener('message', receive);
      current.addEventListener('error', error);
    });
  const send = (command: PaintCommand) => worker.postMessage(command);
  const init = async () => {
    latest = undefined;
    worker.addEventListener('message', (event: MessageEvent<PaintEvent>) => {
      if (event.data.type === 'state') latest = event.data;
    });
    const ready = wait((e) => e.type === 'ready');
    const canvas = new OffscreenCanvas(400, 300);
    const command: PaintCommand = { type: 'init', canvas, size: { width: 400, height: 300 }, dpr: 1, storageName };
    worker.postMessage(command, [canvas]);
    await ready;
  };
  const download = async () => {
    const result = wait((e) => e.type === 'download');
    send({ type: 'download' });
    const event = await result;
    if (event.type !== 'download') throw new Error('Missing file');
    return event.blob;
  };
  const assert = (value: boolean, message: string) => {
    if (!value) throw new Error(message);
  };
  try {
    await init();
    const committed = wait((e) => e.type === 'state' && e.document.canUndo);
    send({ type: 'begin', brush: defaultBrush(), samples: [{ x: -30, y: 0, pressure: 1, time: 0 }] });
    send({ type: 'samples', samples: [{ x: 30, y: 0, pressure: 0.5, time: 20 }] });
    send({ type: 'end' });
    await committed;
    const original = await download();
    const decoded = await readPaintFile(original);
    assert(decoded.layers[0]!.tiles.size > 0, 'Worker did not commit stroke pixels');
    report('PASS: production worker commits batched pressure input and exports a valid .paint document');
    const undone = wait((e) => e.type === 'state' && e.document.tileCount === 0);
    send({ type: 'undo' });
    await undone;
    const redone = wait((e) => e.type === 'state' && e.document.tileCount > 0);
    send({ type: 'redo' });
    await redone;
    assert(await equalFiles(await download(), original), 'Worker undo/redo changed serialized pixels');
    report('PASS: worker undo/redo restores an identical exported file');
    const camera = { ...defaultCamera(), x: -128, y: 200, zoom: 0.05, angle: 0.3 };
    send({ type: 'view', camera, size: { width: 400, height: 300 }, dpr: 1 });
    const saved = wait((e) => e.type === 'state' && e.saved);
    send({ type: 'save' });
    await saved;
    const checkpoint = await download();
    const disposed = wait((e) => e.type === 'disposed');
    send({ type: 'dispose' });
    await disposed;
    worker.terminate();
    worker = new Worker();
    await init();
    assert(
      latest?.storage?.reads === 0 && (latest?.storage?.overviewReads ?? 0) > 0,
      'Worker reopened far zoom by decoding high-resolution pixels'
    );
    assert(await equalFiles(await download(), checkpoint), 'Restart did not restore saved document and camera');
    report(
      'PASS: a fresh worker restores pixels/camera and renders far zoom from saved low-res with zero high-res reads'
    );
    const recovered = wait((e) => e.type === 'ready');
    send({ type: 'recover' });
    await recovered;
    assert(await equalFiles(await download(), checkpoint), 'Renderer recovery changed the document');
    report('PASS: worker recovery preserves committed document state');
    const restored = wait((e) => e.type === 'restored');
    send({ type: 'import', file: original });
    await restored;
    assert(await equalFiles(await download(), original), 'Imported document changed its pixels or camera');
    const pngResult = wait((e) => e.type === 'download');
    send({ type: 'png' });
    const png = await pngResult;
    assert(png.type === 'download' && png.blob.type === 'image/png' && png.blob.size > 100, 'PNG export failed');
    report('PASS: file import and visible-canvas PNG export work through the worker');
    const lock = await holdCheckpoint(storageName);
    let allStrokes: Blob;
    try {
      // Trigger the actual debounce timer, then draw while its transaction is blocked.
      send({ type: 'view', camera: defaultCamera(), size: { width: 400, height: 300 }, dpr: 1 });
      await new Promise((resolve) => setTimeout(resolve, 400));
      for (let i = 0; i < 8; i++) {
        const revision = latest!.document.revision;
        const committed = wait((e) => e.type === 'state' && e.document.revision > revision);
        send({
          type: 'begin',
          brush: { ...defaultBrush(), size: 8, opacity: 1, flow: 1, pressureSize: false },
          samples: [{ x: -80, y: 30 + i * 12, pressure: 1, time: 0 }]
        });
        send({ type: 'samples', samples: [{ x: 80, y: 30 + i * 12, pressure: 1, time: 20 }] });
        send({ type: 'end' });
        await committed;
      }
      allStrokes = await download();
      const painted = await readPaintFile(allStrokes);
      for (let i = 0; i < 8; i++) {
        const tile = painted.layers[0]!.tiles.get('0,0')!;
        if (unpackTile(tile)[((30 + i * 12) * 256 + 20) * 4 + 3]! < 200)
          throw new Error(`Stroke ${i} disappeared during blocked autosave`);
      }
    } finally {
      await lock.release();
    }
    const flushed = wait((e) => e.type === 'state' && e.saved);
    send({ type: 'save' });
    await flushed;
    assert(await equalFiles(await download(), allStrokes), 'Autosave completion changed live stroke pixels');
    const closed = wait((e) => e.type === 'disposed');
    send({ type: 'dispose' });
    await closed;
    worker.terminate();
    worker = new Worker();
    await init();
    assert(await equalFiles(await download(), allStrokes), 'Overlapping autosave lost strokes on restart');
    report('PASS: eight strokes survive a blocked autosave, transaction completion and a fresh worker restart');
    const done = wait((e) => e.type === 'disposed');
    send({ type: 'dispose' });
    await done;
    report('ALL WORKER CHECKS PASSED');
  } finally {
    worker.terminate();
    indexedDB.deleteDatabase(storageName);
  }
}

/** Holds a real IndexedDB write lock while the production worker continues accepting input. */
async function holdCheckpoint(name: string) {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(name);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  let holding = true;
  const tx = db.transaction('documents', 'readwrite');
  const completed = new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onabort = tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
  await new Promise<void>((resolve, reject) => {
    const poll = () => {
      const request = tx.objectStore('documents').get('qa-lock');
      request.onsuccess = () => {
        resolve();
        if (holding) poll();
      };
      request.onerror = () => reject(request.error);
    };
    poll();
  });
  return {
    release: () => {
      holding = false;
      return completed;
    }
  };
}

async function equalFiles(a: Blob, b: Blob) {
  const left = new Uint8Array(await a.arrayBuffer());
  const right = new Uint8Array(await b.arrayBuffer());
  return left.length === right.length && left.every((byte, index) => byte === right[index]);
}
