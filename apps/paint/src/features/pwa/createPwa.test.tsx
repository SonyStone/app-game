import { render } from '@solidjs/web';
import { flush } from 'solid-js';
import { afterEach, expect, it, vi } from 'vitest';
import type { registerSW } from 'virtual:pwa-register';
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
  options().onRegisteredSW?.('/sw.js', { active: {}, waiting: null, installing: null } as ServiceWorkerRegistration);
  flush();
  expect(state().status()).toBe('Ready to work offline.');
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
  Object.assign(event, { prompt: vi.fn(async () => { throw new Error('Denied'); }) });
  window.dispatchEvent(event);
  await state().install();
  flush();
  expect(state().error()).toContain('Installation could not start');
  dispose?.();
  dispose = undefined;
  const late = new Event('beforeinstallprompt', { cancelable: true });
  Object.assign(late, { prompt: vi.fn() });
  window.dispatchEvent(late);
  expect(late.defaultPrevented).toBe(false);
});

function mount() {
  vi.stubEnv('PROD', true);
  vi.stubGlobal('isSecureContext', true);
  const previous = Object.getOwnPropertyDescriptor(navigator, 'serviceWorker');
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: {} });
  let callbacks!: NonNullable<Parameters<typeof registerSW>[0]>;
  let controller!: ReturnType<typeof createPwa>;
  const update = vi.fn(async () => undefined);
  const register: typeof registerSW = (options) => { callbacks = options!; return update; };
  const host = document.createElement('div');
  document.body.append(host);
  const unmount = render(() => { controller = createPwa(register); return <div />; }, host);
  dispose = () => {
    unmount();
    if (previous) Object.defineProperty(navigator, 'serviceWorker', previous);
    else Reflect.deleteProperty(navigator, 'serviceWorker');
  };
  flush();
  return { options: () => callbacks, update, state: () => controller };
}
