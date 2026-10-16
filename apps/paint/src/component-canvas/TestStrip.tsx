import { createBrushResources } from '@app-game/abr-paint/resources';
import type { Brush } from '@app-game/paint-core/brush';
import { defaultCamera } from '@app-game/paint-core/camera';
import { createMemoryStorage } from '@app-game/paint-core/composition/memoryStorage';
import {
  BrushEngines,
  BrushResources,
  createPaintApplication,
  Document,
  PaintRuntime,
  Renderer,
  Storage,
  StrokeProcessor
} from '@app-game/paint-core/composition/PaintApplication';
import { roundBrush } from '@app-game/paint-core/composition/roundBrushEngine';
import { createDocument } from '@app-game/paint-core/document';
import { createPaintRenderer } from '@app-game/paint-core/gpu/renderer';
import { attachInput } from '@app-game/paint-core/input';
import type { PaintEvent } from '@app-game/paint-core/protocol';
import { createRawProcessor } from '@app-game/paint-core/strokeProcessors';
import { createContext, createEffect, createSignal, For, onCleanup, Show, untrack, useContext } from 'solid-js';
import styles from './ComponentCanvas.module.css';

/**
 * A small canvas under a specimen for trying its color or brush at once, drawn by Paint's real engine (`paint-core`)
 * into a document kept only in memory. The pen and the mouse draw with `brush`, read at each stroke's start; a finger
 * moves the canvas instead (the strip is marked `data-canvas-touch-pans`). "×" clears it by starting a new document.
 *
 * Its size in CSS pixels is fixed at mount; at 100 % zoom one document pixel is one CSS pixel, as in Paint. Needs a
 * `StripDevice` provider.
 *
 * Every strip starts its own engine at mount, on the device all strips share. If that proves heavy on the tablet, start
 * the engine on the strip's first press instead.
 */
export function TestStrip(props: { brush: Brush; width: number; height?: number }) {
  const width = untrack(() => props.width);
  const height = untrack(() => props.height ?? 96);
  const [generation, setGeneration] = createSignal(0);

  return (
    <div class={styles.strip} style={{ width: `${width}px`, height: `${height}px` }}>
      {/* Keyed by the generation, so that clearing mounts a new document. */}
      <For each={[generation()]}>{() => <StripCanvas brush={() => props.brush} width={width} height={height} />}</For>
      <button
        class={styles.stripClear}
        aria-label="Clear the test strip"
        title="Clear"
        onClick={() => setGeneration((value) => value + 1)}
      >
        ×
      </button>
    </div>
  );
}

/**
 * The GPU device that every test strip on the page shares, requested on first use. Provide the result of
 * `createStripDevice`.
 */
export const StripDevice = createContext<() => Promise<GPUDevice>>();

/**
 * Requests one GPU device for the test strips when the first strip needs it, and destroys it with the owner. Must be
 * created within a Solid owner.
 */
export function createStripDevice() {
  let device: Promise<GPUDevice> | undefined;
  onCleanup(() => {
    void device?.then((opened) => opened.destroy()).catch(() => {});
  });

  return () =>
    (device ??= (async () => {
      const adapter = await navigator.gpu?.requestAdapter();
      if (!adapter) {
        throw new Error('WebGPU is unavailable.');
      }

      return adapter.requestDevice();
    })());
}

/** One document and engine; remounted to clear. */
function StripCanvas(props: { brush: () => Brush; width: number; height: number }) {
  const device = useContext(StripDevice);
  const [status, setStatus] = createSignal<string>();
  let canvas!: HTMLCanvasElement;
  let runtime: ReturnType<typeof createPaintApplication> | undefined;
  let ready = false;
  let stopped = false;
  const { width, height } = props;
  /** The view at 100 %: the document fills the strip's CSS box. */
  const view = () => ({ ...defaultCamera(), x: width / 2, y: height / 2, zoom: 1 });
  const receive = (event: PaintEvent) => {
    if (stopped) {
      return;
    }

    if (event.type === 'ready') {
      ready = true;
      setStatus(undefined);
    } else if (event.type === 'error') {
      setStatus(event.message);
    }
  };

  createEffect(
    () => undefined,
    () => {
      const storage = createMemoryStorage();
      runtime = createPaintApplication(
        (binding) => (
          <Document document={createDocument}>
            <Storage storage={storage}>
              <Renderer
                renderer={async (target, lost, options) =>
                  createPaintRenderer(target, lost, {
                    ...options,
                    device: await device(),
                    bounds: { x: 0, y: 0, width, height }
                  })
                }
              >
                <StrokeProcessor processors={{ none: createRawProcessor }} selectProcessor={() => 'none'}>
                  <BrushEngines engines={{ round: roundBrush.engine }} selectEngine={() => 'round'}>
                    <BrushResources resources={createBrushResources}>
                      <PaintRuntime {...binding} />
                    </BrushResources>
                  </BrushEngines>
                </StrokeProcessor>
              </Renderer>
            </Storage>
          </Document>
        ),
        receive,
        () => undefined
      );
      runtime.send({ type: 'init', canvas, size: { width, height }, dpr: devicePixelRatio, storageName: 'strip' });
      runtime.send({ type: 'view', camera: view(), size: { width, height }, dpr: devicePixelRatio });

      // Input arrives in screen pixels of the zoomed canvas, so it maps through the strip's box as drawn.
      const detach = attachInput(canvas, {
        camera: () => ({ ...view(), zoom: canvas.getBoundingClientRect().width / width }),
        size: () => {
          const box = canvas.getBoundingClientRect();
          return { width: box.width, height: box.height };
        },
        ready: () => ready && !stopped,
        brush: props.brush,
        navigate: () => undefined,
        cursor: () => undefined,
        send: (command) => runtime?.send(command)
      });

      return detach;
    }
  );
  onCleanup(() => {
    stopped = true;
    runtime?.terminate();
  });

  return (
    <>
      <canvas
        ref={canvas}
        class={styles.stripCanvas}
        aria-label="Test strip"
        data-canvas-content
        data-canvas-touch-pans
      />
      <Show when={status()}>{(message) => <span class={styles.stripStatus}>{message()}</span>}</Show>
    </>
  );
}
