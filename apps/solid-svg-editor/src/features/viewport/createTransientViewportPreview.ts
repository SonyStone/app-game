import { debounce } from '@solid-primitives/scheduled';
import { createSignal } from 'solid-js';

export function createTransientViewportPreview() {
  const [transientViewportPreview, setTransientViewportPreview] = createSignal(false);
  const stopPreview = debounce(() => setTransientViewportPreview(false), 140);
  const stopPreviewQuickly = debounce(() => setTransientViewportPreview(false), 100);

  function keepViewportPreviewAlive(delay = 140): void {
    setTransientViewportPreview(true);
    stopPreview.clear();
    stopPreviewQuickly.clear();

    if (delay <= 100) {
      stopPreviewQuickly();
      return;
    }

    stopPreview();
  }

  return {
    transientViewportPreview,
    keepViewportPreviewAlive
  };
}
