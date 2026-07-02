import { createEventListener } from '@solid-primitives/event-listener';
import { createFullscreen as createPrimitiveFullscreen } from '@solid-primitives/fullscreen';
import { createSignal, type Accessor } from 'solid-js';

export function createFullscreen(target: Accessor<HTMLElement | undefined>) {
  const [fullscreenRequested, setFullscreenRequested] = createSignal(false);
  createEventListener(document, 'fullscreenchange', () => {
    if (document.fullscreenElement !== target()) {
      setFullscreenRequested(false);
    }
  });

  const isFullscreen = createPrimitiveFullscreen(target, fullscreenRequested);

  function toggleFullscreen(): void {
    if (!target()) {
      return;
    }

    setFullscreenRequested(!isFullscreen());
  }

  return {
    isFullscreen,
    toggleFullscreen
  };
}
