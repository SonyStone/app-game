// @vitest-environment jsdom
import { render } from '@solidjs/web';
import { flush } from 'solid-js';
import type { registerSW } from 'virtual:pwa-register';
import { afterEach, expect, it, vi } from 'vitest';
import { createPwa } from './createPwa';

let dispose: (() => void) | undefined;
afterEach(() => {
  dispose?.();
  dispose = undefined;
  document.body.replaceChildren();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it('reports offline readiness and waits for windows to close instead of activating an update', () => {
  const { options, update, state } = mount();
  options().onOfflineReady?.();
  flush();
  expect(state().status()).toBe('Ready to work offline.');
  options().onNeedRefresh?.();
  flush();
  expect(state().status()).toContain('close all Paint windows');
  expect(update).not.toHaveBeenCalled();
});

it('recognizes an already active offline worker when reopening the app', () => {
  const { options, state } = mount();
  options().onRegisteredSW?.('/sw.js', {
    active: {},
    waiting: null,
    installing: null,
    update: vi.fn(async () => undefined)
  } as unknown as ServiceWorkerRegistration);
  flush();
  expect(state().status()).toBe('Ready to work offline.');
});

it('checks for a new version when registered, when the page becomes visible again and every hour', () => {
  vi.useFakeTimers();
  try {
    let visibility: DocumentVisibilityState = 'visible';
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
    const { options } = mount();
    const update = vi.fn(async () => undefined);
    options().onRegisteredSW?.('/sw.js', { update } as unknown as ServiceWorkerRegistration);
    flush();
    expect(update).toHaveBeenCalledOnce();

    vi.advanceTimersByTime(60 * 60 * 1000);
    expect(update).toHaveBeenCalledTimes(2);

    visibility = 'hidden';
    document.dispatchEvent(new Event('visibilitychange'));
    flush();
    vi.advanceTimersByTime(2 * 60 * 60 * 1000);
    expect(update).toHaveBeenCalledTimes(2);

    visibility = 'visible';
    document.dispatchEvent(new Event('visibilitychange'));
    flush();
    expect(update).toHaveBeenCalledTimes(3);
  } finally {
    vi.useRealTimers();
    vi.restoreAllMocks();
  }
});

it('consumes each install prompt once even before reactive updates flush', async () => {
  const { state } = mount();
  const prompt = vi.fn(async () => undefined);
  const event = new Event('beforeinstallprompt', { cancelable: true });
  Object.assign(event, { prompt });
  window.dispatchEvent(event);
  flush();
  expect(event.defaultPrevented).toBe(true);
  expect(state().canInstall()).toBe(true);
  await Promise.all([state().install(), state().install()]);
  flush();
  expect(prompt).toHaveBeenCalledOnce();
  expect(state().canInstall()).toBe(false);
});

it('reports install failure and removes listeners on disposal', async () => {
  const { state } = mount();
  const event = new Event('beforeinstallprompt', { cancelable: true });
  Object.assign(event, {
    prompt: vi.fn(async () => {
      throw new Error('Denied');
    })
  });
  window.dispatchEvent(event);
  await state().install();
  flush();
  expect(state().error()?.message).toContain('Installation could not start');
  dispose?.();
  dispose = undefined;
  const late = new Event('beforeinstallprompt', { cancelable: true });
  Object.assign(late, { prompt: vi.fn() });
  window.dispatchEvent(late);
  expect(late.defaultPrevented).toBe(false);
});

it('suggests the Home Screen only in an iOS Safari tab', () => {
  expect(mount().state().homeScreenHint).toBe(false);
  dispose?.();
  vi.stubGlobal('navigator', Object.assign(Object.create(navigator), { standalone: false }));
  expect(mount().state().homeScreenHint).toBe(true);
  dispose?.();
  vi.stubGlobal('navigator', Object.assign(Object.create(navigator), { standalone: true }));
  expect(mount().state().homeScreenHint).toBe(false);
});

function mount() {
  vi.stubEnv('PROD', true);
  vi.stubGlobal('isSecureContext', true);
  const previous = Object.getOwnPropertyDescriptor(navigator, 'serviceWorker');
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: {} });
  let callbacks!: NonNullable<Parameters<typeof registerSW>[0]>;
  let controller!: ReturnType<typeof createPwa>;
  const update = vi.fn(async () => undefined);
  const register: typeof registerSW = (options) => {
    callbacks = options!;
    return update;
  };
  const host = document.createElement('div');
  document.body.append(host);
  const unmount = render(() => {
    controller = createPwa(register);
    return <div />;
  }, host);
  dispose = () => {
    unmount();
    if (previous) {
      Object.defineProperty(navigator, 'serviceWorker', previous);
    } else {
      Reflect.deleteProperty(navigator, 'serviceWorker');
    }
  };
  flush();
  return { options: () => callbacks, update, state: () => controller };
}
