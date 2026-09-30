import { createRoot } from 'solid-js';
import { expect, it, vi } from 'vitest';
import { onGpuRelease } from './onGpuRelease';

it('releases once on owner cleanup and ignores a later abort', () => {
  const abort = new AbortController();
  const release = vi.fn();
  const dispose = createRoot((dispose) => {
    onGpuRelease(abort.signal, release);
    return dispose;
  });

  expect(release).not.toHaveBeenCalled();
  dispose();
  abort.abort();
  expect(release).toHaveBeenCalledOnce();
});

it('releases once on abort before owner cleanup', () => {
  const abort = new AbortController();
  const release = vi.fn();
  const dispose = createRoot((dispose) => {
    onGpuRelease(abort.signal, release);
    return dispose;
  });

  abort.abort();
  expect(release).toHaveBeenCalledOnce();
  dispose();
  expect(release).toHaveBeenCalledOnce();
});

it('releases immediately when the signal has already aborted', () => {
  const abort = new AbortController();
  const release = vi.fn();
  abort.abort();

  const dispose = createRoot((dispose) => {
    onGpuRelease(abort.signal, release);
    expect(release).toHaveBeenCalledOnce();
    return dispose;
  });

  dispose();
  expect(release).toHaveBeenCalledOnce();
});
