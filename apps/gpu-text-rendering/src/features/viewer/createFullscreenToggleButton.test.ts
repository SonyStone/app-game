import { resolveTemplate, translator } from '@solid-primitives/i18n';
import { createRoot, flush } from 'solid-js';
import { afterEach, expect, it, vi } from 'vitest';
import { createFullscreenToggleButton } from './createFullscreenToggleButton';
import en from './i18n/en.json';

const cleanups: (() => void)[] = [];
afterEach(() => cleanups.splice(0).forEach((dispose) => dispose()));

it('reports browser failures and clears the error after a successful retry', async () => {
  const cause = new Error('Fullscreen denied');
  const request = vi.fn<() => Promise<void>>().mockRejectedValueOnce(cause).mockResolvedValueOnce();
  const { button } = setup(request);
  await button.props.onClick();
  flush();
  expect(button.error()).toMatchObject({ kind: 'fullscreen', message: 'Fullscreen denied', cause });
  await button.props.onClick();
  flush();
  expect(button.error()).toBeUndefined();
  expect(request).toHaveBeenCalledTimes(2);
});

it('dismisses a reported failure without another browser request', async () => {
  const request = vi.fn<() => Promise<void>>().mockRejectedValueOnce(new Error('Fullscreen denied'));
  const { button } = setup(request);
  await button.props.onClick();
  flush();
  expect(button.error()).toBeDefined();
  button.dismissError();
  flush();
  expect(button.error()).toBeUndefined();
  expect(request).toHaveBeenCalledOnce();
});

it.each(['resolve', 'reject'] as const)(
  'ignores a late browser %s and future toggles after disposal',
  async (outcome) => {
    const previous = new Error('Previous failure');
    let resolve!: () => void;
    let reject!: (cause: Error) => void;
    const request = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(previous)
      .mockImplementationOnce(
        () =>
          new Promise<void>((done, fail) => {
            resolve = done;
            reject = fail;
          })
      );
    const { button, dispose } = setup(request);
    await button.props.onClick();
    flush();
    const pending = button.props.onClick();
    dispose();
    if (outcome === 'resolve') {
      resolve();
    } else {
      reject(new Error('Late failure'));
    }
    await pending;
    await button.props.onClick();
    flush();
    expect(button.error()?.cause).toBe(previous);
    expect(request).toHaveBeenCalledTimes(2);
  }
);

function setup(requestFullscreen: () => Promise<void>) {
  const session = createRoot((dispose) => {
    cleanups.push(dispose);
    const button = createFullscreenToggleButton(translator(() => en, resolveTemplate));
    return { button, dispose };
  });
  session.button.setContainer(Object.assign(document.createElement('div'), { requestFullscreen }));
  flush();
  return session;
}
