// @vitest-environment jsdom
import type { BrushResource } from '@app-game/abr-paint/resources';
import { err, ok, type Result } from 'neverthrow';
import { createRoot, flush } from 'solid-js';
import { afterEach, expect, it, vi } from 'vitest';
import { brushError, type PaintError } from '../../shared/errors';
import type { BrushPreset } from './brushPresets';
import { createPresetUploads } from './createPresetUploads';

let dispose: (() => void) | undefined;
afterEach(() => {
  dispose?.();
  dispose = undefined;
});

it('selects a preset only after every resource upload succeeds, and restores the presets in use', async () => {
  const uploads = deferredUploads();
  const select = vi.fn();
  const inUse: BrushPreset[] = [];
  const presets = await setup({ upload: uploads.upload, select, inUse: () => inUse });
  expect(presets.restore()).toBeUndefined();

  const choosing = presets.choose(preset('ink', ['tip', 'pattern']), 'abr');
  expect(presets.isBusy()).toBe(true);
  expect((await presets.choose(preset('other', ['other']), 'abr'))._unsafeUnwrapErr()).toMatchObject({
    kind: 'engine',
    code: 'busy'
  });
  expect(select).not.toHaveBeenCalled();
  await vi.waitFor(() => expect(uploads.upload).toHaveBeenCalledOnce());
  uploads.resolve(ok());
  expect(await choosing).toEqual(ok());
  flush();
  expect(presets.busy()).toBe(false);
  expect(select).toHaveBeenCalledExactlyOnceWith('ink', 'abr');

  // Presets without resources are selected at once, even while busy.
  await presets.choose(preset('round', []), 'brush');
  expect(select).toHaveBeenLastCalledWith('round', 'brush');

  inUse.push(preset('ink', ['tip', 'pattern']), preset('eraser', ['tip', 'eraser']));
  const restoring = presets.restore()!;
  await vi.waitFor(() => expect(uploads.upload).toHaveBeenCalledTimes(2));
  uploads.resolve(ok());
  expect(await restoring).toEqual(ok());
  expect(uploads.upload.mock.calls.map(([resources]) => resources.map(({ id }) => id))).toEqual([
    ['tip', 'pattern'],
    ['tip', 'pattern', 'eraser']
  ]);
});

it('keeps the brush after a failed upload and reports restore failures as restorable', async () => {
  const upload = vi.fn(async (): Promise<Result<void, PaintError>> => err(brushError('upload', 'No space')));
  const select = vi.fn();
  const presets = await setup({ upload, select, inUse: () => [preset('ink', ['tip'])] });
  expect((await presets.choose(preset('ink', ['tip']), 'abr'))._unsafeUnwrapErr()).toMatchObject({
    code: 'upload',
    message: 'No space'
  });
  expect(select).not.toHaveBeenCalled();
  expect((await presets.restore()!)._unsafeUnwrapErr()).toMatchObject({ kind: 'brush', code: 'restore' });
});

it('skips presets whose images are missing instead of pausing the engine', async () => {
  const upload = vi.fn<(resources: readonly BrushResource[]) => Promise<Result<void, PaintError>>>(async () => ok());
  const select = vi.fn();
  const onUnavailable = vi.fn();
  const missing = preset('missing', ['gone']);
  const presets = await setup({
    upload,
    select,
    inUse: () => [missing, preset('ink', ['tip'])],
    onUnavailable,
    resources: async (chosen) =>
      chosen === missing ? err(brushError('storage', 'Gone')) : ok(images(chosen.resourceIds))
  });
  expect((await presets.choose(missing, 'abr'))._unsafeUnwrapErr()).toMatchObject({ code: 'storage' });
  expect(select).not.toHaveBeenCalled();
  expect(upload).not.toHaveBeenCalled();
  expect(await presets.restore()).toEqual(ok());
  expect(onUnavailable).toHaveBeenCalledExactlyOnceWith(missing, expect.objectContaining({ code: 'storage' }));
  expect(upload.mock.calls.map(([resources]) => resources.map(({ id }) => id))).toEqual([['tip']]);
});

it('waits for the stored brushes before restoring, and resolves uploads finishing after disposal as aborted', async () => {
  const uploads = deferredUploads();
  let load!: () => void;
  const loaded = new Promise<void>((resolve) => (load = resolve));
  const presets = createRoot((stop) => {
    dispose = stop;
    return createPresetUploads({
      resources: async (chosen) => ok(images(chosen.resourceIds)),
      upload: uploads.upload,
      canChange: () => true,
      select: vi.fn(),
      inUse: () => [preset('ink', ['tip'])],
      onUnavailable: vi.fn(),
      loaded
    });
  });
  const restoring = presets.restore();
  expect(restoring).toBeInstanceOf(Promise);
  expect(uploads.upload).not.toHaveBeenCalled();
  load();
  await vi.waitFor(() => expect(uploads.upload).toHaveBeenCalledOnce());
  uploads.resolve(ok());
  expect(await restoring).toEqual(ok());

  const choosing = presets.choose(preset('ink', ['tip']), 'abr');
  await vi.waitFor(() => expect(uploads.upload).toHaveBeenCalledTimes(2));
  dispose?.();
  dispose = undefined;
  uploads.resolve(ok());
  expect((await choosing)._unsafeUnwrapErr()).toMatchObject({ kind: 'aborted' });
});

async function setup(
  options: Pick<Parameters<typeof createPresetUploads<string>>[0], 'upload' | 'select' | 'inUse'> &
    Partial<Parameters<typeof createPresetUploads<string>>[0]>
) {
  const loaded = Promise.resolve();
  const uploads = createRoot((stop) => {
    dispose = stop;
    return createPresetUploads({
      resources: async (preset) => ok(images(preset.resourceIds)),
      onUnavailable: vi.fn(),
      canChange: () => true,
      loaded,
      ...options
    });
  });
  await loaded;
  return uploads;
}

/** Upload results that the test resolves one at a time, in call order. */
function deferredUploads() {
  const pending: ((result: Result<void, PaintError>) => void)[] = [];
  const upload = vi.fn<(resources: readonly { id: string }[]) => Promise<Result<void, PaintError>>>(
    () => new Promise((resolve) => pending.push(resolve))
  );
  return {
    upload,
    resolve(result: Result<void, PaintError>) {
      const next = pending.shift();
      if (!next) {
        throw new Error('No upload is waiting.');
      }

      next(result);
    }
  };
}

function preset(id: string, resourceIds: string[]): BrushPreset {
  return { id, name: id, settings: {}, resourceIds };
}

function images(ids: readonly string[]): BrushResource[] {
  return ids.map((id) => ({ id, width: 1, height: 1, format: 'r8unorm', pixels: new Uint8Array([255]) }));
}
