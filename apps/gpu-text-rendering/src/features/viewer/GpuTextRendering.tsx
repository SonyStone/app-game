import { Button } from '@app-game/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@app-game/components/ui/dropdown-menu';
import dots from '@tabler/icons/outline/dots.svg?url';
import grid from '@tabler/icons/outline/layout-grid.svg?url';
import loaderIcon from '@tabler/icons/outline/loader-2.svg?url';
import expand from '@tabler/icons/outline/maximize.svg?url';
import collapse from '@tabler/icons/outline/minimize.svg?url';
import closeIcon from '@tabler/icons/outline/x.svg?url';
import { createMemo, createSignal, Loading, Show } from 'solid-js';
import { GpuCanvasProvider } from '../../shared/gpu/GpuCanvasProvider';
import { TypeGPURootProvider } from '../../shared/gpu/TypeGPURootProvider';
import { CameraControls } from '../camera/CameraControls';
import { CameraTour } from '../camera/CameraTour';
import { DocumentCamera } from '../camera/DocumentCamera';
import { OverviewCamera, type OverviewCameraRef } from '../camera/OverviewCamera';
import { DocumentSpace } from '../camera/SceneSpace';
import { createDocumentSource } from '../document/createDocumentSource';
import noticesUrl from '../document/pdf/wasm/third-party-notices.txt?url';
import { DocumentLayer } from '../document/rendering/DocumentLayer';
import { DocumentRendererProvider } from '../document/rendering/DocumentRendererProvider';
import { FrameLoop } from '../scene/FrameLoop';
import { Viewport } from '../viewport/Viewport';
import { createDocumentDrop } from './createDocumentDrop';
import { createDocumentExport } from './createDocumentExport';
import { createFullscreenToggleButton } from './createFullscreenToggleButton';
import { createViewerStatus } from './createViewerStatus';
import { DocumentPicker } from './DocumentPicker';
import { createViewerI18n } from './i18n/createViewerI18n';
import { LanguageMenu } from './LanguageMenu';
import s from './viewer.module.scss';

/** Displays a selected PDF/GDOC or the bundled document with TypeGPU and pointer-based navigation. */
export default function GpuTextRendering() {
  const i18n = createViewerI18n();

  const [canvas, setCanvas] = createSignal<HTMLCanvasElement>();

  const [fileSource, setFileSource] = createSignal<{ file?: File }>({});
  const documentSource = createDocumentSource(() => fileSource().file);

  const preparedDocument = createMemo(() => documentSource.document()?.unwrapOr(undefined));

  const documentExport = createDocumentExport(preparedDocument);

  const [dragging, setDragging] = createSignal(
    () => {
      fileSource();
      return false;
    },
    { ownedWrite: true }
  );
  const [autoZoom, setAutoZoom] = createSignal(
    () => {
      fileSource();
      return false;
    },
    { ownedWrite: true }
  );
  const [vectorOnly, setVectorOnly] = createSignal(false);
  const [grids, setGrids] = createSignal(false);

  const { status, error: viewerError, isBusy, isReady, progress, percent, reportGpuError, rendererCallbacks } =
    createViewerStatus(documentSource, fileSource);

  /** Selects a file, or reopens the bundled demo. */
  function open(file?: File) {
    setFileSource({ file });
  }

  const drop = createDocumentDrop(open);

  const fullscreen = createFullscreenToggleButton(i18n.t);

  const [overviewCamera, setOverviewCamera] = createSignal<OverviewCameraRef>();

  return (
    <div
      ref={[fullscreen.setContainer, drop.ref]}
      class={s.viewer}
      lang={i18n.locale()}
      dir={i18n.direction()}
    >
      <canvas
        ref={setCanvas}
        id="beziercanvas"
        class={`${s.canvas} ${dragging() ? s.dragging : ''}`}
        style={{ visibility: status().phase === 'cancelled' ? 'hidden' : undefined }}
        aria-label={i18n.t('canvas')}
        aria-busy={isBusy() ? 'true' : 'false'}
      />

      <TypeGPURootProvider requiredBufferBytes={256 * 1024 * 1024} error={reportGpuError}>
        <GpuCanvasProvider canvas={canvas()} error={reportGpuError}>
          <Show when={documentSource.active() && !documentSource.error() && fileSource()} keyed>
            <Loading>
              {documentSource.document()?.match(
                ({ data, signal, fail }) => (
                  <Viewport>
                    <FrameLoop onError={fail}>
                      {(loop) => (
                        <DocumentCamera>
                          <DocumentSpace pageAspect={data.pages[0]!.width / data.pages[0]!.height}>
                            <CameraControls
                              pageAspect={data.pages[0]!.width / data.pages[0]!.height}
                              onInteraction={() => setAutoZoom(false)}
                              onDraggingChange={setDragging}
                            />

                            <OverviewCamera
                              ref={setOverviewCamera}
                              document={data}
                              padding={{ top: 44, right: 24, bottom: 84, left: 24 }}
                            />

                            <CameraTour document={data} enabled={autoZoom()} />

                            <DocumentRendererProvider
                              document={data}
                              initialFrame="viewport"
                              {...rendererCallbacks(signal)}
                              error={(error) => {
                                loop.fail(error);
                                return null;
                              }}
                            >
                              <DocumentLayer vectorOnly={vectorOnly()} grids={grids()} />
                            </DocumentRendererProvider>
                          </DocumentSpace>
                        </DocumentCamera>
                      )}
                    </FrameLoop>
                  </Viewport>
                ),
                documentSource.fail
              )}
            </Loading>
          </Show>
        </GpuCanvasProvider>
      </TypeGPURootProvider>

      <Show when={drop.isOver()}>
        <div class={s.dropOverlay} role="status" data-testid="document-drop-overlay">
          <div>{i18n.t('dropHint')}</div>
        </div>
      </Show>
      <Show when={drop.error()}>
        {(key) => (
          <div class={s.notice} role="alert">
            {i18n.t(key())}
          </div>
        )}
      </Show>
      <div id="toolbar" class={s.toolbar} role="group" aria-label={i18n.t('controls')}>
        <DocumentPicker label={i18n.t('open')} hint={i18n.t('openHint')} onOpen={open} />
        <Button
          class={s.iconButton}
          variant="ghost"
          size="icon"
          aria-label={i18n.t('overview')}
          title={i18n.t('overview')}
          disabled={!isReady()}
          onClick={() => {
            setAutoZoom(false);
            overviewCamera()?.fitToDocument();
          }}
        >
          <img src={grid} alt="" />
        </Button>
        <Button class={s.iconButton} {...fullscreen.props} variant="ghost" size="icon">
          <img src={fullscreen.isActive() ? collapse : expand} alt="" />
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger class={s.iconButton} aria-label={i18n.t('more')} title={i18n.t('more')}>
            <img src={dots} alt="" />
          </DropdownMenuTrigger>
          <DropdownMenuContent class={s.menu} aria-label={i18n.t('menu')}>
            <LanguageMenu i18n={i18n}>
              {(languageItem) => (
                <>
                  <div class={s.documentInfo}>
                    <strong dir="auto">{fileSource().file?.name ?? i18n.t('demo')}</strong>
                    <span>{i18n.t('privacy')}</span>
                  </div>
                  <Loading on={fileSource()}>
                    <Show when={documentExport.available()}>
                      <DropdownMenuItem
                        class={s.menuItem}
                        disabled={documentExport.pending()}
                        onClick={() => void documentExport.save()}
                      >
                        {documentExport.pending() ? i18n.t('exporting') : i18n.t('download')}
                      </DropdownMenuItem>
                    </Show>
                  </Loading>
                  <Show when={fileSource().file?.name}>
                    <DropdownMenuItem class={s.menuItem} onClick={() => open()}>
                      {i18n.t('back')}
                    </DropdownMenuItem>
                  </Show>
                  <DropdownMenuSeparator class={s.separator} />
                  <DropdownMenuCheckboxItem
                    class={s.menuItem}
                    checked={autoZoom()}
                    onClick={(event) => {
                      event.preventDefault();
                      setAutoZoom(!autoZoom());
                    }}
                  >
                    {i18n.t('autoZoom')}
                  </DropdownMenuCheckboxItem>
                  <Loading on={fileSource()}>
                    <Show when={preparedDocument()?.data.kind === 'glyphs'}>
                      <DropdownMenuCheckboxItem
                        class={s.menuItem}
                        checked={grids()}
                        onClick={(event) => {
                          event.preventDefault();
                          setGrids(!grids());
                        }}
                      >
                        {i18n.t('grids')}
                      </DropdownMenuCheckboxItem>
                      <DropdownMenuCheckboxItem
                        class={s.menuItem}
                        checked={vectorOnly()}
                        onClick={(event) => {
                          event.preventDefault();
                          setVectorOnly(!vectorOnly());
                        }}
                      >
                        {i18n.t('vectorOnly')}
                      </DropdownMenuCheckboxItem>
                    </Show>
                  </Loading>
                  <DropdownMenuSeparator class={s.separator} />
                  {languageItem}
                  <DropdownMenuSeparator class={s.separator} />
                  <div class={s.documentInfo}>
                    <span>{i18n.t('help')}</span>
                    <output>{i18n.status(status())}</output>
                  </div>
                  <DropdownMenuItem
                    class={s.menuItem}
                    onClick={() => window.open(noticesUrl, '_blank', 'noopener,noreferrer')}
                  >
                    {i18n.t('licenses')}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    class={s.menuItem}
                    onClick={() =>
                      window.open('https://wdobbie.com/post/war-and-peace-and-webgl/', '_blank', 'noopener,noreferrer')
                    }
                  >
                    {i18n.t('about')}
                  </DropdownMenuItem>
                </>
              )}
            </LanguageMenu>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <output class={s.srOnly} aria-live="polite">
        {i18n.status(status())}
      </output>
      <Loading on={fileSource()}>
        <Show when={documentExport.pending()}>
          <div class={s.notice} role="status">
            {i18n.t('exporting')}
          </div>
        </Show>
        <Show when={documentExport.error() || fullscreen.error()?.message}>
          {(message) => (
            <div class={s.notice} role="alert">
              {documentExport.error() ? i18n.t('exportError') : i18n.t('fullscreenError')}
              <div dir="auto">{message()}</div>
            </div>
          )}
        </Show>
      </Loading>
      <Show when={!isReady()}>
        <div class={s.loadinginfo} role={viewerError() ? 'alert' : 'status'}>
          <div class={s.loadingHeading}>
            <Show when={isBusy()}>
              <div
                role="progressbar"
                aria-label={i18n.status(status())}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={percent()}
                data-testid="document-loading"
              >
                <img class={s.loadingSpinner} src={loaderIcon} alt="" />
              </div>
            </Show>
            <strong>{i18n.status(status())}</strong>
            <Show when={isBusy()}>
              <button
                type="button"
                class={s.cancelLoading}
                aria-label={i18n.t('cancelLoading')}
                title={i18n.t('cancelLoading')}
                onClick={() => documentSource.cancel()}
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
                  {i18n.t('pageProgress', {
                    completed: String(progress()?.completed),
                    total: String(progress()?.total)
                  })}
                </span>
              </Show>
              <progress max={100} value={percent()} aria-hidden="true" />
            </div>
          </Show>
          <Show when={fileSource().file}>
            <div class={s.loadingFilename} dir="auto">
              {fileSource().file?.name}
            </div>
          </Show>
          <Show when={viewerError()}>
            {(error) => <div dir="auto">{error().message}</div>}
          </Show>
        </div>
      </Show>
    </div>
  );
}
