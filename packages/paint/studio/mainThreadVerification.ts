import { defaultBrush } from './brush';
import { verifyBrushResourceTransport } from './composition/resourceVerification';
import { texturedBrush } from './composition/texturedBrushEngine';
import { createMainThreadEndpoint, type PaintEndpoint } from './mainThreadEndpoint';
import Worker from './paint.worker?worker';
import { readPaintFile } from './paintFile';
import type { PaintEvent, PaintRuntimeCommand } from './protocol';

/** Verifies real DOM-canvas rendering and document exchange between both execution modes in an isolated database. */
export async function verifyMainThread(report: (message: string) => void) {
  const storageName = `paint-main-qa-${crypto.randomUUID()}`;
  let endpoint: PaintEndpoint = createMainThreadEndpoint();
  const waiters = new Set<(event: PaintEvent) => void>();
  const connect = () => {
    endpoint.onmessage = ({ data }) => {
      for (const receive of [...waiters]) receive(data);
    };
    endpoint.onerror = ({ message }) => {
      for (const receive of [...waiters]) receive({ type: 'error', message, recoverable: false });
    };
  };
  const wait = <T extends PaintEvent['type']>(type: T) =>
    new Promise<Extract<PaintEvent, { type: T }>>((resolve, reject) => {
      const timer = setTimeout(() => {
        waiters.delete(receive);
        reject(new Error(`Timed out waiting for ${type}`));
      }, 30_000);
      const receive = (event: PaintEvent) => {
        if (event.type !== type && event.type !== 'error') return;
        clearTimeout(timer);
        waiters.delete(receive);
        if (event.type === 'error') reject(new Error(event.message));
        else resolve(event as Extract<PaintEvent, { type: T }>);
      };
      waiters.add(receive);
    });
  const command = async <T extends PaintEvent['type']>(message: PaintRuntimeCommand, response: T) => {
    const result = wait(response);
    endpoint.postMessage(message);
    return result;
  };
  const init = async (main: boolean) => {
    connect();
    const ready = wait('ready');
    const size = { width: 256, height: 256 };
    if (main) {
      const canvas = document.createElement('canvas');
      // No transferControlToOffscreen call: the renderer must use this exact DOM canvas.
      endpoint.postMessage({ type: 'init', canvas, size, dpr: 1, storageName });
    } else {
      const canvas = new OffscreenCanvas(256, 256);
      endpoint.postMessage({ type: 'init', canvas, size, dpr: 1, storageName }, [canvas]);
    }
    await ready;
    await verifyBrushResourceTransport((message) => command(message, 'brush-resources'), report);
  };
  const bytes = async (blob: Blob) => new Uint8Array(await blob.arrayBuffer());
  const equal = async (a: Blob, b: Blob) => {
    const x = await bytes(a),
      y = await bytes(b);
    if (x.length !== y.length || !x.every((v, i) => v === y[i])) throw new Error('Mode switch changed document pixels');
  };
  try {
    await init(true);
    const uploaded = await command(
      {
        type: 'brush-resources',
        requestId: 'textured-tip',
        action: 'put',
        resource: {
          id: 'qa-textured-tip',
          width: 2,
          height: 2,
          format: 'r8unorm',
          pixels: new Uint8Array([255, 255, 255, 255])
        }
      },
      'brush-resources'
    );
    if (!uploaded.result.ok) throw new Error(uploaded.result.error);
    endpoint.postMessage({
      type: 'begin',
      brush: { ...defaultBrush(), engine: texturedBrush.select({ tipId: 'qa-textured-tip', spacing: 0.04 }) },
      samples: [{ x: -40, y: -40, pressure: 0.4, time: 1 }]
    });
    endpoint.postMessage({ type: 'samples', samples: [{ x: 40, y: 40, pressure: 0.8, time: 2 }] });
    endpoint.postMessage({ type: 'end' });
    const original = (await command({ type: 'download' }, 'download')).blob;
    const decoded = await readPaintFile(original);
    if (!decoded.layers[0]?.tiles.size) throw new Error('DOM canvas mode did not commit the stroke');
    const png = (await command({ type: 'png' }, 'download')).blob;
    const bitmap = await createImageBitmap(png);
    const copy = document.createElement('canvas');
    copy.width = bitmap.width;
    copy.height = bitmap.height;
    const ctx = copy.getContext('2d')!;
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();
    const pixels = ctx.getImageData(0, 0, copy.width, copy.height).data;
    const center = ((copy.height >> 1) * copy.width + (copy.width >> 1)) * 4;
    if (pixels[0]! < 230 || pixels[1]! < 230 || pixels[2]! < 230 || pixels[3] !== 255)
      throw new Error('DOM canvas PNG lost the paper background');
    if (pixels[center]! >= 200 || pixels[center + 3] !== 255)
      throw new Error('DOM canvas PNG contains no visible ink at the stroke center');
    report('PASS: textured main-thread engine draws on HTMLCanvasElement and exports visible ink to PNG');
    await command({ type: 'checkpoint' }, 'checkpointed');
    await command({ type: 'dispose' }, 'disposed');
    endpoint = new Worker();
    await init(false);
    await equal(original, (await command({ type: 'download' }, 'download')).blob);
    report('PASS: worker restores the exact document saved by main-thread mode');
    await command({ type: 'checkpoint' }, 'checkpointed');
    await command({ type: 'dispose' }, 'disposed');
    endpoint.terminate();
    endpoint = createMainThreadEndpoint();
    await init(true);
    await equal(original, (await command({ type: 'download' }, 'download')).blob);
    await command({ type: 'dispose' }, 'disposed');
    report('PASS: main-thread mode restores the exact worker checkpoint');
    report('ALL EXECUTION MODE CHECKS PASSED');
  } finally {
    endpoint.terminate();
    indexedDB.deleteDatabase(storageName);
  }
}
