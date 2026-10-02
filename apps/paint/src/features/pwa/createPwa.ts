import { createEventListener } from '@solid-primitives/event-listener';
import { ResultAsync } from 'neverthrow';
import { createSignal, getOwner, isDisposed, onSettled } from 'solid-js';
import type { registerSW } from 'virtual:pwa-register';
import { createImmediateSignal } from '../../shared/createImmediateSignal';
import type { InstallError } from '../../shared/errors';

/**
 * Tracks the browser's one-shot install prompt and the service worker's offline readiness for the standalone app.
 * Never calls skipWaiting or reloads: an update activates after every Paint window has closed.
 * Must be created within a Solid owner; registration starts after mount, in production builds only.
 */
export function createPwa(register: typeof registerSW) {
  const owner = getOwner()!;
  const [prompt, setPrompt, unusedPrompt] = createImmediateSignal<InstallPromptEvent | undefined>(undefined);
  const [installing, setInstalling] = createSignal(false);
  const [error, setError] = createSignal<InstallError>();
  const [status, setStatus] = createSignal(
    import.meta.env.PROD ? 'Preparing offline access…' : 'Offline installation is available in the production build.'
  );
  /** Reports status changes only while the editor is mounted. */
  const report = (message: string) => {
    if (!isDisposed(owner)) {
      setStatus(message);
    }
  };

  createEventListener(window, 'beforeinstallprompt', (event: Event) => {
    if (!isInstallPrompt(event)) {
      return;
    }

    event.preventDefault();
    setPrompt(event);
  });
  createEventListener(window, 'appinstalled', () => setPrompt(undefined));
  onSettled(() => {
    if (!import.meta.env.PROD) {
      return;
    }

    if (!('serviceWorker' in navigator) || !window.isSecureContext) {
      setStatus('Offline installation requires a supported browser and HTTPS.');
      return;
    }

    register({
      immediate: true,
      onRegisteredSW: (_url, registration) => {
        if (registration?.active && !registration.waiting && !registration.installing) {
          report('Ready to work offline.');
        }
      },
      onOfflineReady: () => report('Ready to work offline.'),
      onNeedRefresh: () => report('Update ready. After saving, close all Paint windows and reopen to update.'),
      onRegisterError: () => report('Offline setup failed. Reopen Paint online to retry.')
    });
  });

  return {
    /** The browser offered installation and the prompt has not been used. */
    canInstall: () => Boolean(prompt()),
    installing,
    /** Offline readiness and update status for the drawing menu. */
    status,
    /** The latest refused install prompt; cleared by the next attempt. */
    error,
    /** Must run directly from a click to retain browser user activation. A prompt can be used only once. */
    async install() {
      const event = unusedPrompt();
      if (!event || isDisposed(owner)) {
        return;
      }

      setPrompt(undefined);
      setInstalling(true);
      setError(undefined);
      const result = await ResultAsync.fromThrowable(
        () => event.prompt(),
        (cause): InstallError => ({
          kind: 'install',
          message: 'Installation could not start. Use your browser’s Install app menu.',
          cause
        })
      )();
      if (isDisposed(owner)) {
        return;
      }

      setInstalling(false);
      if (result.isErr()) {
        setError(result.error);
      }
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
