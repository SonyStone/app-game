import { createEventListener } from '@solid-primitives/event-listener';
import { createEffect, createSignal, type Accessor } from 'solid-js';

/**
 * GodSVG's "Keep screen on", with the Screen Wake Lock API: while `enabled`, the page holds a screen wake lock and
 * takes it again when it becomes visible (browsers release it on hiding). Does nothing where the API is missing.
 */
export function createWakeLock(enabled: Accessor<boolean>): void {
  const [visible, setVisible] = createSignal(document.visibilityState === 'visible');
  createEventListener(document, 'visibilitychange', () => setVisible(document.visibilityState === 'visible'));

  createEffect(
    () => enabled() && visible(),
    (wanted) => {
      const wakeLock = (navigator as Navigator & { wakeLock?: { request: (type: 'screen') => Promise<{ release: () => Promise<void> }> } })
        .wakeLock;

      if (!wanted || !wakeLock) {
        return;
      }

      let released = false;
      let sentinel: { release: () => Promise<void> } | undefined;
      void wakeLock
        .request('screen')
        .then((lock) => {
          sentinel = lock;

          if (released) {
            void lock.release();
          }
        })
        .catch(() => undefined);

      return () => {
        released = true;
        void sentinel?.release();
      };
    }
  );
}
