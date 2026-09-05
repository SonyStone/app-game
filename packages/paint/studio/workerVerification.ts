import { defaultBrush } from './brush';
import { defaultCamera } from './camera';
import Worker from './paint.worker?worker';
import type { PaintCommand, PaintEvent } from './protocol';
import { decodeDocument } from './storage';

/** Exercises the production worker protocol and IndexedDB using a unique disposable database. */
export async function verifyWorker(report: (message: string) => void) {
  const storageName = `paint-studio-qa-${crypto.randomUUID()}`;
  let worker = new Worker();
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
    return event.blob.text();
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
    const decoded = decodeDocument(original);
    assert(decoded.layers[0]!.tiles.size > 0, 'Worker did not commit stroke pixels');
    report('PASS: production worker commits batched pressure input and exports a valid .paint document');
    const undone = wait((e) => e.type === 'state' && e.document.tileCount === 0);
    send({ type: 'undo' });
    await undone;
    const redone = wait((e) => e.type === 'state' && e.document.tileCount > 0);
    send({ type: 'redo' });
    await redone;
    assert((await download()) === original, 'Worker undo/redo changed serialized pixels');
    report('PASS: worker undo/redo restores an identical exported file');
    const camera = { ...defaultCamera(), x: -128, y: 200, zoom: 2, angle: 0.3 };
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
    assert((await download()) === checkpoint, 'Restart did not restore saved document and camera');
    report('PASS: a fresh worker restores exact pixels and camera from IndexedDB');
    const recovered = wait((e) => e.type === 'ready');
    send({ type: 'recover' });
    await recovered;
    assert((await download()) === checkpoint, 'Renderer recovery changed the document');
    report('PASS: worker recovery preserves committed document state');
    const restored = wait((e) => e.type === 'restored');
    send({ type: 'import', text: original });
    await restored;
    assert((await download()) === original, 'Imported document changed its pixels or camera');
    const pngResult = wait((e) => e.type === 'download');
    send({ type: 'png' });
    const png = await pngResult;
    assert(png.type === 'download' && png.blob.type === 'image/png' && png.blob.size > 100, 'PNG export failed');
    report('PASS: file import and visible-canvas PNG export work through the worker');
    const done = wait((e) => e.type === 'disposed');
    send({ type: 'dispose' });
    await done;
    report('ALL WORKER CHECKS PASSED');
  } finally {
    worker.terminate();
    indexedDB.deleteDatabase(storageName);
  }
}
