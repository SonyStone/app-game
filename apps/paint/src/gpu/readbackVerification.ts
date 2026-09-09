import { attempt } from '../asyncResult';
import { defaultBrush, TILE_SIZE } from '../brush';
import { defaultCamera } from '../camera';
import { createDocument, type TileChange } from '../document';
import { TILE_BYTES, unpackTile } from '../tilePixels';
import { createReadbackQueue } from './readbackQueue';
import { createPaintRenderer } from './renderer';

/** Delays real GPU map completions to expose capacity, pixel ownership and cancellation races. */
export async function verifyReadbackQueue(report: (message: string) => void) {
  const adapter = await navigator.gpu.requestAdapter();
  const device = await adapter!.requestDevice();
  const gates: ReturnType<typeof gate>[] = [];
  let held: ReturnType<typeof gate> | undefined;
  let rejectNextMap = false;
  const hold = () => {
    const value = gate();
    gates.push(value);
    held = value;
    return value;
  };
  const createBuffer = device.createBuffer.bind(device);
  device.createBuffer = (descriptor) => {
    const buffer = createBuffer(descriptor);
    if (descriptor.label === 'paint-eviction-readback') {
      const map = buffer.mapAsync.bind(buffer);
      buffer.mapAsync = (...args) => {
        if (rejectNextMap) {
          rejectNextMap = false;
          return Promise.reject(new Error('Simulated eviction map failure'));
        }
        const waitFor = held;
        return map(...args).then(async (): Promise<undefined> => {
          if (waitFor) {
            waitFor.arrived++;
            await waitFor.promise;
          }
          return undefined;
        });
      };
    }
    return buffer;
  };
  const errors: string[] = [];
  const canvas = new OffscreenCanvas(256, 256);
  const renderer = await createPaintRenderer(canvas, (error) => errors.push(error), {
    device,
    cacheTiles: 2,
    onError: (error) => errors.push(String(error))
  });
  let document = createDocument();
  let destroyed = false;
  const brush = { ...defaultBrush(), color: '#ff0000', opacity: 0.4, hardness: 1 };
  const dab = (tile: number) => ({ x: tile * 256 + 128, y: 128, radius: 20, flow: 0.5 });
  const pending: Promise<unknown>[] = [];
  const track = <T>(promise: Promise<T>) => {
    pending.push(promise);
    return promise;
  };
  const check = (value: boolean, message: string) => {
    if (!value) throw new Error(message);
  };
  const reset = () => {
    renderer.reset();
    document = createDocument();
  };
  try {
    await verifyReadbackGrowth(device);
    report('PASS: staging grows from two to four channels on demand and preserves every channel');
    const blocked = hold();
    renderer.begin(document.active, brush);
    const painting = track(renderer.paint([dab(0), dab(1), dab(2), dab(3)]));
    const progressed = await Promise.race([painting.then(() => true), delay(1000).then(() => false)]);
    check(progressed, 'Painting waited for readback despite available staging capacity');
    check(renderer.stats().readback.pending === 2, 'Expected two outstanding copies');
    let done = false;
    const limited = track(
      renderer.paint([dab(4)]).then(() => {
        done = true;
      })
    );
    await delay(25);
    check(!done && renderer.stats().readback.buffers === 2, 'A third pending copy bypassed the memory limit');
    check(renderer.stats().readback.bytes === 1048576, 'Two-tile scratch cache used more than 1 MiB staging');
    blocked.release();
    held = undefined;
    await limited;
    await renderer.paint([dab(0)]);
    const changes = await renderer.finish();
    check(Math.abs(alpha(changes, '0,0') - 77) <= 1, 'Revisit did not restore accumulated flow from pending readback');
    check(alpha(changes, '4,0') === 51, 'Later tiles were lost while staging was full');
    check(renderer.stats().readback.capacityWaits > 0, 'Capacity backpressure was not exercised');
    report(
      'PASS: painting advances with two GPU maps stalled; the third copy waits within 1 MiB, and revisits preserve flow'
    );

    reset();
    const displayGate = hold();
    renderer.begin(document.active, brush);
    await renderer.paint([dab(0), dab(1), dab(2)]);
    let displayed = false;
    const drawing = track(
      renderer
        .render(document.layers, { ...defaultCamera(), x: 128, y: 128 }, { width: 256, height: 256 }, 1)
        .then(() => {
          displayed = true;
        })
    );
    await delay(25);
    check(!displayed, 'Display treated the pending active tile as empty or committed pixels');
    displayGate.release();
    held = undefined;
    await drawing;
    await renderer.submitted();
    const bitmap = await createImageBitmap(await canvas.convertToBlob());
    const copy = new OffscreenCanvas(256, 256),
      context = copy.getContext('2d')!;
    context.drawImage(bitmap, 0, 0);
    bitmap.close();
    const displayedPixel = context.getImageData(128, 128, 1, 1).data;
    check(displayedPixel[0]! > displayedPixel[1]! + 20, 'Mapped preview did not show its red ink');
    report('PASS: display waits for the pending snapshot and presents the actual active pixels');

    reset();
    const old = hold();
    renderer.begin(document.active, brush);
    await renderer.paint([dab(0), dab(1), dab(2)]);
    await waitFor(() => old.arrived === 1);
    renderer.cancel();
    const next = hold();
    renderer.begin(document.active, { ...brush, color: '#00ff00' });
    await renderer.paint([dab(0), dab(1), dab(2)]);
    await waitFor(() => next.arrived === 1);
    old.release();
    await delay(10);
    check(renderer.stats().readback.pending === 1, 'An old completion released the new owner of the same buffer');
    let committed = false;
    const finishing = track(
      renderer.finish().then((result) => {
        committed = true;
        return result;
      })
    );
    await delay(25);
    check(!committed, 'Commit omitted an unfinished evicted tile');
    next.release();
    held = undefined;
    const fresh = await finishing;
    const pixel = unpackTile(fresh.find((change) => change.key === '0,0')!.after!);
    const offset = (128 * 256 + 128) * 4;
    check(
      pixel[offset] === 0 && pixel[offset + 1] === 51 && pixel[offset + 3] === 51,
      'Cancelled red pixels or old opacity reached the new stroke'
    );
    report('PASS: cancel and immediate buffer reuse reject late results; finish waits for every current tile');

    reset();
    rejectNextMap = true;
    renderer.begin(document.active, brush);
    await renderer.paint([dab(0), dab(1), dab(2)]);
    const result = await attempt(() => renderer.finish());
    check(
      !result.ok && errors.length === 1 && errors[0]!.includes('Simulated eviction map failure'),
      'A live map failure was hidden or allowed an incomplete commit'
    );
    check(document.active.tiles.size === 0, 'Map failure modified the committed document');
    errors.length = 0;
    report('PASS: failed readback rejects finish and preserves the committed document');

    reset();
    const disposal = hold();
    renderer.begin(document.active, brush);
    await renderer.paint([dab(0), dab(1), dab(2)]);
    await waitFor(() => disposal.arrived === 1);
    renderer.destroy();
    destroyed = true;
    disposal.release();
    held = undefined;
    await delay(10);
    check(errors.length === 0, errors.join('\n'));
    report('PASS: disposing a renderer with a mapped job produces no late publication or error');
  } finally {
    for (const value of gates) value.release();
    held = undefined;
    await Promise.allSettled(pending);
    // destroy is called explicitly in the last check; the renderer owns no document mutations here.
    if (!destroyed) renderer.destroy();
    device.destroy();
  }
}

/** Exercises the staging capacity change when an ABR brush follows a round brush. */
async function verifyReadbackGrowth(device: GPUDevice) {
  const queue = createReadbackQueue(device, 4);
  const textures = [32, 64, 96, 128].map((value) => {
    const texture = device.createTexture({
      size: [TILE_SIZE, TILE_SIZE],
      format: 'rgba8unorm',
      usage: GPUTextureUsage.COPY_SRC | GPUTextureUsage.COPY_DST
    });
    device.queue.writeTexture({ texture }, new Uint8Array(TILE_BYTES).fill(value), { bytesPerRow: TILE_SIZE * 4 }, [
      TILE_SIZE,
      TILE_SIZE
    ]);
    return texture;
  });
  try {
    for (const [count, capacity] of [
      [2, 2],
      [4, 4],
      [2, 4]
    ] as const) {
      const result = await (await queue.capture(textures.slice(0, count))).ready;
      if (!result.ok) throw result.error;
      if (result.value.some((tile, index) => unpackTile(tile).some((byte) => byte !== (index + 1) * 32)))
        throw new Error('Growing the staging buffer lost channel pixels');
      if (queue.stats().buffers !== 1 || queue.stats().bytes !== capacity * TILE_BYTES)
        throw new Error('Staging did not grow on demand or reuse its larger allocation');
    }
  } finally {
    queue.destroy();
    for (const texture of textures) texture.destroy();
  }
}

function gate() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release, arrived: 0 };
}
function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}
async function waitFor(condition: () => boolean) {
  const start = performance.now();
  while (!condition()) {
    if (performance.now() - start > 1000) throw new Error('GPU mapping did not reach the test gate');
    await delay(1);
  }
}
function alpha(changes: TileChange[], key: string) {
  return unpackTile(changes.find((change) => change.key === key)!.after!)[(128 * 256 + 128) * 4 + 3]!;
}
