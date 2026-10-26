import type { PsdImage } from '@app-game/psd/viewer';
import type { JSX } from '@solidjs/web';
import { createEffect } from 'solid-js';
import { viewerPerformance } from '../telemetry/performance';

/**
 * Draws straight 8-bit RGBA at its own size; CSS scales it. Each new `image` object is drawn once; pixels are shared
 * with the canvas upload, not copied.
 */
export function RgbaCanvas(props: { image: PsdImage; label: string; class?: string; style?: JSX.CSSProperties }) {
  let canvas!: HTMLCanvasElement;
  createEffect(
    () => props.image,
    (image) => {
      const start = performance.now();
      canvas.width = image.width;
      canvas.height = image.height;
      if (!image.width || !image.height) {
        return;
      }

      const pixels = new Uint8ClampedArray(
        image.pixels.buffer as ArrayBuffer,
        image.pixels.byteOffset,
        image.pixels.byteLength
      );
      canvas.getContext('2d')?.putImageData(new ImageData(pixels, image.width, image.height), 0, 0);
      viewerPerformance.record('upload', start, pixels.byteLength);
      viewerPerformance.record('canvas.backing.bytes.estimate', performance.now(), image.width * image.height * 4);
      viewerPerformance.record('gpu.bytes.estimate', performance.now(), 0);
      requestAnimationFrame(() => viewerPerformance.record('frame.uploadToFrame', start));
    }
  );

  return (
    <canvas
      ref={(element) => (canvas = element)}
      role="img"
      aria-label={props.label}
      class={props.class}
      style={props.style}
    />
  );
}
