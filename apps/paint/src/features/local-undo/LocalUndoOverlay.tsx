import type { Point } from '@app-game/paint-core/camera';
import { createEffect, createSignal, Show } from 'solid-js';
import type { LocalUndoGesture } from './createLocalUndo';
import styles from './LocalUndo.module.css';
import type { RegionOutline } from './localUndoEdit';

/**
 * Shows over the canvas where the local undo works: the session's region as a tint with a stronger edge, and the
 * brush stroke or lasso outline being drawn, until the engine has it. Ignores pointer input.
 */
export function LocalUndoOverlay(props: {
  outline: RegionOutline | undefined;
  gesture: LocalUndoGesture | undefined;
  /** Document to screen CSS pixels, following the camera. */
  toScreen: (point: Point) => Point;
  /** Screen CSS pixels per document pixel. */
  zoom: number;
  size: { width: number; height: number };
}) {
  const [canvas, setCanvas] = createSignal<HTMLCanvasElement>();
  createEffect(
    () => ({ element: canvas(), outline: props.outline }),
    ({ element, outline }) => {
      if (element && outline) {
        drawOutline(element, outline);
      }
    }
  );

  /** The CSS transform placing the outline's blocks, and the border block around them, on the document. */
  const placement = (outline: RegionOutline) => {
    const left = outline.left - outline.scale,
      top = outline.top - outline.scale;
    const width = outline.width + 2,
      height = outline.height + 2;
    const origin = props.toScreen({ x: left, y: top });
    const right = props.toScreen({ x: left + width * outline.scale, y: top });
    const down = props.toScreen({ x: left, y: top + height * outline.scale });
    const a = (right.x - origin.x) / width,
      b = (right.y - origin.y) / width,
      c = (down.x - origin.x) / height,
      d = (down.y - origin.y) / height;
    return `matrix(${a}, ${b}, ${c}, ${d}, ${origin.x}, ${origin.y})`;
  };

  return (
    <div class={styles.overlay} aria-hidden="true">
      <Show when={props.outline}>
        {(outline) => (
          <canvas
            ref={setCanvas}
            // One CSS pixel per block; the transform scales it onto the document.
            style={{
              width: `${outline().width + 2}px`,
              height: `${outline().height + 2}px`,
              transform: placement(outline())
            }}
          />
        )}
      </Show>
      <Show when={props.gesture}>
        {(gesture) => (
          <svg width={props.size.width} height={props.size.height}>
            <polyline
              class={trailStyle(gesture(), props.zoom).class}
              data-remove={trailStyle(gesture(), props.zoom).remove ? 'true' : undefined}
              stroke-width={trailStyle(gesture(), props.zoom).width}
              points={gesture()
                .points.map((point) => {
                  const screen = props.toScreen(point);
                  return `${screen.x},${screen.y}`;
                })
                .join(' ')}
            />
          </svg>
        )}
      </Show>
    </div>
  );
}

/**
 * Paints the outline's blocks one block larger on every side: a faint tint over covered blocks, so the preview under
 * them stays visible, and a strong line on the uncovered blocks bordering them, just outside the region.
 */
function drawOutline(canvas: HTMLCanvasElement, outline: RegionOutline) {
  const width = outline.width + 2,
    height = outline.height + 2;
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) {
    return;
  }

  const image = context.createImageData(width, height);
  // Coverage of the canvas block (x, y), which lies one block right of and below the outline's.
  const value = (x: number, y: number) =>
    x > 0 && y > 0 && x <= outline.width && y <= outline.height ? outline.cells[(y - 1) * outline.width + x - 1]! : 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const coverage = value(x, y);
      const border =
        coverage < 128 &&
        (value(x - 1, y) >= 128 || value(x + 1, y) >= 128 || value(x, y - 1) >= 128 || value(x, y + 1) >= 128);
      const alpha = border ? 220 : Math.round((coverage / 255) * 28);
      if (alpha) {
        image.data.set([65, 155, 207, alpha], (y * width + x) * 4);
      }
    }
  }

  context.putImageData(image, 0, 0);
}

/** How a gesture's trail looks: a wide brush trail or a thin lasso line, marked when it removes from the area. */
function trailStyle(gesture: LocalUndoGesture, zoom: number) {
  return gesture.kind === 'brush'
    ? {
        class: styles.trail,
        remove: gesture.erase,
        width: Math.max(1, 2 * gesture.points.reduce((largest, { radius }) => Math.max(largest, radius), 0) * zoom)
      }
    : { class: styles.lasso, remove: gesture.mode === 'subtract', width: 1.5 };
}
