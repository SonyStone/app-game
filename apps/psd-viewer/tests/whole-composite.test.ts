import { prepareGpuLayers } from '@app-game/psd/gpu';
import { openPsd, photoshopDefaultSettings } from '@app-game/psd/viewer';
import { readFile } from 'node:fs/promises';
import { createRoot, flush } from 'solid-js';
import { expect, it, vi } from 'vitest';
import { createPsdRender } from '../src/features/document/createPsdDocument';
import type { PsdClient } from '../src/features/psd-worker';

it('publishes the GPU preview independently and preserves the authoritative whole render before queuing verification', async () => {
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
    doc.close();
    throw new Error(strict.error.message);
  }
  let complete!: (result: Awaited<ReturnType<PsdClient['render']>>) => void;
  const result: Awaited<ReturnType<PsdClient['render']>> = {
    ok: true,
    value: { ...strict.value, depth: 8, render: 7, milliseconds: 0 }
  };
  const client = {
    render: vi.fn(
      () =>
        new Promise<Awaited<ReturnType<PsdClient['render']>>>((resolve) => {
          complete = resolve;
        })
    ),
    gpuLayers: vi.fn(async () => prepareGpuLayers(doc, rect, photoshopDefaultSettings)),
    renderWindow: vi.fn(async () => ({
      ok: true as const,
      value: { images: [{ ...strict.value, populated: true }], milliseconds: 0 }
    }))
  };
  const scope = createRoot((dispose) => ({
    dispose,
    render: createPsdRender(
      client,
      () => ({
        ok: true,
        value: {
          document: 1,
          info: doc.info,
          layers: [...doc.layers],
          states: doc.states,
          opening: doc.opening
        }
      }),
      () => photoshopDefaultSettings,
      () => [],
      () => true
    )
  }));
  try {
    flush();
    await vi.waitFor(() => expect(scope.render.preview()).toBeDefined());
    expect(scope.render()).toBeUndefined();
    expect(scope.render.pending()).toBe(true);
    const tile = scope.render.preview()!.tiles![0];
    tile.gpu!.onSubmitted?.();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(client.renderWindow).not.toHaveBeenCalled();
    complete(result);
    await vi.waitFor(() => expect(client.renderWindow).toHaveBeenCalledOnce());
    tile.gpu!.onReadback(strict.value.pixels.slice());
    flush();
    expect(scope.render()).toBe(result);
    expect(scope.render.pending()).toBe(false);
    expect(scope.render.preview()).toBeUndefined();
    expect(scope.render.diagnostics()).toMatchObject({ state: 'verified', differingSamples: 0 });
  } finally {
    scope.dispose();
    doc.close();
  }
});
