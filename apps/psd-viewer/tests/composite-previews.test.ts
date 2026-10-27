import { prepareGpuLayers } from '@app-game/psd/gpu';
import { openPsd, photoshopDefaultSettings } from '@app-game/psd/viewer';
import { readFile } from 'node:fs/promises';
import { expect, it, vi } from 'vitest';
import { makeCompositePreviews, type CompositeDiagnostics } from '../src/features/gpu-composite/makeCompositePreviews';
import type { PsdClient } from '../src/features/psd-worker';
import type { WindowSnapshot } from '../src/features/viewport/makeWindowRenderer';

it('verifies the complete identity with zero tolerance, including transparent RGB, and disables on mismatch', async () => {
  const opened = await openPsd(
    await readFile(new URL('../../../packages/psd/test/editor/flat-rgb8.psd', import.meta.url))
  );
  if (!opened.ok) {
    throw new Error(opened.error.message);
  }
  const doc = opened.value;
  const rect = { left: 0, top: 0, width: 8, height: 8 };
  const snapshot: WindowSnapshot = {
    opened: { document: 1, info: doc.info, layers: [...doc.layers], states: doc.states, opening: doc.opening },
    settings: photoshopDefaultSettings,
    visibility: [],
    gpuComposite: true
  };
  const client = {
    renderWindow: vi.fn(),
    gpuLayers: vi.fn(async () => prepareGpuLayers(doc, rect, snapshot.settings))
  };
  const changes: CompositeDiagnostics[] = [];
  const previews = makeCompositePreviews(client, (next) => changes.push(next));
  const mismatch = vi.fn();
  try {
    const first = await previews.prepare(snapshot, rect, rect, mismatch);
    const strict = doc.renderRegion(rect, snapshot.settings);
    expect(first?.tile.gpu?.identity).toContain('rgb8-integer-v2');
    expect(strict.ok).toBe(true);
    if (!first || !strict.ok) {
      return;
    }
    first.tile.gpu!.onReadback(strict.value.pixels.slice());
    expect(changes.at(-1)!.state).toBe('preview');
    first.strict(strict.value);
    expect(changes.at(-1)).toMatchObject({ state: 'verified', verifiedTiles: 1, differingSamples: 0 });
    const second = await previews.prepare({ ...snapshot, visibility: [[0, false]] }, rect, rect, mismatch);
    expect(second?.tile.gpu?.identity).not.toBe(first.tile.gpu?.identity);
    expect(client.gpuLayers).toHaveBeenCalledOnce();
    const fontRevision = await previews.prepare({ ...snapshot, revision: 1 }, rect, rect, mismatch);
    expect(fontRevision?.tile.gpu?.identity).not.toBe(first.tile.gpu?.identity);
    expect(client.gpuLayers).toHaveBeenCalledTimes(2);
    const corrupted = strict.value.pixels.slice();
    corrupted[0] ^= 1;
    second!.strict(strict.value);
    second!.tile.gpu!.onReadback(corrupted);
    expect(changes.at(-1)).toMatchObject({ state: 'disabled', differingSamples: 1 });
    expect(mismatch).toHaveBeenCalledOnce();
    previews.clear();
    expect(await previews.prepare(snapshot, rect, rect, mismatch)).toBeUndefined();
    const nextDocument = { ...snapshot, opened: { ...snapshot.opened, layers: [...snapshot.opened.layers] } };
    expect(await previews.prepare(nextDocument, rect, rect, mismatch)).toBeDefined();
  } finally {
    previews.clear();
    doc.close();
  }
});

it('discards a verification arriving after a different document opens', async () => {
  const opened = await openPsd(
    await readFile(new URL('../../../packages/psd/test/editor/flat-rgb8.psd', import.meta.url))
  );
  if (!opened.ok) {
    throw new Error(opened.error.message);
  }
  const doc = opened.value;
  const rect = { left: 0, top: 0, width: 2, height: 2 };
  const snapshot: WindowSnapshot = {
    opened: { document: 1, info: doc.info, layers: [...doc.layers], states: doc.states, opening: doc.opening },
    settings: photoshopDefaultSettings,
    visibility: []
  };
  const previews = makeCompositePreviews({
    renderWindow: vi.fn(),
    gpuLayers: vi.fn(async () => prepareGpuLayers(doc, rect, snapshot.settings))
  });
  const mismatch = vi.fn();
  try {
    const old = await previews.prepare(snapshot, rect, rect, mismatch);
    await previews.prepare(
      { ...snapshot, opened: { ...snapshot.opened, document: 2, layers: [...snapshot.opened.layers] } },
      rect,
      rect,
      mismatch
    );
    const strict = doc.renderRegion(rect, snapshot.settings);
    if (old && strict.ok) {
      old.strict(strict.value);
      old.tile.gpu!.onReadback(new Uint8Array(strict.value.pixels.length));
    }
    expect(mismatch).not.toHaveBeenCalled();
  } finally {
    previews.clear();
    doc.close();
  }
});

it('removes an interactive candidate when the authoritative worker refuses verification', async () => {
  const { makeWindowRenderer } = await import('../src/features/viewport/makeWindowRenderer');
  const opened = await openPsd(
    await readFile(new URL('../../../packages/psd/test/editor/flat-rgb8.psd', import.meta.url))
  );
  if (!opened.ok) {
    throw new Error(opened.error.message);
  }
  const doc = opened.value;
  const changes: CompositeDiagnostics[] = [];
  const client = {
    renderWindow: vi.fn(async () => ({
      ok: false as const,
      error: { kind: 'unsupported' as const, message: 'strict refusal' }
    })),
    gpuLayers: vi.fn(async (...[_document, rect, settings]: Parameters<PsdClient['gpuLayers']>) =>
      prepareGpuLayers(doc, rect, settings)
    )
  };
  const renderer = makeWindowRenderer(client, undefined, (state) => changes.push(state));
  const snapshot: WindowSnapshot = {
    opened: {
      document: 1,
      info: doc.info,
      layers: [...doc.layers],
      states: doc.states,
      opening: doc.opening,
      windowed: true
    },
    settings: photoshopDefaultSettings,
    visibility: [[0, true]],
    gpuComposite: true
  };
  try {
    const result = await renderer.render(
      snapshot,
      { x: 0, y: 0, scale: 1 },
      { width: 32, height: 24 },
      new AbortController().signal,
      (image) => {
        image.tiles?.forEach((tile) => tile.gpu?.onSubmitted?.());
      }
    );
    expect(result).toMatchObject({ ok: false });
    expect(changes.at(-1)).toMatchObject({ state: 'disabled', preparedBytes: 0 });
    expect(changes.at(-1)?.reason).toContain('Strict verification refused');
    expect(renderer.cacheBytes()).toBe(0);
  } finally {
    renderer.clear();
    doc.close();
  }
});

it('a camera replacement still waits for strict publication when a GPU preview is already cached', async () => {
  const { makeWindowRenderer } = await import('../src/features/viewport/makeWindowRenderer');
  const opened = await openPsd(
    await readFile(new URL('../../../packages/psd/test/editor/flat-rgb8.psd', import.meta.url))
  );
  if (!opened.ok) {
    throw new Error(opened.error.message);
  }
  const doc = opened.value;
  const rect = { left: 0, top: 0, width: doc.info.width, height: doc.info.height };
  const strict = doc.renderRegion(rect, photoshopDefaultSettings);
  if (!strict.ok) {
    throw new Error(strict.error.message);
  }
  let finish!: () => void;
  let start!: () => void;
  const started = new Promise<void>((resolve) => {
    start = resolve;
  });
  const client = {
    renderWindow: vi.fn(
      () =>
        new Promise<Awaited<ReturnType<PsdClient['renderWindow']>>>((resolve) => {
          finish = () => resolve({ ok: true, value: { images: [strict.value], milliseconds: 0 } });
          start();
        })
    ),
    gpuLayers: vi.fn(async (...[_document, rect, settings]: Parameters<PsdClient['gpuLayers']>) =>
      prepareGpuLayers(doc, rect, settings)
    )
  };
  const renderer = makeWindowRenderer(client);
  const snapshot: WindowSnapshot = {
    opened: {
      document: 1,
      info: doc.info,
      layers: [...doc.layers],
      states: doc.states,
      opening: doc.opening,
      windowed: true
    },
    settings: photoshopDefaultSettings,
    visibility: [[0, true]],
    gpuComposite: true
  };
  const obsolete = new AbortController();
  try {
    const first = renderer.render(snapshot, { x: 0, y: 0, scale: 1 }, rect, obsolete.signal, (image) => {
      for (const tile of image.tiles ?? []) {
        if (tile.gpu) {
          tile.gpu.onSubmitted?.();
          const corrupt = strict.value.pixels.slice();
          corrupt[0] ^= 1;
          tile.gpu.onReadback(corrupt);
        }
      }
    });
    await started;
    obsolete.abort();
    const published: { gpu: boolean; exact: boolean }[] = [];
    let completed = false;
    const replacement = renderer
      .render(snapshot, { x: -1, y: 0, scale: 1 }, rect, new AbortController().signal, (image) => {
        published.push({ gpu: image.tiles!.some((tile) => !!tile.gpu), exact: image.window!.exactToLayerRender });
      })
      .then((result) => {
        completed = true;
        return result;
      });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(completed).toBe(false);
    finish();
    await Promise.all([first, replacement]);
    expect(client.renderWindow).toHaveBeenCalledOnce();
    expect(published.at(-1)).toEqual({ gpu: false, exact: true });
  } finally {
    renderer.clear();
    doc.close();
  }
});

it('clearing a pending preparation prevents late CPU residency and preview publication', async () => {
  const opened = await openPsd(
    await readFile(new URL('../../../packages/psd/test/editor/flat-rgb8.psd', import.meta.url))
  );
  if (!opened.ok) {
    throw new Error(opened.error.message);
  }
  const doc = opened.value;
  const rect = { left: 0, top: 0, width: 2, height: 2 };
  const snapshot: WindowSnapshot = {
    opened: { document: 1, info: doc.info, layers: [...doc.layers], states: doc.states, opening: doc.opening },
    settings: photoshopDefaultSettings,
    visibility: []
  };
  let complete!: (result: Awaited<ReturnType<PsdClient['gpuLayers']>>) => void;
  const changes: CompositeDiagnostics[] = [];
  const previews = makeCompositePreviews(
    {
      renderWindow: vi.fn(),
      gpuLayers: vi.fn(
        () =>
          new Promise<Awaited<ReturnType<PsdClient['gpuLayers']>>>((resolve) => {
            complete = resolve;
          })
      )
    },
    (state) => changes.push(state)
  );
  try {
    const pending = previews.prepare(snapshot, rect, rect, vi.fn());
    previews.clear();
    complete(prepareGpuLayers(doc, rect, snapshot.settings));
    expect(await pending).toBeUndefined();
    expect(changes.at(-1)?.preparedBytes).toBe(0);
    expect(changes.some((state) => state.state === 'preview')).toBe(false);
  } finally {
    previews.clear();
    doc.close();
  }
});

it('refuses a single operand set larger than the CPU LRU instead of retaining it outside the budget', async () => {
  const opened = await openPsd(
    await readFile(new URL('../../../packages/psd/test/editor/flat-rgb8.psd', import.meta.url))
  );
  if (!opened.ok) {
    throw new Error(opened.error.message);
  }
  const doc = opened.value;
  const rect = { left: 0, top: 0, width: 2, height: 2 };
  const prepared = prepareGpuLayers(doc, rect, photoshopDefaultSettings);
  if (!prepared.ok) {
    doc.close();
    throw new Error(prepared.error.message);
  }
  const changes: CompositeDiagnostics[] = [];
  const previews = makeCompositePreviews(
    {
      renderWindow: vi.fn(),
      gpuLayers: vi.fn(async () => ({
        ok: true as const,
        value: {
          ...prepared.value,
          layers: [{ ...prepared.value.layers[0], samples: new Uint32Array(4 * 1024 * 1024 + 1) }]
        }
      }))
    },
    (state) => changes.push(state)
  );
  try {
    const snapshot: WindowSnapshot = {
      opened: { document: 1, info: doc.info, layers: [...doc.layers], states: doc.states, opening: doc.opening },
      settings: photoshopDefaultSettings,
      visibility: []
    };
    expect(await previews.prepare(snapshot, rect, rect, vi.fn())).toBeUndefined();
    expect(changes.at(-1)).toMatchObject({ state: 'unsupported', preparedBytes: 0 });
    expect(changes.at(-1)?.reason).toContain('16 MiB');
    expect(previews.unavailable(snapshot)).toBe(true);
  } finally {
    previews.clear();
    doc.close();
  }
});

it('releases prior operands before restoring the full CPU budget for refused settings', async () => {
  const opened = await openPsd(
    await readFile(new URL('../../../packages/psd/test/editor/flat-rgb8.psd', import.meta.url))
  );
  if (!opened.ok) {
    throw new Error(opened.error.message);
  }
  const doc = opened.value;
  const rect = { left: 0, top: 0, width: 8, height: 8 };
  const snapshot: WindowSnapshot = {
    opened: { document: 1, info: doc.info, layers: [...doc.layers], states: doc.states, opening: doc.opening },
    settings: photoshopDefaultSettings,
    visibility: []
  };
  const changes: CompositeDiagnostics[] = [];
  const previews = makeCompositePreviews(
    {
      renderWindow: vi.fn(),
      gpuLayers: vi.fn(async (...[_document, rect, settings]: Parameters<PsdClient['gpuLayers']>) =>
        prepareGpuLayers(doc, rect, settings)
      )
    },
    (state) => changes.push(state)
  );
  try {
    expect(await previews.prepare(snapshot, rect, rect, vi.fn())).toBeDefined();
    expect(changes.at(-1)!.preparedBytes).toBeGreaterThan(0);
    const refused = { ...snapshot, settings: { ...snapshot.settings, linearBlending: true } };
    expect(await previews.prepare(refused, rect, rect, vi.fn())).toBeUndefined();
    expect(previews.unavailable(refused)).toBe(true);
    expect(changes.at(-1)).toMatchObject({ state: 'unsupported', preparedBytes: 0 });
  } finally {
    previews.clear();
    doc.close();
  }
});
