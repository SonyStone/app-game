// @vitest-environment jsdom
import { err, ok, type Result } from 'neverthrow';
import { createRoot, flush } from 'solid-js';
import { afterEach, expect, it, vi } from 'vitest';
import { brushError, type PaintError } from '../../shared/errors';
import { createAbrPresets, type AbrPreset } from './createAbrPresets';

let dispose: (() => void) | undefined;
afterEach(() => {
  dispose?.();
  dispose = undefined;
});

it('applies a preset only after every resource upload succeeds, and restores it on a replacement engine', async () => {
  const uploads = deferredUploads();
  const select = vi.fn();
  const presets = setup({ upload: uploads.upload, select });
  const applying = presets.usePreset(preset());
  expect(presets.isBusy()).toBe(true);
  expect((await presets.usePreset(preset()))._unsafeUnwrapErr()).toMatchObject({ kind: 'engine', code: 'busy' });
  uploads.resolve(ok());
  await vi.waitFor(() => expect(uploads.upload).toHaveBeenCalledTimes(2));
  expect(select).not.toHaveBeenCalled();
  uploads.resolve(ok());
  expect(await applying).toEqual(ok());
  flush();
  expect(presets.busy()).toBe(false);
  expect(select).toHaveBeenCalledExactlyOnceWith(
    { id: 'textured', settings: { tipId: 'tip' } },
    { size: 40, spacing: 0.1, color: '#123456' }
  );
  expect(presets.preset()?.name).toBe('Ink');

  const restoring = presets.restore()!;
  uploads.resolve(ok());
  await vi.waitFor(() => expect(uploads.upload).toHaveBeenCalledTimes(4));
  uploads.resolve(ok());
  expect(await restoring).toEqual(ok());
  expect(uploads.upload.mock.calls.map(([resource]) => resource.id)).toEqual(['tip', 'pattern', 'tip', 'pattern']);
});

it('keeps the applied preset after a failed upload and reports restore failures as restorable', async () => {
  const upload = vi.fn(async (): Promise<Result<void, PaintError>> => ok());
  const select = vi.fn();
  const presets = setup({ upload, select });
  expect(presets.restore()).toBeUndefined();
  await presets.usePreset(preset());
  upload.mockResolvedValueOnce(err(brushError('upload', 'No space')));
  expect((await presets.usePreset({ ...preset(), name: 'Other' }))._unsafeUnwrapErr()).toMatchObject({
    code: 'upload',
    message: 'No space'
  });
  flush();
  expect(presets.preset()?.name).toBe('Ink');
  expect(select).toHaveBeenCalledOnce();

  upload.mockResolvedValueOnce(err(brushError('upload', 'Engine changed')));
  expect((await presets.restore()!)._unsafeUnwrapErr()).toMatchObject({ kind: 'brush', code: 'restore' });
});

it('refuses presets without a tip, and resolves uploads finishing after disposal as aborted', async () => {
  const uploads = deferredUploads();
  const presets = setup({ upload: uploads.upload, select: vi.fn() });
  expect((await presets.usePreset({ ...preset(), resources: [] }))._unsafeUnwrapErr()).toMatchObject({
    code: 'invalid-preset'
  });
  const applying = presets.usePreset(preset());
  dispose?.();
  dispose = undefined;
  uploads.resolve(ok());
  await vi.waitFor(() => expect(uploads.upload).toHaveBeenCalledTimes(2));
  uploads.resolve(ok());
  expect((await applying)._unsafeUnwrapErr()).toMatchObject({ kind: 'aborted' });
});

function setup(options: Pick<Parameters<typeof createAbrPresets>[0], 'upload' | 'select'>) {
  return createRoot((stop) => {
    dispose = stop;
    return createAbrPresets({ ...options, canChange: () => true });
  });
}

/** Upload results that the test resolves one at a time, in call order. */
function deferredUploads() {
  const pending: ((result: Result<void, PaintError>) => void)[] = [];
  const upload = vi.fn(
    (_resource: { id: string }) => new Promise<Result<void, PaintError>>((resolve) => pending.push(resolve))
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

function preset(): AbrPreset {
  const resource = (id: string) => ({
    id,
    width: 1,
    height: 1,
    format: 'r8unorm' as const,
    pixels: new Uint8Array([255])
  });
  return {
    name: 'Ink',
    engine: { id: 'textured', settings: { tipId: 'tip' } },
    resources: [resource('tip'), resource('pattern')],
    size: 40,
    spacing: 0.1,
    color: '#123456'
  } as unknown as AbrPreset;
}
