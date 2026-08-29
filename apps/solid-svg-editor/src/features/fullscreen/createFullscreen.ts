import { createFullscreen as createPrimitiveFullscreen } from '@solid-primitives/fullscreen';
import type { Accessor } from 'solid-js';

export function createFullscreen(target: Accessor<HTMLElement | undefined>) {
  const { enter, exit, isActive: isFullscreen } = createPrimitiveFullscreen(target);

  function toggleFullscreen(): void {
    if (!target()) {
      return;
    }

    void (isFullscreen() ? exit() : enter());
  }

  return {
    isFullscreen,
    toggleFullscreen
  };
}
