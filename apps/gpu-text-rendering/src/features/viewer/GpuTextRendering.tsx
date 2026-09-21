import { ResultAsync } from 'neverthrow';
import { createSignal, Show } from 'solid-js';
import { errorMessage, type FullscreenError } from '../../shared/errors';
import { createViewerState } from './createViewerState';
import { DocumentViewer } from './DocumentViewer';
import s from './viewer.module.scss';

/** Displays the bundled document with TypeGPU and pointer-based navigation. */
export default function GpuTextRendering() {
  const [canvas, setCanvas] = createSignal<HTMLCanvasElement>();
  const [fullscreenError, setFullscreenError] = createSignal<FullscreenError>();
  const viewer = createViewerState();
  let container: HTMLDivElement | undefined;

  async function fullscreen() {
    const result = await ResultAsync.fromThrowable(
      async () => {
        await container?.requestFullscreen();
      },
      (cause): FullscreenError => ({ kind: 'fullscreen', message: errorMessage(cause), cause })
    )();

    setFullscreenError(result.isErr() ? result.error : undefined);
  }

  return (
    <div ref={container} class={s.viewer}>
      <canvas
        ref={setCanvas}
        id="beziercanvas"
        class={`${s.canvas} ${viewer.dragging() ? s.dragging : ''}`}
        aria-label="Document canvas"
        aria-busy={viewer.state().phase === 'loading' || viewer.state().phase === 'preparing' ? 'true' : 'false'}
      />

      <Show when={canvas()} keyed>
        {(target) => <DocumentViewer canvas={target} viewer={viewer} />}
      </Show>

      <div id="toolbar" class={s.toolbar}>
        <a href="https://wdobbie.com/post/war-and-peace-and-webgl/" target="_blank" rel="noreferrer">
          Resolution independent GPU text rendering
        </a>

        <p>Drag to pan, scroll to zoom. Two fingers to pan, pinch and rotate.</p>

        <label>
          <input
            type="checkbox"
            checked={viewer.autoZoom()}
            onChange={(event) => viewer.setAutoZoom(event.currentTarget.checked)}
          />
          Auto zoom
        </label>

        <label>
          <input
            type="checkbox"
            checked={viewer.grids()}
            onChange={(event) => viewer.setGrids(event.currentTarget.checked)}
          />
          Grids
        </label>

        <label>
          <input
            type="checkbox"
            checked={viewer.vectorOnly()}
            onChange={(event) => viewer.setVectorOnly(event.currentTarget.checked)}
          />
          Vector only
        </label>

        <button type="button" onClick={() => void fullscreen()}>
          Fullscreen
        </button>

        <p class={s.status}>
          <output aria-live="polite">{viewer.state().message}</output>
        </p>

        <Show when={fullscreenError()}>{(error) => <p role="alert">{error().message}</p>}</Show>
      </div>

      <Show when={viewer.state().phase !== 'ready'}>
        <div class={s.loadinginfo} role={viewer.state().phase === 'error' ? 'alert' : 'status'}>
          {viewer.state().message}
        </div>
      </Show>
    </div>
  );
}
