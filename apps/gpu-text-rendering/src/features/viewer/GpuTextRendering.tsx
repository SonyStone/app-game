import { createFullscreen } from '@solid-primitives/fullscreen';
import loaderIcon from '@tabler/icons/outline/loader-2.svg?url';
import closeIcon from '@tabler/icons/outline/x.svg?url';
import { ResultAsync } from 'neverthrow';
import { createEffect, createSignal, Show, untrack } from 'solid-js';
import { errorMessage, type FullscreenError, type GpuError } from '../../shared/errors';
import { GpuCanvasProvider } from '../../shared/gpu/GpuCanvasProvider';
import { TypeGPURootProvider } from '../../shared/gpu/TypeGPURootProvider';
import type { ExportDocument } from '../document/readDocumentSource';
import { createDocumentDrop } from './createDocumentDrop';
import { createViewerState } from './createViewerState';
import { DocumentViewer } from './DocumentViewer';
import { createViewerI18n } from './i18n/createViewerI18n';
import s from './viewer.module.scss';
import { ViewerToolbar } from './ViewerToolbar';

/** Displays a selected PDF/GDOC or the bundled document with TypeGPU and pointer-based navigation. */
export default function GpuTextRendering() {
  const [canvas, setCanvas] = createSignal<HTMLCanvasElement>();
  const [fullscreenError, setFullscreenError] = createSignal<FullscreenError>();
  const viewer = createViewerState();
  const i18n = createViewerI18n();
  const t = i18n.t;
  const [container, setContainer] = createSignal<HTMLDivElement>();
  const fullscreenState = untrack(() => createFullscreen(container));
  const [source, setSource] = createSignal<{ file?: File } | undefined>({});
  const [converted, setConverted] = createSignal<ExportDocument>();
  const [download, setDownload] = createSignal<File>();
  const [exporting, setExporting] = createSignal(false);
  const [exportError, setExportError] = createSignal<string>();
  const [downloadUrl, setDownloadUrl] = createSignal<string>();
  const [profile, setProfile] = createSignal<'glyphs' | 'curves'>('glyphs');

  const drop = createDocumentDrop(open);

  createEffect(download, (file) => {
    const url = file ? URL.createObjectURL(file) : undefined;
    setDownloadUrl(url);

    return () => {
      if (url) {
        URL.revokeObjectURL(url);
      }
    };
  });

  function open(file?: File) {
    drop.clearError();
    setConverted(undefined);
    setDownload(undefined);
    setExporting(false);
    setExportError(undefined);
    viewer.setAutoZoom(false);
    viewer.setDragging(false);
    setSource({ file });
  }

  const loading = () => viewer.state().phase === 'loading' || viewer.state().phase === 'preparing';
  const progress = () => {
    const state = viewer.state();
    return state.phase === 'loading' || state.phase === 'preparing' ? state.progress : undefined;
  };
  const percent = () => {
    const value = progress();
    return value?.total && value.completed !== undefined
      ? Math.min(100, Math.floor((100 * value.completed) / value.total))
      : undefined;
  };

  /** Unmounting the session aborts reads, terminates its worker and releases preparation resources. */
  function cancelLoading() {
    setSource(undefined);
    setConverted(undefined);
    setDownload(undefined);
    setProfile('glyphs');
    viewer.setAutoZoom(false);
    viewer.setDragging(false);
    viewer.setState({ phase: 'cancelled', message: 'Loading cancelled' });
  }

  async function exportFile() {
    const exporter = converted();
    if (!exporter || exporting()) return;
    setExporting(true);
    setExportError(undefined);
    const result = await exporter();
    if (converted() !== exporter) return;
    setExporting(false);
    if (result.isErr()) {
      setExportError(result.error.message);
      return;
    }
    setDownload(result.value);
    // Use a separate temporary URL so the first click downloads immediately,
    // independent of the reactive effect that installs the persistent link.
    const url = URL.createObjectURL(result.value);
    const link = document.createElement('a');
    link.href = url;
    link.download = result.value.name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function failGpu(error: GpuError) {
    viewer.setState({ phase: 'error', message: error.message, error });
    return null;
  }

  async function fullscreen() {
    const result = await ResultAsync.fromThrowable(
      async () => {
        if (fullscreenState.isActive()) await fullscreenState.exit();
        else await fullscreenState.enter();
      },
      (cause): FullscreenError => ({ kind: 'fullscreen', message: errorMessage(cause), cause })
    )();

    setFullscreenError(result.isErr() ? result.error : undefined);
  }

  return (
    <div
      ref={(element) => {
        setContainer(element);
        drop.ref(element);
      }}
      class={s.viewer}
      lang={i18n.locale()}
      dir={i18n.direction()}
    >
      <canvas
        ref={setCanvas}
        id="beziercanvas"
        class={`${s.canvas} ${viewer.dragging() ? s.dragging : ''}`}
        style={{ visibility: viewer.state().phase === 'cancelled' ? 'hidden' : undefined }}
        aria-label={t('canvas')}
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
                    onConverted={(exportDocument) => setConverted(() => exportDocument)}
                    onProfile={setProfile}
                  />
                )}
              </Show>
            </GpuCanvasProvider>
          </TypeGPURootProvider>
        )}
      </Show>

      <Show when={drop.isOver()}>
        <div class={s.dropOverlay} role="status" data-testid="document-drop-overlay">
          <div>{t('dropHint')}</div>
        </div>
      </Show>
      <Show when={drop.error()}>
        {(key) => (
          <div class={s.notice} role="alert">
            {t(key())}
          </div>
        )}
      </Show>
      <ViewerToolbar
        i18n={i18n}
        viewer={viewer}
        filename={source()?.file?.name}
        profile={profile()}
        canExport={!!converted()}
        exporting={exporting()}
        fullscreen={fullscreenState.isActive()}
        fullscreenSupported={!!document.fullscreenEnabled}
        onOpen={open}
        onDemo={() => open()}
        onFullscreen={() => void fullscreen()}
        onExport={() => {
          if (downloadUrl()) {
            const link = document.createElement('a');
            link.href = downloadUrl()!;
            link.download = download()!.name;
            link.click();
          } else void exportFile();
        }}
      />
      <output class={s.srOnly} aria-live="polite">
        {i18n.status(viewer.state())}
      </output>
      <Show when={exporting()}>
        <div class={s.notice} role="status">
          {t('exporting')}
        </div>
      </Show>
      <Show when={exportError() || fullscreenError()?.message}>
        {(message) => (
          <div class={s.notice} role="alert">
            {exportError() ? t('exportError') : t('fullscreenError')}
            <div dir="auto">{message()}</div>
          </div>
        )}
      </Show>
      <Show when={viewer.state().phase !== 'ready'}>
        <div class={s.loadinginfo} role={viewer.state().phase === 'error' ? 'alert' : 'status'}>
          <div class={s.loadingHeading}>
            <Show when={loading()}>
              <div
                role="progressbar"
                aria-label={i18n.status(viewer.state())}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={percent()}
                data-testid="document-loading"
              >
                <img class={s.loadingSpinner} src={loaderIcon} alt="" />
              </div>
            </Show>
            <strong>{i18n.status(viewer.state())}</strong>
            <Show when={loading()}>
              <button
                type="button"
                class={s.cancelLoading}
                aria-label={t('cancelLoading')}
                title={t('cancelLoading')}
                onClick={cancelLoading}
              >
                <img src={closeIcon} alt="" />
              </button>
            </Show>
          </div>
          <Show when={percent() !== undefined}>
            <div class={s.loadingProgress}>
              <span>{percent()}%</span>
              <Show when={progress()?.stage === 'processingPages'}>
                <span>
                  {t('pageProgress', { completed: String(progress()?.completed), total: String(progress()?.total) })}
                </span>
              </Show>
              <progress max={100} value={percent()} aria-hidden="true" />
            </div>
          </Show>
          <Show when={source()?.file}>
            <div class={s.loadingFilename} dir="auto">
              {source()?.file?.name}
            </div>
          </Show>
          <Show when={viewer.state().phase === 'error'}>
            <div dir="auto">{viewer.state().message}</div>
          </Show>
        </div>
      </Show>
    </div>
  );
}
