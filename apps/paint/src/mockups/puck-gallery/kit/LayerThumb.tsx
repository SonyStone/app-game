import { createEffect } from 'solid-js';
import type { LayerId } from './createSketchCanvas';
import type { Studio } from './createStudio';

/**
 * A live thumbnail of a layer's pixels over a transparency checkerboard, redrawn whenever the layer's pixels change
 * (strokes, undo, redo). Sized by CSS `width` and `height`, 48 × 33 by default, the sheet's proportions.
 */
export function LayerThumb(props: { studio: Studio; layer: LayerId; width?: number; height?: number; class?: string }) {
  let canvas!: HTMLCanvasElement;
  const width = () => props.width ?? 48;
  const height = () => props.height ?? 33;

  createEffect(
    () => ({ revision: props.studio.canvas.revision(props.layer), id: props.layer, width: width(), height: height() }),
    ({ id, width, height }) => {
      const frame = requestAnimationFrame(() => {
        const source = props.studio.canvas.layerCanvas(id);
        const ratio = devicePixelRatio || 1;
        canvas.width = Math.round(width * ratio);
        canvas.height = Math.round(height * ratio);
        const context = canvas.getContext('2d')!;
        context.clearRect(0, 0, canvas.width, canvas.height);
        if (source) {
          context.imageSmoothingQuality = 'high';
          context.drawImage(source, 0, 0, canvas.width, canvas.height);
        }
      });
      return () => cancelAnimationFrame(frame);
    }
  );

  return (
    <canvas
      ref={canvas}
      class={props.class}
      style={{
        display: 'block',
        width: `${width()}px`,
        height: `${height()}px`,
        background: 'repeating-conic-gradient(#d6d6d6 0 25%, #f4f4f4 0 50%) 0 0 / 8px 8px'
      }}
      aria-hidden="true"
    />
  );
}
