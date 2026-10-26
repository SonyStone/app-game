import { loadPsdViewer, photoshopDefaultSettings, type PsdRegionPixels } from '@app-game/psd/viewer';
import { readFile } from 'node:fs/promises';
import { createRoot, createSignal, flush } from 'solid-js';
import { expect, it, vi } from 'vitest';
import { largePsb } from '../../../packages/psd/test/largePsb';
import type { DisplayTile } from '../src/features/gpu-viewport/displayTiles';
import { makePsdClient, type PsdClient, type PsdResultOf, type PsdWorkerPort } from '../src/features/psd-worker';
import type { PsdRequest, WindowRequest } from '../src/features/psd-worker/protocol';
import { makePsdWorkerHost } from '../src/features/psd-worker/workerHost';
import { viewerPerformance } from '../src/features/telemetry/performance';
import { createWindowedRender } from '../src/features/viewport/createWindowedRender';
import {
  chooseLod,
  makeWindowRenderer,
  planWindow,
  type WindowSnapshot
} from '../src/features/viewport/makeWindowRenderer';

it('renders a generated large PSB through the worker and refuses whole-canvas operations', async () => {
  const { client, sent } = connect();
  const opened = value(await client.open(largePsb().buffer as ArrayBuffer));
  expect(opened.opening.reader).toBe('strict');
  const renderer = makeWindowRenderer(client);
  const snapshot = { opened, settings: photoshopDefaultSettings, visibility: [] };
  const rendered = value(
    await renderer.render(
      snapshot,
      { scale: 1, x: -299000, y: -299000 },
      { width: 144, height: 144 },
      new AbortController().signal,
      vi.fn()
    )
  );
  expect(rendered.window).toMatchObject({ source: 'layers', step: 1, strategy: 'window', exactToLayerRender: true });
  expect(sample(rendered.tiles!, 299008, 299008)).toEqual([255, 0, 0, 255]);
  expect(rendered.pixels.byteLength).toBe(0);
  expect(sent.some((request) => request.type === 'renderWindow' && request.window.kind === 'regions')).toBe(true);
  expect(await client.render(opened.document, photoshopDefaultSettings, [])).toMatchObject({
    ok: false,
    error: { kind: 'unsupported' }
  });
  expect(await client.merged(opened.document)).toMatchObject({ ok: false, error: { kind: 'unsupported' } });
  expect(value(await client.detectBlending(opened.document, photoshopDefaultSettings, [])).linearBlending).toBeNull();
  client.dispose();
});

it('transfers typed budget refusals without breaking subsequent worker requests', async () => {
  const codec = await loadPsdViewer();
  const open = codec.PsdDocumentHandle.openWithBudget;
  const refused = vi
    .spyOn(codec.PsdDocumentHandle, 'openWithBudget')
    .mockImplementationOnce((bytes, options) => open(bytes, { ...options, allocationBytes: 1 }));
  const { client } = connect();
  try {
    expect(await client.open(largePsb().buffer as ArrayBuffer)).toMatchObject({
      ok: false,
      error: {
        kind: 'budget',
        resource: 'allocation bytes',
        limit: 1n,
        message: expect.stringContaining("exceeds the viewer's resource budget")
      }
    });
    const opened = value(await client.open(largePsb().buffer as ArrayBuffer));
    expect(opened.info).toMatchObject({ width: 300000, height: 300000 });
  } finally {
    refused.mockRestore();
    client.dispose();
  }
});

it('preserves audited allocation failures through the facade and worker and permits another open', async () => {
  const codec = await loadPsdViewer();
  const refused = vi.spyOn(codec.PsdDocumentHandle, 'openWithBudget').mockImplementationOnce(() => {
    throw Object.assign(new Error('buffer allocation failed'), { name: 'PsdAllocationError', requested: 4096n });
  });
  const { client } = connect();
  try {
    expect(await client.open(largePsb().buffer as ArrayBuffer)).toEqual({
      ok: false,
      error: { kind: 'allocation', message: 'buffer allocation failed', requested: 4096n }
    });
    expect(value(await client.open(largePsb().buffer as ArrayBuffer)).info.width).toBe(300000);
  } finally {
    refused.mockRestore();
    client.dispose();
  }
});

it('retains strict fixture tiles without assembly and invalidates them after edits', async () => {
  const { client, sent } = connect();
  const bytes = await readFile(new URL('../src/features/examples/assets/adjustment-stack.psd', import.meta.url));
  const opened = value(
    await client.open(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer)
  );
  const whole = value(await client.render(opened.document, photoshopDefaultSettings, []));
  const renderer = makeWindowRenderer(client);
  const snapshot = { opened, settings: photoshopDefaultSettings, visibility: [] };
  const image = value(
    await renderer.render(
      snapshot,
      { scale: 1, x: 0, y: 0 },
      { width: 96, height: 96 },
      new AbortController().signal,
      vi.fn()
    )
  );
  expect(image.pixels.byteLength).toBe(0);
  expect(image.tiles!.at(-1)!.image.pixels).toEqual(whole.pixels);
  const count = sent.length;
  await renderer.render(
    snapshot,
    { scale: 1.25, x: 0, y: 0 },
    { width: 96, height: 96 },
    new AbortController().signal,
    vi.fn()
  );
  expect(sent).toHaveLength(count);
  const edited = value(
    await renderer.render(
      { ...snapshot, visibility: [[4, false]] },
      { scale: 1, x: 0, y: 0 },
      { width: 96, height: 96 },
      new AbortController().signal,
      vi.fn()
    )
  );
  expect(edited.tiles!.at(-1)!.image.pixels).not.toEqual(whole.pixels);
  expect(sent).toHaveLength(count + 1);
  renderer.clear();
  expect(renderer.cacheBytes()).toBe(0);
  client.dispose();
});

it('bounds the LRU while panning and samples correctly across 512-pixel tile edges', async () => {
  const { client, calls } = synthetic();
  const renderer = makeWindowRenderer(client);
  const snapshot = fakeSnapshot(100000, 100000);
  // At scale 1/3 the complete overview is too large, so regions are sampled at stride three.
  for (let index = 0; index < 12; index++) {
    const image = value(
      await renderer.render(
        snapshot,
        { scale: 1 / 3, x: -index * 700, y: -index * 700 },
        { width: 300, height: 300 },
        new AbortController().signal,
        vi.fn()
      )
    );
    expect(image.pixels.byteLength).toBe(0);
    for (const tile of image.tiles!) {
      for (const [x, y] of [
        [tile.clip.left, tile.clip.top],
        [tile.clip.left + tile.clip.width - 1, tile.clip.top + tile.clip.height - 1]
      ]) {
        expect(sample([tile], x, y)).toEqual([x % 256, y % 256, 0, 255]);
      }
    }

    expect(renderer.cacheBytes()).toBeLessThanOrEqual(64 * 1024 * 1024);
  }

  expect(calls.length).toBeGreaterThan(32);
});

it('replaces saved pixels with fresh overviews and never caches the potentially stale preview', async () => {
  const { client, calls } = synthetic();
  const renderer = makeWindowRenderer(client);
  const snapshot = fakeSnapshot(30806, 45624);
  const preview = vi.fn();
  const image = value(
    await renderer.render(
      snapshot,
      { scale: 1 / 64, x: 0, y: 0 },
      { width: 600, height: 800 },
      new AbortController().signal,
      preview
    )
  );
  expect(preview.mock.calls[0][0].window).toMatchObject({ source: 'savedComposite', exactToLayerRender: false });
  expect(image.window).toMatchObject({ source: 'layers', exactToLayerRender: true, step: 64 });
  expect(calls.map((call) => call.kind)).toEqual(['saved', 'overview']);
  await renderer.render(
    snapshot,
    { scale: 1 / 64, x: 10, y: 10 },
    { width: 600, height: 800 },
    new AbortController().signal,
    preview
  );
  expect(calls).toHaveLength(2);
  await renderer.render(
    { ...snapshot },
    { scale: 1 / 64, x: 10, y: 10 },
    { width: 600, height: 800 },
    new AbortController().signal,
    preview
  );
  expect(calls.map((call) => call.kind)).toEqual(['saved', 'overview']);
});

it('never introduces a saved preview after displaying regions or changing render inputs', async () => {
  const { client, calls } = synthetic();
  const renderer = makeWindowRenderer(client);
  const snapshot = fakeSnapshot(30806, 45624);
  const signal = new AbortController().signal;
  const preview = vi.fn();
  await renderer.render(snapshot, { scale: 1, x: 0, y: 0 }, { width: 100, height: 100 }, signal, preview);
  await renderer.render(
    { ...snapshot, visibility: [[1, false]] },
    { scale: 1 / 64, x: 0, y: 0 },
    { width: 600, height: 800 },
    signal,
    preview
  );
  expect(calls.map((call) => call.kind)).toEqual(['regions', 'overview']);
  expect(preview.mock.calls.every(([frame]) => frame.window.source === 'layers')).toBe(true);
});

it('returns a fresh-layer refusal after a saved first frame instead of leaving it as a successful final image', async () => {
  const { client } = synthetic();
  const wrapped = {
    renderWindow: vi
      .fn<PsdClient['renderWindow']>()
      .mockImplementation(async (...args) =>
        args[3].kind === 'overview'
          ? { ok: false, error: { kind: 'unsupported', message: 'spatial fallback exceeds the budget' } }
          : client.renderWindow(...args)
      )
  };
  const preview = vi.fn();
  const result = await makeWindowRenderer(wrapped).render(
    fakeSnapshot(30806, 45624),
    { scale: 1 / 64, x: 0, y: 0 },
    { width: 600, height: 800 },
    new AbortController().signal,
    preview
  );
  expect(preview).toHaveBeenCalledOnce();
  expect(result).toMatchObject({ ok: false, error: { kind: 'unsupported' } });
});

it('salvages a camera-obsolete tile, stops before the next tile, and reuses it on revisit', async () => {
  const { client } = synthetic();
  let finish!: () => void;
  const wrapped = {
    renderWindow: vi.fn<PsdClient['renderWindow']>().mockImplementation(
      (...args) =>
        new Promise((resolve) => {
          finish = async () => resolve(await client.renderWindow(...args));
        })
    )
  };
  const renderer = makeWindowRenderer(wrapped);
  const controller = new AbortController();
  const preview = vi.fn();
  const rendering = renderer.render(
    fakeSnapshot(300000, 300000),
    { scale: 1, x: 0, y: 0 },
    { width: 1600, height: 1600 },
    controller.signal,
    preview
  );
  controller.abort();
  finish();
  expect(await rendering).toBeUndefined();
  expect(wrapped.renderWindow).toHaveBeenCalledOnce();
  expect(renderer.cacheBytes()).toBeGreaterThan(0);
  expect(preview).not.toHaveBeenCalled();
});

it('drops intermediate pan/zoom requests in the worker queue, including an aborted in-flight reply', async () => {
  const sent: PsdRequest[] = [];
  const port: PsdWorkerPort = {
    onmessage: null,
    onerror: null,
    onmessageerror: null,
    terminate: vi.fn(),
    postMessage: (message) => {
      sent.push(message);
    }
  };
  const client = makePsdClient(port);
  const controllers = Array.from({ length: 3 }, () => new AbortController());
  const window = { kind: 'overview', step: 64 } as const;
  const first = client.renderWindow(1, photoshopDefaultSettings, [], window, controllers[0].signal);
  const second = client.renderWindow(1, photoshopDefaultSettings, [], window, controllers[1].signal);
  controllers[0].abort();
  controllers[1].abort();
  const third = client.renderWindow(
    1,
    photoshopDefaultSettings,
    [],
    { kind: 'regions', rectangles: [{ left: 10, top: 10, width: 5, height: 5 }] },
    controllers[2].signal
  );
  expect(await first).toMatchObject({ ok: false, error: { kind: 'superseded' } });
  expect(await second).toMatchObject({ ok: false, error: { kind: 'superseded' } });
  expect(sent).toHaveLength(1);
  port.onmessage!({ data: { id: sent[0].id, type: 'windowRendered', images: [], milliseconds: 0 } });
  await vi.waitFor(() => expect(sent).toHaveLength(2));
  expect(sent[1]).toMatchObject({ window: { kind: 'regions' } });
  port.onmessage!({ data: { id: sent[1].id, type: 'windowRendered', images: [], milliseconds: 0 } });
  expect(await third).toMatchObject({ ok: true });
  client.dispose();
});

it('clears temporary saved frames on pan cancellation and rejects late overview completion', async () => {
  const state = reactiveRenderer();
  flush();
  expect(state.jobs[0].window.kind).toBe('saved');
  state.jobs[0].resolve({ ok: true, value: { images: [singlePixel('savedComposite')], milliseconds: 1 } });
  await vi.waitFor(() => {
    flush();
    expect(state.jobs).toHaveLength(2);
  });
  expect(value(state.render()).window?.source).toBe('savedComposite');
  state.pan({ scale: 1, x: -1000, y: -1000 });
  flush();
  expect(state.jobs[1].signal.aborted).toBe(false);
  expect(state.render()).toBeUndefined();
  expect(state.jobs).toHaveLength(2);
  state.jobs[1].resolve({ ok: true, value: { images: [singlePixel('layers')], milliseconds: 1 } });
  await vi.waitFor(() => expect(state.jobs).toHaveLength(3));
  flush();
  expect(state.jobs[2].window.kind).toBe('regions');
  state.dispose();
  expect(state.jobs[2].signal.aborted).toBe(true);
  state.jobs[2].resolve({ ok: false, error: { kind: 'superseded', message: 'disposed' } });
});

it('keeps fresh coverage through an off-document camera without another worker request', async () => {
  const state = reactiveRenderer();
  flush();
  state.jobs[0].resolve({ ok: true, value: { images: [singlePixel('savedComposite')], milliseconds: 1 } });
  await vi.waitFor(() => {
    flush();
    expect(state.jobs).toHaveLength(2);
  });
  state.jobs[1].resolve({ ok: true, value: { images: [singlePixel('layers')], milliseconds: 1 } });
  await vi.waitFor(() => {
    flush();
    expect(state.busy()).toBe(false);
  });
  const before = state.render();
  state.pan({ scale: 1, x: 5000, y: 5000 });
  await vi.waitFor(() => {
    flush();
    expect(state.busy()).toBe(false);
  });
  expect(state.render()).toBe(before);
  expect(state.jobs).toHaveLength(2);
  state.dispose();
});

it('clears the saved first frame when fresh layer rendering fails', async () => {
  const state = reactiveRenderer();
  flush();
  state.jobs[0].resolve({ ok: true, value: { images: [singlePixel('savedComposite')], milliseconds: 1 } });
  await vi.waitFor(() => {
    flush();
    expect(state.jobs).toHaveLength(2);
  });
  expect(value(state.render()).window?.source).toBe('savedComposite');
  state.jobs[1].resolve({ ok: false, error: { kind: 'unsupported', message: 'work limit' } });
  await vi.waitFor(() => {
    flush();
    expect(state.busy()).toBe(false);
  });
  expect(state.render()).toMatchObject({ ok: false, error: { kind: 'unsupported' } });
  state.dispose();
});

it('plans bounded overviews and viewport-only regions, including empty/off-canvas views', () => {
  expect(
    planWindow({ width: 30806, height: 45624 }, { scale: 1 / 64, x: 0, y: 0 }, { width: 1000, height: 768 })
  ).toEqual({ kind: 'overview', step: 64 });
  expect(
    planWindow({ width: 300000, height: 300000 }, { scale: 1, x: 5000, y: 5000 }, { width: 1000, height: 768 })
  ).toBeUndefined();
  const plan = planWindow({ width: 300000, height: 300000 }, { scale: 1, x: 0, y: 0 }, { width: 8000, height: 8000 });
  expect(plan?.kind).toBe('regions');
  if (plan?.kind === 'regions') {
    expect(
      Math.ceil(plan.rectangle.width / plan.step) * Math.ceil(plan.rectangle.height / plan.step)
    ).toBeLessThanOrEqual(4_194_304);
  }
});

it('plans filtered region coverage when zoom-out source bytes cannot coexist in the LRU', () => {
  const size = { width: 30806, height: 45624 };
  const viewport = { width: 840, height: 900 };
  expect(planWindow(size, { scale: 0.7, x: -5000, y: -7000 }, viewport)?.kind).toBe('regions');
  const plan = planWindow(size, { scale: 0.1, x: -500, y: -700 }, viewport);
  expect(plan?.kind).toBe('regions');
});

it('clips coarse preview coverage to odd document bounds', async () => {
  const client: Pick<PsdClient, 'renderWindow'> = {
    async renderWindow(_document, _settings, _visibility, window) {
      const step = window.kind === 'regions' ? 1 : window.step;
      return {
        ok: true,
        value: {
          images: [{ ...singlePixel('layers'), width: 3, height: 4, step, pixels: new Uint8Array(3 * 4 * 4) }],
          milliseconds: 1
        }
      };
    }
  };
  const renderer = makeWindowRenderer(client);
  const result = value(
    await renderer.render(
      fakeSnapshot(5, 7),
      { scale: 0.5, x: 0, y: 0 },
      { width: 100, height: 100 },
      new AbortController().signal,
      vi.fn()
    )
  );
  expect(result.tiles![0].clip).toEqual({ left: 0, top: 0, width: 5, height: 7 });
  renderer.clear();
});

function connect() {
  const sent: PsdRequest[] = [];
  const port: PsdWorkerPort = {
    onmessage: null,
    onerror: null,
    onmessageerror: null,
    terminate: vi.fn(),
    postMessage(message, transfer) {
      sent.push(message);
      void host.receive(structuredClone(message, { transfer }));
    }
  };
  const host = makePsdWorkerHost((reply, transfer) => {
    const data = structuredClone(reply, { transfer });
    queueMicrotask(() => port.onmessage?.({ data }));
  });
  return { client: makePsdClient(port), sent };
}

function fakeSnapshot(width: number, height: number): WindowSnapshot {
  return {
    opened: { document: 1, info: { width, height, depth: 8 } } as WindowSnapshot['opened'],
    settings: photoshopDefaultSettings,
    visibility: []
  };
}

/** Pixel values encode coordinates so misplaced and mis-sampled tile edges fail independently of the planner. */
function synthetic() {
  const calls: WindowRequest[] = [];
  const client: Pick<PsdClient, 'renderWindow'> = {
    async renderWindow(_document, _settings, _visibility, window) {
      calls.push(window);
      const rectangles = window.kind === 'regions' ? window.rectangles : [{ left: 0, top: 0, width: 8, height: 8 }];
      const images: PsdRegionPixels[] = rectangles.map((rectangle) => {
        const pixels = new Uint8Array(rectangle.width * rectangle.height * 4);
        for (let y = 0; y < rectangle.height; y++) {
          for (let x = 0; x < rectangle.width; x++) {
            pixels.set([(rectangle.left + x) % 256, (rectangle.top + y) % 256, 0, 255], (y * rectangle.width + x) * 4);
          }
        }

        return {
          ...rectangle,
          pixels,
          step: window.kind === 'regions' ? 1 : window.step,
          source: window.kind === 'saved' ? 'savedComposite' : 'layers',
          strategy: 'window',
          exactToLayerRender: window.kind !== 'saved',
          approximations: []
        };
      });
      return { ok: true, value: { images, milliseconds: 1 } };
    }
  };
  return { client, calls };
}

function value<T>(result: PsdResultOf<T> | undefined): T {
  if (!result?.ok) {
    throw new Error(result ? result.error.message : 'no result');
  }

  return result.value;
}

/** Drives the owned reactive binding with controllable worker replies, including replies arriving after disposal. */
function reactiveRenderer() {
  const jobs: {
    window: WindowRequest;
    signal: AbortSignal;
    resolve: (result: Awaited<ReturnType<PsdClient['renderWindow']>>) => void;
  }[] = [];
  const client: Pick<PsdClient, 'renderWindow'> = {
    renderWindow: (_document, _settings, _visibility, window, signal) =>
      new Promise((resolve) => {
        jobs.push({ window, signal, resolve });
      })
  };
  return createRoot((dispose) => {
    const [view, pan] = createSignal({ scale: 1 / 64, x: 0, y: 0 });
    const snapshot = fakeSnapshot(30806, 45624);
    const state = createWindowedRender(
      client,
      () => ({ ok: true, value: snapshot.opened }),
      () => snapshot.settings,
      () => [],
      { view, size: () => ({ width: 100, height: 100 }) }
    );
    return { ...state, jobs, pan, dispose };
  });
}

function singlePixel(source: PsdRegionPixels['source']): PsdRegionPixels {
  return {
    left: 0,
    top: 0,
    width: 1,
    height: 1,
    step: 64,
    pixels: new Uint8Array(4),
    strategy: 'window',
    source,
    exactToLayerRender: source === 'layers',
    approximations: []
  };
}

/** Reads the retained strict bytes in tests only, independently of GPU display transforms. */
function sample(tiles: readonly DisplayTile[], x: number, y: number) {
  const tile = tiles.find(
    (tile) =>
      x >= tile.clip.left &&
      x < tile.clip.left + tile.clip.width &&
      y >= tile.clip.top &&
      y < tile.clip.top + tile.clip.height
  )!;
  const index =
    (Math.floor((y - tile.top) / tile.step) * tile.image.width + Math.floor((x - tile.left) / tile.step)) * 4;
  return [...tile.image.pixels.subarray(index, index + 4)];
}

it('deduplicates overlapping camera demand and retains the original tile identity on a warm revisit', async () => {
  const { client } = synthetic();
  let finish!: () => void;
  const wrapped = {
    renderWindow: vi.fn<PsdClient['renderWindow']>().mockImplementation(
      (...args) =>
        new Promise((resolve) => {
          finish = async () => resolve(await client.renderWindow(...args));
        })
    )
  };
  const renderer = makeWindowRenderer(wrapped);
  const snapshot = fakeSnapshot(300000, 300000);
  const firstController = new AbortController();
  const size = { width: 100, height: 100 };
  const first = renderer.render(snapshot, { scale: 1, x: 0, y: 0 }, size, firstController.signal, vi.fn());
  firstController.abort();
  const second = renderer.render(snapshot, { scale: 1, x: -10, y: 0 }, size, new AbortController().signal, vi.fn());
  expect(wrapped.renderWindow).toHaveBeenCalledOnce();
  finish();
  expect(await first).toBeUndefined();
  const tile = value(await second).tiles![0];
  const warm = value(
    await renderer.render(snapshot, { scale: 1, x: 0, y: 0 }, size, new AbortController().signal, vi.fn())
  );
  expect(warm.tiles![0]).toBe(tile);
  expect(wrapped.renderWindow).toHaveBeenCalledOnce();
  renderer.clear();
});

it('discards a late tile after semantic invalidation rather than admitting it into the next snapshot', async () => {
  const { client } = synthetic();
  const jobs: (() => void)[] = [];
  const signals: AbortSignal[] = [];
  const wrapped = {
    renderWindow: vi.fn<PsdClient['renderWindow']>().mockImplementation(
      (...args) =>
        new Promise((resolve) => {
          signals.push(args[4]);
          jobs.push(async () => resolve(await client.renderWindow(...args)));
        })
    )
  };
  const renderer = makeWindowRenderer(wrapped);
  const snapshot = fakeSnapshot(300000, 300000);
  const first = renderer.render(
    snapshot,
    { scale: 1, x: 0, y: 0 },
    { width: 100, height: 100 },
    new AbortController().signal,
    vi.fn()
  );
  const next = renderer.render(
    { ...snapshot, visibility: [[1, false]] },
    { scale: 1, x: 0, y: 0 },
    { width: 100, height: 100 },
    new AbortController().signal,
    vi.fn()
  );
  expect(signals[0].aborted).toBe(true);
  jobs[0]();
  expect(await first).toBeUndefined();
  expect(renderer.cacheBytes()).toBeGreaterThan(0); // The next tile has an accounted reservation.
  jobs[1]();
  expect(value(await next).tiles!.at(-1)!.step).toBe(1);
  renderer.clear();
});

it('holds LOD through boundary jitter and accounts for physical DPR', () => {
  expect(chooseLod(0.39, 1)).toBe(2);
  expect(chooseLod(0.41, 2)).toBe(2);
  expect(chooseLod(0.59, 2)).toBe(2);
  expect(chooseLod(0.61, 2)).toBe(1);
  expect(chooseLod(0.3, 1)).toBe(2);
  expect(chooseLod(0.3 * 2, 1)).toBe(1);
});

it('retains unaffected tile identities after a local visibility edit, including neighbor filter support', async () => {
  const { client, calls } = synthetic();
  const renderer = makeWindowRenderer(client);
  const snapshot = fakeSnapshot(300000, 300000);
  snapshot.opened.layers = [
    { index: 1, kind: 'pixel', bounds: { left: 510, top: 0, right: 511, bottom: 50 } }
  ] as WindowSnapshot['opened']['layers'];
  const args = [{ scale: 1, x: 0, y: 0 }, { width: 1300, height: 100 }, new AbortController().signal, vi.fn()] as const;
  const before = value(await renderer.render(snapshot, ...args));
  const count = calls.length;
  const after = value(await renderer.render({ ...snapshot, visibility: [[1, false]] }, ...args));
  // The first two source rectangles include the edited texel. The third rectangle is still valid.
  expect(calls.length - count).toBe(2);
  const untouched = before.tiles!.find((tile) => tile.clip.left === 1024)!;
  expect(after.tiles).toContain(untouched);
  renderer.clear();
});

it('serializes unrelated camera demands outside the worker and skips obsolete waiters', async () => {
  const { client } = synthetic();
  const jobs: (() => void)[] = [];
  const wrapped = {
    renderWindow: vi
      .fn<PsdClient['renderWindow']>()
      .mockImplementation(
        (...args) => new Promise((resolve) => jobs.push(async () => resolve(await client.renderWindow(...args))))
      )
  };
  const renderer = makeWindowRenderer(wrapped);
  const snapshot = fakeSnapshot(300000, 300000);
  const controllers = Array.from({ length: 3 }, () => new AbortController());
  const views = controllers.map((controller, index) =>
    renderer.render(
      snapshot,
      { scale: 1, x: -index * 2000, y: 0 },
      { width: 100, height: 100 },
      controller.signal,
      vi.fn()
    )
  );
  controllers[0].abort();
  controllers[1].abort();
  expect(wrapped.renderWindow).toHaveBeenCalledOnce();
  jobs[0]();
  await vi.waitFor(() => expect(jobs).toHaveLength(2));
  expect(wrapped.renderWindow.mock.calls[1][3]).toMatchObject({ rectangles: [{ left: 3568 }] });
  jobs[1]();
  await vi.waitFor(() => expect(jobs).toHaveLength(3));
  jobs[2]();
  await Promise.all(views);
  expect(wrapped.renderWindow).toHaveBeenCalledTimes(3);
  renderer.clear();
});

it('shares an unaffected in-flight tile across a visibility edit instead of rendering it twice', async () => {
  const { client } = synthetic();
  let finish!: () => void;
  const wrapped = {
    renderWindow: vi.fn<PsdClient['renderWindow']>().mockImplementation(
      (...args) =>
        new Promise((resolve) => {
          finish = async () => resolve(await client.renderWindow(...args));
        })
    )
  };
  const renderer = makeWindowRenderer(wrapped);
  const snapshot = fakeSnapshot(300000, 300000);
  snapshot.opened.layers = [
    { index: 1, kind: 'pixel', bounds: { left: 10000, top: 10000, right: 10100, bottom: 10100 } }
  ] as WindowSnapshot['opened']['layers'];
  const args = [{ scale: 1, x: 0, y: 0 }, { width: 100, height: 100 }, new AbortController().signal, vi.fn()] as const;
  const first = renderer.render(snapshot, ...args);
  const edited = renderer.render({ ...snapshot, visibility: [[1, false]] }, ...args);
  expect(wrapped.renderWindow).toHaveBeenCalledOnce();
  expect(wrapped.renderWindow.mock.calls[0][4].aborted).toBe(false);
  finish();
  expect(await first).toBeUndefined();
  expect(value(await edited).tiles!.at(-1)!.step).toBe(1);
  expect(wrapped.renderWindow).toHaveBeenCalledOnce();
  renderer.clear();
});

it('counts one obsolete native batch when several canceled camera consumers share its result', async () => {
  const { client } = synthetic();
  let finish!: () => void;
  const wrapped = {
    renderWindow: vi.fn<PsdClient['renderWindow']>().mockImplementation(
      (...args) =>
        new Promise((resolve) => {
          finish = async () => resolve(await client.renderWindow(...args));
        })
    )
  };
  const record = vi.spyOn(viewerPerformance, 'record');
  try {
    const renderer = makeWindowRenderer(wrapped);
    const snapshot = fakeSnapshot(300000, 300000);
    const controllers = Array.from({ length: 3 }, () => new AbortController());
    const results = controllers.map((controller) =>
      renderer.render(snapshot, { scale: 1, x: 0, y: 0 }, { width: 100, height: 100 }, controller.signal, vi.fn())
    );
    controllers[0].abort();
    controllers[1].abort();
    finish();
    await Promise.all(results);
    expect(wrapped.renderWindow).toHaveBeenCalledOnce();
    expect(record.mock.calls.filter(([name]) => name === 'cancellation.obsoleteBatchTiles')).toHaveLength(1);
    expect(record.mock.calls.filter(([name]) => name === 'cancellation.salvagedTiles')).toHaveLength(1);
    renderer.clear();
  } finally {
    record.mockRestore();
  }
});
