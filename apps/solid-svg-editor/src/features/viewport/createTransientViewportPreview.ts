import { createSignal, onCleanup } from 'solid-js';

export function createTransientViewportPreview() {
  const [transientViewportPreview, setTransientViewportPreview] = createSignal(false);
  let viewportPreviewTimeout: number | undefined;

  function keepViewportPreviewAlive(delay = 140): void {
    setTransientViewportPreview(true);

    if (viewportPreviewTimeout !== undefined) {
      window.clearTimeout(viewportPreviewTimeout);
    }

    viewportPreviewTimeout = window.setTimeout(() => {
      viewportPreviewTimeout = undefined;
      setTransientViewportPreview(false);
    }, delay);
  }

  onCleanup(() => {
    if (viewportPreviewTimeout !== undefined) {
      window.clearTimeout(viewportPreviewTimeout);
    }
  });

  return {
    transientViewportPreview,
    keepViewportPreviewAlive
  };
}
