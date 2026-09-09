import { createEventListener } from '@solid-primitives/event-listener';
import { createSignal, onCleanup, onSettled } from 'solid-js';
import type { registerSW } from 'virtual:pwa-register';
import { attempt } from '../asyncResult';

/** Tracks the browser's one-shot install prompt and service-worker readiness.
 * Never calls skipWaiting or reload: updates activate after every Paint window closes.
 */
export function createPwa(register: typeof registerSW) {
  const [prompt, setPrompt] = createSignal<InstallPromptEvent | undefined>(undefined, { ownedWrite: true });
  const [installing, setInstalling] = createSignal(false, { ownedWrite: true });
  const [error, setError] = createSignal('', { ownedWrite: true });
  const [status, setStatus] = createSignal(
    import.meta.env.PROD ? 'Preparing offline access…' : 'Offline installation is available in the production build.',
    { ownedWrite: true }
  );
  let disposed = false;
  let pending: InstallPromptEvent | undefined;
  onCleanup(() => { disposed = true; pending = undefined; });
  createEventListener(window, 'beforeinstallprompt', (event: Event) => {
    if (!isInstallPrompt(event)) return;
    event.preventDefault();
    pending = event;
    setPrompt(event);
  });
  createEventListener(window, 'appinstalled', () => {
    pending = undefined;
    setPrompt(undefined);
  });
  onSettled(() => {
    if (!import.meta.env.PROD) return;
    if (!('serviceWorker' in navigator) || !window.isSecureContext) {
      setStatus('Offline installation requires a supported browser and HTTPS.');
      return;
    }
    register({
      immediate: true,
      onRegisteredSW: (_url, registration) => {
        if (!disposed && registration?.active && !registration.waiting && !registration.installing) {
          setStatus('Ready to work offline.');
        }
      },
      onOfflineReady: () => { if (!disposed) setStatus('Ready to work offline.'); },
      onNeedRefresh: () => {
        if (!disposed) setStatus('Update ready. After saving, close all Paint windows and reopen to update.');
      },
      onRegisterError: () => {
        if (!disposed) setStatus('Offline setup failed. Reopen Paint online to retry.');
      }
    });
  });
  return {
    canInstall: () => Boolean(prompt()), installing, status, error,
    /** Must run directly from a click to retain browser user activation. A prompt can only be used once. */
    async install() {
      const event = pending;
      if (!event || disposed) return;
      pending = undefined;
      setPrompt(undefined);
      setInstalling(true);
      setError('');
      const result = await attempt(() => event.prompt());
      if (disposed) return;
      setInstalling(false);
      if (!result.ok) setError('Installation could not start. Use your browser’s Install app menu.');
    }
  };
}

/** Chromium supplies this event; browsers without it retain their own Add to Home Screen UI. */
interface InstallPromptEvent extends Event {
  prompt(): Promise<unknown>;
}

function isInstallPrompt(event: Event): event is InstallPromptEvent {
  return 'prompt' in event && typeof event.prompt === 'function';
}
