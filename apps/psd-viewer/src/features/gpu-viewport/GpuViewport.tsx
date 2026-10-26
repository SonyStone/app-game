import { GpuCanvas, onGpuRelease, useGpuCanvas } from '@app-game/solid-gpu/gpu';
import { createEventListener } from '@solid-primitives/event-listener';
import { createRAF } from '@solid-primitives/raf';
import { createEffect, createSignal, onCleanup, Show } from 'solid-js';
import { viewerPerformance } from '../telemetry/performance';
import type { View } from '../viewport/view';
import { displayTiles, type DisplayImage } from './displayTiles';
import styles from './gpuViewport.module.css';
import { makeCanvasDisplay } from './makeCanvasDisplay';
import { makeGpuDisplay } from './makeGpuDisplay';

/**
 * Owns the display backend independently of the document worker. Shared GpuCanvas retries unexpected device loss
 * up to three times. Unavailable, destroyed or invalid devices mount a separate 2D canvas, preserving CPU tiles and
 * camera. Retry explicitly requests a new GPU scope. `?backend=canvas2d` forces the functional fallback.
 */
export function GpuViewport(props: {
  /** Authoritative display pixels; immutable tile identities retain GPU residency across camera changes. */
  image: DisplayImage;
  /** Document-to-CSS-pixel camera. The display supplies physical DPR scaling. */
  view: View;
  /** Viewport in CSS pixels, independent of the document dimensions. */
  size: { width: number; height: number };
  /** Accessible description of the selected render/comparison view. */
  label: string;
  /** Called after visible uploads finish and a frame is submitted; may repeat on later camera frames. */
  onPresented?: (image: DisplayImage) => void;
}) {
  const forced = new URLSearchParams(location.search).get('backend') === 'canvas2d';
  const [failure, setFailure] = createSignal<string>();
  const [attempt, setAttempt] = createSignal(0);
  return (
    <>
      <Show when={!forced && !failure()} fallback={<CanvasViewport {...props} />}>
        <Show when={{ attempt: attempt() }} keyed>
          {(_attempt) => <WebGpuViewport {...props} onError={setFailure} />}
        </Show>
      </Show>
      <div class={styles.backend} aria-label="Display backend">
        <Show
          when={forced || failure()}
          fallback="WebGPU · nearest at pixel scale; bordered premultiplied bilinear below"
        >
          2D fallback · {failure() ?? 'requested'}
          <Show when={!forced}>
            <button
              type="button"
              onClick={() => {
                setAttempt((value) => value + 1);
                setFailure(undefined);
              }}
            >
              Retry WebGPU
            </button>
          </Show>
        </Show>
      </div>
    </>
  );
}

function WebGpuViewport(props: Parameters<typeof GpuViewport>[0] & { onError: (message: string) => void }) {
  const [canvas, setCanvas] = createSignal<HTMLCanvasElement>();
  return (
    <>
      <canvas ref={setCanvas} class={styles.canvas} role="img" aria-label={props.label} data-backend="webgpu" />
      <GpuCanvas
        canvas={canvas()}
        requiredBufferBytes={0}
        optionalFeatures={['timestamp-query']}
        error={(error) => <BackendFailure message={error.message} onError={props.onError} />}
      >
        <GpuFrames {...props} />
      </GpuCanvas>
    </>
  );
}

function BackendFailure(props: { message: string; onError: (message: string) => void }) {
  createEffect(
    () => props.message,
    (message) => props.onError(message)
  );
  return null;
}

function GpuFrames(props: Parameters<typeof WebGpuViewport>[0]) {
  const gpu = useGpuCanvas();
  let display: ReturnType<typeof makeGpuDisplay>;
  try {
    display = makeGpuDisplay(gpu);
  } catch (error) {
    return <BackendFailure message={String(error)} onError={props.onError} />;
  }

  const canvas = gpu.context.canvas as HTMLCanvasElement;
  const frames = createDisplayFrames(
    props,
    canvas,
    (view, width, height, dpr) => display.draw(view, width, height, dpr, gpu.context.getCurrentTexture().createView()),
    props.onError
  );
  createEffect(
    () => displayTiles(props.image),
    (tiles) => {
      display.setTiles(tiles);
      frames.invalidate();
    }
  );
  onGpuRelease(gpu.signal, () => {
    frames.stop();
    display.destroy();
  });
  return null;
}

function CanvasViewport(props: Parameters<typeof GpuViewport>[0]) {
  let canvas!: HTMLCanvasElement;
  const display = makeCanvasDisplay();
  const frames = createDisplayFrames(
    props,
    () => canvas,
    (view, width, height, dpr) => display.draw(canvas, view, width, height, dpr)
  );
  createEffect(
    () => displayTiles(props.image),
    (tiles) => {
      display.setTiles(tiles);
      frames.invalidate();
    }
  );
  onCleanup(display.destroy);
  return (
    <canvas
      ref={(element) => {
        canvas = element;
      }}
      class={styles.canvas}
      role="img"
      aria-label={props.label}
      data-backend="canvas2d"
    />
  );
}

/** A demand-driven owned RAF: camera changes coalesce, uploads continue only while visible textures are pending. */
function createDisplayFrames(
  props: Parameters<typeof GpuViewport>[0],
  element: HTMLCanvasElement | (() => HTMLCanvasElement),
  draw: (view: View, width: number, height: number, dpr: number) => boolean,
  fail?: (message: string) => void
) {
  const [dpr, setDpr] = createSignal(devicePixelRatio);
  createEventListener(window, 'resize', () => setDpr(devicePixelRatio));
  let state: { view: View; size: { width: number; height: number }; dpr: number };
  let inputAt: number | undefined;
  const [, start, stop] = createRAF(() => {
    stop();
    const canvas = typeof element === 'function' ? element() : element;
    if (!state || !canvas) {
      return;
    }

    const width = Math.max(1, Math.round(state.size.width * state.dpr));
    const height = Math.max(1, Math.round(state.size.height * state.dpr));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }

    try {
      if (draw(state.view, width, height, state.dpr)) {
        start();
      } else {
        props.onPresented?.(props.image);
      }

      if (inputAt !== undefined) {
        viewerPerformance.record('frame.inputToNextFrame', inputAt);
        inputAt = undefined;
      }

      viewerPerformance.record('frame.presented');
    } catch (error) {
      if (fail) {
        fail(String(error));
      } else {
        throw error;
      }
    }
  });
  createEffect(
    () => ({ view: props.view, size: props.size, dpr: dpr() }),
    (next) => {
      state = next;
      start();
    }
  );
  // Native input time precedes Solid's effect scheduling and the next display RAF.
  const target = () => (typeof element === 'function' ? element() : element)?.parentElement ?? undefined;
  createEventListener(
    target,
    ['wheel', 'pointermove', 'pointerdown'],
    () => {
      inputAt ??= performance.now();
    },
    { capture: true }
  );
  return { invalidate: start, stop };
}
