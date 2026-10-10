// @vitest-environment jsdom
import { gpuError } from '@app-game/solid-gpu/errors';
import { render } from '@solidjs/web';
import { createSignal, flush } from 'solid-js';
import { afterEach, expect, it, vi } from 'vitest';
import { engineError, type PaintError } from '../../shared/errors';
import { createAutoRestore } from './createAutoRestore';

let dispose: (() => void) | undefined;
afterEach(() => {
  dispose?.();
  dispose = undefined;
  document.body.replaceChildren();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it('restores after a device loss, waiting until the page is visible', () => {
  let visibility: DocumentVisibilityState = 'hidden';
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
  const { setError, restore } = mount();

  setError(gpuError('lost', 'The graphics device was disconnected.'));
  flush();
  expect(restore).not.toHaveBeenCalled();

  visibility = 'visible';
  document.dispatchEvent(new Event('visibilitychange'));
  flush();
  expect(restore).toHaveBeenCalledOnce();
});

it('leaves other failures and a quick repeated loss to the error notice', () => {
  vi.useFakeTimers();
  const { setError, restore } = mount();

  setError(engineError('stopped', 'The drawing engine stopped.'));
  flush();
  setError(gpuError('validation', 'Invalid pipeline.'));
  flush();
  expect(restore).not.toHaveBeenCalled();

  setError(gpuError('lost', 'Lost.'));
  flush();
  setError(undefined);
  flush();
  vi.advanceTimersByTime(5_000);
  setError(gpuError('lost', 'Lost again.'));
  flush();
  expect(restore).toHaveBeenCalledOnce();

  setError(undefined);
  flush();
  vi.advanceTimersByTime(30_000);
  setError(gpuError('lost', 'Lost later.'));
  flush();
  expect(restore).toHaveBeenCalledTimes(2);
});

function mount() {
  const [error, setError] = createSignal<PaintError>();
  const restore = vi.fn(() => setError(undefined));
  const host = document.createElement('div');
  document.body.append(host);
  dispose = render(() => {
    createAutoRestore({ error, restore });
    return <div />;
  }, host);
  flush();
  return { setError, restore };
}
