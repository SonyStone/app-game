import { photoshopDefaultSettings } from '@app-game/psd/viewer';
import { expect, it, vi } from 'vitest';
import { makePsdClient, type PsdWorkerPort } from '../src/features/psd-worker';
import { makePsdWorkerPool } from '../src/features/psd-worker/makePsdWorkerPool';
import type { PsdReply, PsdRequest } from '../src/features/psd-worker/protocol';

it('admits a spare only after proven window work and transfers its source', async () => {
  const { pool, main, ports, spawn } = setup();
  await pool.open(new ArrayBuffer(100));
  expect(await prepare(pool)).toBe(1);
  expect(spawn).not.toHaveBeenCalled();
  await tile(pool);
  expect(await prepare(pool)).toBe(2);
  expect(spawn).toHaveBeenCalledOnce();
  expect(ports[0].transfers[0][0]).toBe(ports[0].requests[0].type === 'open' ? ports[0].requests[0].bytes : null);
  main.hold = true;
  ports[0].hold = true;
  const first = tile(pool);
  const second = tile(pool);
  expect(main.requests.at(-1)).toMatchObject({ type: 'renderWindow', liveBytes: 1024 * 1024 ** 2 });
  expect(ports[0].requests.at(-1)).toMatchObject({ type: 'renderWindow', liveBytes: 1024 * 1024 ** 2 });
  main.finish();
  ports[0].finish();
  expect((await first).ok).toBe(true);
  expect((await second).ok).toBe(true);
  pool.dispose();
});

it.each(['baseline', 'cmyk', 'depth', 'budget', 'fonts', 'fallback', 'regeneration', 'capacity', 'metadata'])(
  'keeps %s on one worker', async (reason) => {
    const { pool, spawn } = setup(reason);
    await pool.open(new ArrayBuffer(100));
    if (reason === 'fonts') {
      await pool.addFonts([]);
    }
    await tile(pool);
    expect(await prepare(pool, reason === 'regeneration' ? { ...photoshopDefaultSettings, typeLayers: true } : undefined)).toBe(1);
    expect(spawn).not.toHaveBeenCalled();
    pool.dispose();
  }
);

it('invalidates proof for changed settings or visibility, and never sends overviews to the spare', async () => {
  const { pool, ports } = setup();
  await pool.open(new ArrayBuffer(100));
  await tile(pool);
  expect(await prepare(pool)).toBe(2);
  expect(await pool.prepareWindows(1, photoshopDefaultSettings, [[1, false]], 9)).toBe(1);
  expect(await prepare(pool, { ...photoshopDefaultSettings, linearBlending: true })).toBe(1);
  await pool.renderWindow(1, photoshopDefaultSettings, [], { kind: 'overview', step: 64 }, new AbortController().signal);
  expect(ports[0].requests.filter((request) => request.type === 'renderWindow')).toHaveLength(0);
  pool.dispose();
});

it('disables the spare after its memory grows beyond its reservation', async () => {
  const { pool, ports } = setup('spare-capacity');
  await pool.open(new ArrayBuffer(100));
  await tile(pool);
  expect(await prepare(pool)).toBe(1);
  expect(ports[0].terminate).toHaveBeenCalled();
  pool.dispose();
});

it('settles a running spare on mode change and retries it serially', async () => {
  const { pool, main, ports } = setup();
  await pool.open(new ArrayBuffer(100));
  await tile(pool);
  await prepare(pool);
  main.hold = true;
  ports[0].hold = true;
  const first = tile(pool);
  const second = tile(pool);
  pool.setWorkers(1);
  main.hold = false;
  main.finish();
  expect((await first).ok).toBe(true);
  expect((await second).ok).toBe(true);
  expect(ports[0].terminate).toHaveBeenCalled();
  pool.dispose();
});

it('does not reopen a spare after restart during source handoff', async () => {
  const { pool, main, spawn } = setup();
  await pool.open(new ArrayBuffer(100));
  await tile(pool);
  main.hold = true;
  const preparing = prepare(pool);
  pool.restart();
  expect(await preparing).toBe(1);
  expect(spawn).not.toHaveBeenCalled();
  pool.dispose();
});

function setup(reason = '') {
  const main = port(reason);
  const ports: ReturnType<typeof port>[] = [];
  const spawn = vi.fn(() => {
    const spare = port(reason === 'spare-capacity' ? 'capacity' : '');
    ports.push(spare);
    return spare;
  });
  const primary = makePsdClient(main, () => port(reason));
  const pool = makePsdWorkerPool(primary, spawn, {
    workers: reason === 'baseline' ? 1 : 2,
    budgetBytes: reason === 'budget' ? 512 * 1024 ** 2 : undefined
  });
  return { pool, main, ports, spawn };
}

function prepare(pool: ReturnType<typeof makePsdWorkerPool>, settings = photoshopDefaultSettings) {
  return pool.prepareWindows(1, settings, [], 9);
}

function tile(pool: ReturnType<typeof makePsdWorkerPool>) {
  return pool.renderWindow(1, photoshopDefaultSettings, [], {
    kind: 'regions', rectangles: [{ left: 0, top: 0, width: 1, height: 1 }]
  }, new AbortController().signal);
}

function port(reason: string): PsdWorkerPort & {
  hold: boolean;
  finish(): void;
  requests: PsdRequest[];
  transfers: Transferable[][];
} {
  const requests: PsdRequest[] = [];
  const transfers: Transferable[][] = [];
  const waiting: (() => void)[] = [];
  const result: PsdWorkerPort & { hold: boolean; requests: PsdRequest[]; transfers: Transferable[][]; finish(): void } = {
    onmessage: null,
    onerror: null,
    onmessageerror: null,
    terminate: vi.fn(),
    hold: false,
    requests,
    transfers,
    finish() { waiting.shift()?.(); },
    postMessage(request: PsdRequest, transfer: Transferable[]) {
      requests.push(request);
      transfers.push(transfer);
      const reply = () => {
        let body: PsdReply;
        switch (request.type) {
          case 'open':
            body = { id: request.id, type: 'opened', document: 1,
              info: { width: 300000, height: 300000, layerRecords: reason === 'metadata' ? 5000 : 1, mode: reason === 'cmyk' ? 4 : 3, depth: reason === 'depth' ? 16 : 8 },
              layers: [], states: {}, opening: {} } as unknown as PsdReply;
            break;
          case 'original':
            body = { id: request.id, type: 'original', bytes: new Blob([new ArrayBuffer(100)]) };
            break;
          case 'addFonts':
            body = { id: request.id, type: 'fontsAdded', fonts: [], results: [] };
            break;
          default:
            body = { id: request.id, type: 'windowRendered', milliseconds: 1, images: [{
              left: 0, top: 0, width: 1, height: 1, step: 1, source: 'layers',
              strategy: reason === 'fallback' ? 'fullCanvas' : 'window', exactToLayerRender: true,
              approximations: [], pixels: new Uint8Array([1, 2, 3, 255])
            }] };
        }
        result.onmessage?.({ data: { ...body, memory: {
          wasmBytes: (reason === 'capacity' ? 1100 : 179) * 1024 ** 2, sourceBytes: 100
        } } });
      };
      if (result.hold) {
        waiting.push(reply);
      } else {
        queueMicrotask(reply);
      }
    }
  } satisfies PsdWorkerPort & { hold: boolean; requests: PsdRequest[]; transfers: Transferable[][]; finish(): void };
  return result;
}

it.each(['throughput', 'interaction'])('disables a spare when measured %s fails without telemetry', async (reason) => {
  const { pool, ports } = setup();
  await pool.open(new ArrayBuffer(100));
  await tile(pool);
  for (let index = 0; index < 32; index++) {
    pool.reportInteraction(10);
  }
  pool.reportWindowBatch({ workers: 1, tiles: 9, milliseconds: 180, workerMilliseconds: 180 });
  await prepare(pool);
  if (reason === 'throughput') {
    pool.reportWindowBatch({ workers: 2, tiles: 9, milliseconds: 160, workerMilliseconds: 180 });
  } else {
    for (let index = 0; index < 32; index++) {
      pool.reportInteraction(12);
    }
  }
  expect(ports[0].terminate).toHaveBeenCalled();
  expect(await prepare(pool)).toBe(1);
  pool.dispose();
});

it('rejects old session replies even when a replacement worker reuses document id one', async () => {
  const { pool, main } = setup();
  await pool.open(new ArrayBuffer(100));
  main.hold = true;
  const old = tile(pool);
  pool.restart();
  await pool.open(new ArrayBuffer(100));
  expect(await old).toMatchObject({ ok: false, error: { kind: 'superseded' } });
  pool.dispose();
});

it('serializes both surviving scheduler lanes after a mode change without coalescing required tiles', async () => {
  const { pool, main } = setup();
  await pool.open(new ArrayBuffer(100));
  await tile(pool);
  await prepare(pool);
  pool.setWorkers(1);
  main.hold = true;
  const jobs = [tile(pool), tile(pool), tile(pool)];
  for (let index = 0; index < jobs.length; index++) {
    await vi.waitFor(() => expect(main.requests.filter((request) => request.type === 'renderWindow')).toHaveLength(index + 2));
    main.finish();
    expect((await jobs[index]).ok).toBe(true);
  }
  pool.dispose();
});

it('keeps a canceled native slot and its reservation until the actual synchronous reply', async () => {
  const { pool, main } = setup();
  await pool.open(new ArrayBuffer(100));
  main.hold = true;
  const controller = new AbortController();
  const settled = vi.fn();
  const job = pool.renderWindow(1, photoshopDefaultSettings, [], {
    kind: 'regions', rectangles: [{ left: 0, top: 0, width: 1, height: 1 }]
  }, controller.signal).then((result) => {
    settled();
    return result;
  });
  controller.abort();
  await Promise.resolve();
  expect(settled).not.toHaveBeenCalled();
  main.finish();
  expect(await job).toMatchObject({ ok: false, error: { kind: 'superseded' } });
  pool.dispose();
});
