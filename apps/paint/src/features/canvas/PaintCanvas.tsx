import { attachInput } from '@app-game/paint-core/input';
import { createEffect, createSignal } from 'solid-js';

/**
 * The drawing canvas of one engine connection. Once mounted it opens the connection and attaches pen, mouse, touch
 * and puck input; unmounting detaches input and disconnects. Key it on the execution mode: a switch needs a fresh
 * canvas because a worker takes permanent control of the one it receives.
 */
export function PaintCanvas(props: {
  /** Opens the engine for the mounted canvas and returns its disconnect function. */
  connect: (canvas: HTMLCanvasElement) => () => void;
  /** Input bindings; read when the canvas mounts. */
  input: CanvasInput;
  /** Shows a crosshair, for the lasso, instead of hiding the pointer under the brush cursor overlay. */
  crosshair: boolean;
  ref?: (canvas: HTMLCanvasElement) => void;
}) {
  const [canvas, setCanvas] = createSignal<HTMLCanvasElement>();
  createEffect(canvas, (element) => {
    if (!element) {
      return;
    }

    let disposed = false;
    let disconnect: (() => void) | undefined;
    let detach: (() => void) | undefined;

    // Drag/drop refs can flush effects while the canvas still belongs to a template document.
    // Wait until DOM insertion finishes before opening the engine and binding its window listeners.
    const connect = () => {
      if (disposed) {
        return;
      }

      disconnect = props.connect(element);
      detach = attachInput(element, props.input);
    };

    if (element.ownerDocument.defaultView) {
      connect();
    } else {
      queueMicrotask(connect);
    }

    return () => {
      disposed = true;
      detach?.();
      disconnect?.();
    };
  });

  return (
    <canvas
      ref={(element) => {
        setCanvas(element);
        props.ref?.(element);
      }}
      style={{ cursor: props.crosshair ? 'crosshair' : 'none' }}
      tabindex={0}
      aria-label="Drawing canvas. Draw with a pen or mouse; use touch or hold Space for navigation."
    />
  );
}

/** Camera, brush, command and gesture bindings for canvas input; see `attachInput`. */
export type CanvasInput = Parameters<typeof attachInput>[1];
