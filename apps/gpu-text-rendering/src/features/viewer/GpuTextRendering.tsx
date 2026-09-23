import { ResultAsync } from 'neverthrow';
import { createEffect, createSignal, Show } from 'solid-js';
import { errorMessage, type FullscreenError, type GpuError } from '../../shared/errors';
import { GpuCanvasProvider } from '../../shared/gpu/GpuCanvasProvider';
import { TypeGPURootProvider } from '../../shared/gpu/TypeGPURootProvider';
import noticesUrl from '../document/pdf/wasm/third-party-notices.txt?url';
import { createViewerState } from './createViewerState';
import { DocumentViewer } from './DocumentViewer';
import s from './viewer.module.scss';

/** Displays a selected PDF/GDOC or the bundled document with TypeGPU and pointer-based navigation. */
export default function GpuTextRendering() {
  const [canvas, setCanvas] = createSignal<HTMLCanvasElement>();
  const [fullscreenError, setFullscreenError] = createSignal<FullscreenError>();
  const viewer = createViewerState();
  let container: HTMLDivElement | undefined;
  const [source, setSource] = createSignal<{ file?: File }>({});
  const [converted, setConverted] = createSignal<File>();
  const [downloadUrl, setDownloadUrl] = createSignal<string>();
  const [profile, setProfile] = createSignal<'glyphs' | 'curves'>('glyphs');

  createEffect(converted, (file) => {
    const url = file ? URL.createObjectURL(file) : undefined;
    setDownloadUrl(url);

    return () => {
      if (url) {
        URL.revokeObjectURL(url);
      }
    };
  });

  function open(file?: File) {
    setConverted(undefined);
    viewer.setAutoZoom(false);
    viewer.setDragging(false);
    setSource({ file });
  }

  function failGpu(error: GpuError) {
    viewer.setState({ phase: 'error', message: error.message, error });
    return null;
  }

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
        {(target) => (
          <TypeGPURootProvider requiredBufferBytes={256 * 1024 * 1024} error={failGpu}>
            <GpuCanvasProvider canvas={target} error={failGpu}>
              <Show when={source()} keyed>
                {(session) => (
                  <DocumentViewer
                    viewer={viewer}
                    file={session.file}
                    onConverted={setConverted}
                    onProfile={setProfile}
                  />
                )}
              </Show>
            </GpuCanvasProvider>
          </TypeGPURootProvider>
        )}
      </Show>

      <div id="toolbar" class={s.toolbar}>
        <a href="https://wdobbie.com/post/war-and-peace-and-webgl/" target="_blank" rel="noreferrer">
          Resolution independent GPU text rendering
        </a>

        <label class={s.filePicker}>
          Open PDF or GDOC
          <input
            type="file"
            accept=".pdf,.gdoc,application/pdf"
            aria-label="Open document"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              if (file) {
                open(file);
              }
              event.currentTarget.value = '';
            }}
          />
        </label>

        <Show when={source().file}>
          <p>{source().file?.name}</p>
          <button type="button" onClick={() => open()}>
            Back to demo
          </button>
        </Show>

        <Show when={downloadUrl()}>
          {(url) => (
            <p>
              <a href={url()} download={converted()?.name}>
                Download GDOC
              </a>
            </p>
          )}
        </Show>

        <p>
          PDF import supports text, paths, images, axial and radial gradients, function and mesh shadings, tiling patterns and
          transparency groups with masks. Unsupported graphics produce a page-specific error. Files stay on this device.
        </p>

        <p>Drag to pan, scroll to zoom. Two fingers to pan, pinch and rotate.</p>

        <label>
          <input
            type="checkbox"
            checked={viewer.autoZoom()}
            onChange={(event) => viewer.setAutoZoom(event.currentTarget.checked)}
          />
          Auto zoom
        </label>

        <Show when={profile() === 'glyphs'}>
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
        </Show>

        <button type="button" onClick={() => void fullscreen()}>
          Fullscreen
        </button>

        <p class={s.status}>
          <output aria-live="polite">{viewer.state().message}</output>
        </p>

        <p class={s.status}>
          <a href={noticesUrl} target="_blank" rel="noreferrer">
            Open-source licenses
          </a>
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
