import { Button } from '@app-game/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@app-game/components/ui/dropdown-menu';
import { Resizable, ResizableHandle, ResizablePanel } from '@app-game/components/ui/resizable';
import { createEventListener } from '@solid-primitives/event-listener';
import { createElementSize } from '@solid-primitives/resize-observer';
import type { JSX } from '@solidjs/web';
import bookmarkIcon from '@tabler/icons/outline/bookmark-plus.svg?url';
import dots from '@tabler/icons/outline/dots.svg?url';
import splitIcon from '@tabler/icons/outline/layout-columns.svg?url';
import grid from '@tabler/icons/outline/layout-grid.svg?url';
import loaderIcon from '@tabler/icons/outline/loader-2.svg?url';
import expand from '@tabler/icons/outline/maximize.svg?url';
import collapse from '@tabler/icons/outline/minimize.svg?url';
import closeIcon from '@tabler/icons/outline/x.svg?url';
import { createSignal, For, Match, onCleanup, Show, Switch, untrack } from 'solid-js';
import { GpuCanvasProvider, TypeGPURootProvider } from '../../shared/gpu';
import { CameraControls, CameraTour, ViewCapture, ViewTour } from '../camera';
import { createDocumentSource, DocumentRenderer, GlyphText, VectorArtwork } from '../document';
import noticesUrl from '../document/pdf/wasm/third-party-notices.txt?url';
import { Minimap } from '../minimap';
import { PerformanceMonitor } from '../performance';
import { FrameLoop } from '../scene';
import { createDocumentDrop } from './createDocumentDrop';
import { createDocumentExport } from './createDocumentExport';
import { createFullscreenToggleButton } from './createFullscreenToggleButton';
import { createSavedViews } from './createSavedViews';
import { createViewerStatus, type ViewerStatus } from './createViewerStatus';
import { createViewPane, type ViewPane } from './createViewPane';
import { DocumentPicker } from './DocumentPicker';
import { createViewerI18n } from './i18n/createViewerI18n';
import { LanguageMenu } from './LanguageMenu';
import { SavedViewStrip } from './SavedViewStrip';
import s from './viewer.module.scss';

/**
 * Displays a selected PDF/GDOC or the bundled document with TypeGPU and pointer-based navigation, optionally in two
 * independently navigated panes. The GPU scene is assembled here from independent modules: the document is prepared
 * once on the device, and each pane's canvas draws it through its own viewport and camera.
 */
export default function GpuTextRendering() {
  const i18n = createViewerI18n();

  const [fileSource, setFileSource] = createSignal<{ file?: File }>({});
  /** Selects a file, or reopens the bundled demo; a new selection object reloads even the same file. */
  function open(file?: File) {
    setFileSource({ file });
  }

  const documentSource = createDocumentSource(() => fileSource().file);
  const currentDocument = () => documentSource.prepared()?.data;
  const { status, isBusy, isReady, percent, reportGpuError, reportReady, reportResourceUsage } =
    createViewerStatus(documentSource);
  const documentExport = createDocumentExport(() => documentSource.prepared());

  const drop = createDocumentDrop(open);
  const fullscreen = createFullscreenToggleButton(i18n.t);

  // Each mounted pane registers itself in `panes`, in layout order; the GPU scene draws one canvas per pane.
  const [paneCount, setPaneCount] = createSignal(1);
  const [panes, setPanes] = createSignal<ViewPane[]>([], { ownedWrite: true });
  const addPane = (pane: ViewPane) => setPanes((panes) => [...panes, pane]);
  const removePane = (pane: ViewPane) => setPanes((panes) => panes.filter((other) => other !== pane));
  const [focusedPane, setFocusedPane] = createSignal<ViewPane>();
  /** The pane that the toolbar's overview and tour act on: the last one pressed or scrolled, else the first. */
  const focused = () => {
    const pane = focusedPane();
    return pane && panes().includes(pane) ? pane : panes()[0];
  };
  const split = () => paneCount() > 1;

  // Panes sit side by side when the viewer is wider than tall, and stack otherwise.
  const [viewer, setViewer] = createSignal<HTMLElement>();
  const viewerSize = createElementSize(viewer);
  const orientation = () => ((viewerSize.width ?? 1) >= (viewerSize.height ?? 0) ? 'horizontal' : 'vertical');

  const [autoZoom, setAutoZoom] = createSignal(
    () => {
      fileSource();
      return false;
    },
    { ownedWrite: true }
  );
  const [vectorOnly, setVectorOnly] = createSignal(false);
  const [grids, setGrids] = createSignal(false);
  const [minimap, setMinimap] = createSignal(false);
  // `?performance` opens the viewer with the monitor on, for agents reading window.gpuPerformance or /__performance.
  const [performanceMonitor, setPerformanceMonitor] = createSignal(
    new URLSearchParams(location.search).has('performance')
  );

  // Saved views belong to the displayed document and the single-pane layout; split view hides and pauses them.
  const savedViews = createSavedViews(fileSource);

  /** Stops both camera tours and any flight to a saved view, for user navigation. */
  const stopAutoZoom = () => {
    setAutoZoom(false);
    savedViews.stop();
  };

  /** Enables or disables the automatic tour, which replaces a saved-view tour. */
  function toggleAutoZoom(enabled: boolean) {
    savedViews.stop();
    setAutoZoom(enabled);
  }

  /** Moves the focused pane to a scrubbed position between saved views, stopping both tours. */
  function scrubViews(position: number) {
    const camera = savedViews.scrub(position);
    const pane = focused();

    if (camera && pane) {
      setAutoZoom(false);
      pane.camera.setCamera(camera);
    }
  }

  /** Starts or stops the saved-view tour, which replaces the automatic tour. */
  function toggleViewTour() {
    setAutoZoom(false);
    savedViews.toggleTour();
  }

  /** Stops the tour and fits every page in the focused pane, between the toolbar and the canvas edges. */
  function showOverview() {
    const pages = currentDocument()?.pages;
    const pane = focused();

    if (pages && pane) {
      stopAutoZoom();
      pane.camera.fitToPages(pages, pane.viewport.size().css, overviewPadding);
    }
  }

  /** Opens a second pane on the focused pane's view, or closes it keeping the focused pane's view in the first. */
  function toggleSplit() {
    const [first, second] = panes();

    if (split() && first && second && focused() === second) {
      first.camera.setCamera(second.camera.camera());
    }

    savedViews.stop();
    setFocusedPane(undefined);
    setPaneCount(split() ? 1 : 2);
  }

  return (
    <div
      ref={[fullscreen.setContainer, drop.ref, setViewer]}
      class={s.viewer}
      lang={i18n.locale()}
      dir={i18n.direction()}
    >
      <Resizable orientation={orientation()} class={s.split}>
        <For each={Array.from({ length: paneCount() }, (_, index) => index)}>
          {(slot) => {
            // A new pane opens on a snapshot of the focused pane's view; the first keeps the canvas id that tests use.
            const pane = createViewPane(
              currentDocument,
              untrack(() => focused()?.camera.camera())
            );
            addPane(pane);
            onCleanup(() => removePane(pane));
            createEventListener(pane.canvas, ['pointerdown', 'wheel'], () => setFocusedPane(pane), {
              capture: true,
              passive: true
            });

            return (
              <>
                <Show when={slot > 0}>
                  <ResizableHandle orientation={orientation()} class={s.divider} aria-label={i18n.t('resizePanes')} />
                </Show>
                <ResizablePanel
                  class={`${s.pane} ${split() && focused() === pane ? s.focusedPane : ''}`}
                  minSize={0.15}
                >
                  <canvas
                    ref={pane.setCanvas}
                    id={slot === 0 ? 'beziercanvas' : undefined}
                    class={`${s.canvas} ${pane.dragging() ? s.dragging : ''}`}
                    style={{ visibility: status().phase === 'cancelled' ? 'hidden' : undefined }}
                    aria-label={i18n.t('canvas')}
                    aria-busy={isBusy() ? 'true' : 'false'}
                  />
                </ResizablePanel>
              </>
            );
          }}
        </For>
      </Resizable>

      <TypeGPURootProvider requiredBufferBytes={256 * 1024 * 1024} error={reportGpuError}>
        <Show when={documentSource.prepared()} keyed>
          {({ data, fail }) => (
            <DocumentRenderer
              document={data}
              initialView={panes()[0]}
              onReady={reportReady}
              onResourceUsage={reportResourceUsage}
              onError={fail}
            >
              <For each={panes()}>
                {(pane) => (
                  <GpuCanvasProvider canvas={pane.canvas()} error={reportGpuError}>
                    <FrameLoop viewport={pane.viewport} onError={fail}>
                      <CameraControls
                        camera={pane.camera}
                        onInteraction={stopAutoZoom}
                        onDraggingChange={pane.setDragging}
                      />
                      <CameraTour camera={pane.camera} document={data} enabled={autoZoom() && focused() === pane} />
                      <ViewTour
                        camera={pane.camera}
                        stops={savedViews.stops()}
                        route={savedViews.route()}
                        onVisit={savedViews.reportVisit}
                        onFinish={savedViews.stop}
                      />
                      <ViewCapture
                        camera={pane.camera}
                        pending={savedViews.capturing() && focused() === pane}
                        onCapture={savedViews.capture}
                      />
                      <Switch>
                        <Match when={data.kind === 'glyphs'}>
                          <GlyphText camera={pane.camera} vectorOnly={vectorOnly()} grids={grids()} />
                        </Match>
                        <Match when={data.kind === 'curves'}>
                          <VectorArtwork camera={pane.camera} vectorOnly={vectorOnly()} />
                        </Match>
                      </Switch>
                      <Show when={minimap()}>
                        <Minimap document={data} camera={pane.camera} onNavigate={stopAutoZoom} />
                      </Show>
                      <Show when={performanceMonitor()}>
                        <PerformanceMonitor label={`pane ${panes().indexOf(pane) + 1}`} />
                      </Show>
                    </FrameLoop>
                  </GpuCanvasProvider>
                )}
              </For>
            </DocumentRenderer>
          )}
        </Show>
      </TypeGPURootProvider>

      <Show when={drop.isOver()}>
        <div class={s.dropOverlay} role="status" data-testid="document-drop-overlay">
          <div>{i18n.t('dropHint')}</div>
        </div>
      </Show>
      <Show when={!split() && isReady() && savedViews.views().length > 0}>
        <SavedViewStrip i18n={i18n} savedViews={savedViews} onToggleTour={toggleViewTour} onScrub={scrubViews} />
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
          onClick={showOverview}
        >
          <img src={grid} alt="" />
        </Button>
        <Button
          class={s.iconButton}
          variant="ghost"
          size="icon"
          aria-label={i18n.t('saveView')}
          title={i18n.t('saveView')}
          disabled={!isReady() || split()}
          onClick={() => savedViews.save()}
        >
          <img src={bookmarkIcon} alt="" />
        </Button>
        <Button
          class={s.iconButton}
          variant="ghost"
          size="icon"
          aria-label={i18n.t('splitView')}
          aria-pressed={split() ? 'true' : 'false'}
          title={i18n.t('splitView')}
          disabled={!isReady()}
          onClick={toggleSplit}
        >
          <img src={splitIcon} alt="" />
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
                  <Show when={documentExport.available()}>
                    <DropdownMenuItem
                      class={s.menuItem}
                      disabled={documentExport.pending()}
                      onClick={() => void documentExport.save()}
                    >
                      {documentExport.pending() ? i18n.t('exporting') : i18n.t('download')}
                    </DropdownMenuItem>
                  </Show>
                  <Show when={fileSource().file?.name}>
                    <DropdownMenuItem class={s.menuItem} onClick={() => open()}>
                      {i18n.t('back')}
                    </DropdownMenuItem>
                  </Show>
                  <DropdownMenuSeparator class={s.separator} />
                  <MenuToggle checked={autoZoom()} onToggle={toggleAutoZoom}>
                    {i18n.t('autoZoom')}
                  </MenuToggle>
                  <MenuToggle checked={minimap()} onToggle={setMinimap}>
                    {i18n.t('minimap')}
                  </MenuToggle>
                  <MenuToggle checked={performanceMonitor()} onToggle={setPerformanceMonitor}>
                    {i18n.t('performance')}
                  </MenuToggle>
                  <Show when={documentSource.prepared()?.data.kind === 'glyphs'}>
                    <MenuToggle checked={grids()} onToggle={setGrids}>
                      {i18n.t('grids')}
                    </MenuToggle>
                    <MenuToggle checked={vectorOnly()} onToggle={setVectorOnly}>
                      {i18n.t('vectorOnly')}
                    </MenuToggle>
                  </Show>
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
      <div class={s.notices}>
        <Show when={drop.error()}>
          {(key) => (
            <Notice dismissLabel={i18n.t('dismiss')} onDismiss={drop.dismissError}>
              {i18n.t(key())}
            </Notice>
          )}
        </Show>
        <Show when={fullscreen.error()}>
          {(error) => (
            <Notice dismissLabel={i18n.t('dismiss')} onDismiss={fullscreen.dismissError}>
              {i18n.t('fullscreenError')}
              <div dir="auto">{error().message}</div>
            </Notice>
          )}
        </Show>
        <Show when={documentExport.pending()}>
          <div class={s.notice} role="status">
            {i18n.t('exporting')}
          </div>
        </Show>
        <Show when={documentExport.error()}>
          {(message) => (
            <Notice dismissLabel={i18n.t('dismiss')} onDismiss={documentExport.dismissError}>
              {i18n.t('exportError')}
              <div dir="auto">{message()}</div>
            </Notice>
          )}
        </Show>
      </div>
      <Show when={!isReady()}>
        <LoadingPanel
          i18n={i18n}
          status={status()}
          busy={isBusy()}
          percent={percent()}
          fileName={fileSource().file?.name}
          onCancel={() => documentSource.cancel()}
        />
      </Show>
    </div>
  );
}

/** CSS pixels kept clear of the toolbar and canvas edges when fitting the whole document. */
const overviewPadding = { top: 44, right: 24, bottom: 84, left: 24 };

/** Menu checkbox that flips `checked` through `onToggle` and keeps the menu open for further toggles. */
function MenuToggle(props: {
  checked: boolean;
  /** Receives the requested state, the opposite of `checked`. */
  onToggle: (checked: boolean) => void;
  children: JSX.Element;
}) {
  return (
    <DropdownMenuCheckboxItem
      class={s.menuItem}
      checked={props.checked}
      onClick={(event) => {
        event.preventDefault();
        props.onToggle(!props.checked);
      }}
    >
      {props.children}
    </DropdownMenuCheckboxItem>
  );
}

/** Dismissible alert for a failed user action; the owner of the error clears it through `onDismiss`. */
function Notice(props: {
  /** Accessible name of the dismiss button. */
  dismissLabel: string;
  /** Clears the displayed error. */
  onDismiss: () => void;
  children: JSX.Element;
}) {
  return (
    <div class={s.notice} role="alert">
      <div>{props.children}</div>
      <button
        type="button"
        class={s.dismissNotice}
        aria-label={props.dismissLabel}
        title={props.dismissLabel}
        onClick={() => props.onDismiss()}
      >
        <img src={closeIcon} alt="" />
      </button>
    </div>
  );
}

/** Describes loading, cancellation or failure of the current document, with progress and a cancel button while busy. */
function LoadingPanel(props: {
  i18n: ReturnType<typeof createViewerI18n>;
  status: ViewerStatus;
  /** Shows the spinner and cancel button. */
  busy: boolean;
  /** Whole progress percentage; hides the progress bar when undefined. */
  percent: number | undefined;
  /** Selected file name; omitted for the bundled demo. */
  fileName: string | undefined;
  /** Cancels loading of the current selection. */
  onCancel: () => void;
}) {
  const progress = () => ('progress' in props.status ? props.status.progress : undefined);
  const error = () => (props.status.phase === 'error' ? props.status.error : undefined);

  return (
    <div class={s.loadinginfo} role={error() ? 'alert' : 'status'}>
      <div class={s.loadingHeading}>
        <Show when={props.busy}>
          <div
            role="progressbar"
            aria-label={props.i18n.status(props.status)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={props.percent}
            data-testid="document-loading"
          >
            <img class={s.loadingSpinner} src={loaderIcon} alt="" />
          </div>
        </Show>
        <strong>{props.i18n.status(props.status)}</strong>
        <Show when={props.busy}>
          <button
            type="button"
            class={s.cancelLoading}
            aria-label={props.i18n.t('cancelLoading')}
            title={props.i18n.t('cancelLoading')}
            onClick={() => props.onCancel()}
          >
            <img src={closeIcon} alt="" />
          </button>
        </Show>
      </div>
      <Show when={props.percent !== undefined}>
        <div class={s.loadingProgress}>
          <span>{props.percent}%</span>
          <Show when={progress()?.stage === 'processingPages'}>
            <span>
              {props.i18n.t('pageProgress', {
                completed: String(progress()?.completed),
                total: String(progress()?.total)
              })}
            </span>
          </Show>
          <progress max={100} value={props.percent} aria-hidden="true" />
        </div>
      </Show>
      <Show when={props.fileName}>
        <div class={s.loadingFilename} dir="auto">
          {props.fileName}
        </div>
      </Show>
      <Show when={error()}>{(error) => <div dir="auto">{error().message}</div>}</Show>
    </div>
  );
}
