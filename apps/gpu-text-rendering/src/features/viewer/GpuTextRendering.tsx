import { Button } from '@app-game/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@app-game/components/ui/dropdown-menu';
import type { JSX } from '@solidjs/web';
import dots from '@tabler/icons/outline/dots.svg?url';
import grid from '@tabler/icons/outline/layout-grid.svg?url';
import loaderIcon from '@tabler/icons/outline/loader-2.svg?url';
import expand from '@tabler/icons/outline/maximize.svg?url';
import collapse from '@tabler/icons/outline/minimize.svg?url';
import closeIcon from '@tabler/icons/outline/x.svg?url';
import { createSignal, Match, Show, Switch } from 'solid-js';
import { GpuCanvas } from '../../shared/gpu';
import { CameraControls, CameraTour, createDocumentCamera, pageAspectOf } from '../camera';
import { createDocumentSource, DocumentRenderer, GlyphText, VectorArtwork } from '../document';
import noticesUrl from '../document/pdf/wasm/third-party-notices.txt?url';
import { Minimap } from '../minimap';
import { FrameLoop } from '../scene';
import { createViewport } from '../viewport';
import { createDocumentDrop } from './createDocumentDrop';
import { createDocumentExport } from './createDocumentExport';
import { createFullscreenToggleButton } from './createFullscreenToggleButton';
import { createViewerStatus, type ViewerStatus } from './createViewerStatus';
import { DocumentPicker } from './DocumentPicker';
import { createViewerI18n } from './i18n/createViewerI18n';
import { LanguageMenu } from './LanguageMenu';
import s from './viewer.module.scss';

/**
 * Displays a selected PDF/GDOC or the bundled document with TypeGPU and pointer-based navigation.
 * The GPU scene is assembled here from independent modules: the document source, viewport and camera are created
 * once, and each scene component receives the state it works on as props.
 */
export default function GpuTextRendering() {
  const i18n = createViewerI18n();

  const [canvas, setCanvas] = createSignal<HTMLCanvasElement>();
  const viewport = createViewport(canvas, { maxDpr: 2 });

  const [fileSource, setFileSource] = createSignal<{ file?: File }>({});
  /** Selects a file, or reopens the bundled demo; a new selection object reloads even the same file. */
  function open(file?: File) {
    setFileSource({ file });
  }

  const documentSource = createDocumentSource(() => fileSource().file);
  const currentDocument = () => documentSource.prepared()?.data;
  // Each prepared document starts from the initial view.
  const camera = createDocumentCamera({ pageAspect: () => pageAspectOf(currentDocument()), resetOn: currentDocument });
  const { status, isBusy, isReady, percent, reportGpuError, reportReady, reportResourceUsage } =
    createViewerStatus(documentSource);
  const documentExport = createDocumentExport(() => documentSource.prepared());

  const drop = createDocumentDrop(open);
  const fullscreen = createFullscreenToggleButton(i18n.t);

  // Camera controls report false when they unmount, so replacing, cancelling or failing the scene clears it.
  const [dragging, setDragging] = createSignal(false);
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
  const stopAutoZoom = () => setAutoZoom(false);

  /** Stops the tour and fits every page between the toolbar and the canvas edges. */
  function showOverview() {
    const pages = currentDocument()?.pages;

    if (pages) {
      stopAutoZoom();
      camera.fitToPages(pages, viewport.size().css, overviewPadding);
    }
  }

  return (
    <div ref={[fullscreen.setContainer, drop.ref]} class={s.viewer} lang={i18n.locale()} dir={i18n.direction()}>
      <canvas
        ref={setCanvas}
        id="beziercanvas"
        class={`${s.canvas} ${dragging() ? s.dragging : ''}`}
        style={{ visibility: status().phase === 'cancelled' ? 'hidden' : undefined }}
        aria-label={i18n.t('canvas')}
        aria-busy={isBusy() ? 'true' : 'false'}
      />

      <GpuCanvas canvas={canvas()} requiredBufferBytes={256 * 1024 * 1024} error={reportGpuError}>
        <Show when={documentSource.prepared()} keyed>
          {({ data, fail }) => (
            <FrameLoop viewport={viewport} onError={fail}>
              <CameraControls camera={camera} onInteraction={stopAutoZoom} onDraggingChange={setDragging} />
              <CameraTour camera={camera} document={data} enabled={autoZoom()} />
              <DocumentRenderer
                document={data}
                camera={camera}
                initialFrame="viewport"
                onReady={reportReady}
                onResourceUsage={reportResourceUsage}
                onError={fail}
              >
                <Switch>
                  <Match when={data.kind === 'glyphs'}>
                    <GlyphText vectorOnly={vectorOnly()} grids={grids()} />
                  </Match>
                  <Match when={data.kind === 'curves'}>
                    <VectorArtwork vectorOnly={vectorOnly()} />
                  </Match>
                </Switch>
              </DocumentRenderer>
              <Show when={minimap()}>
                <Minimap document={data} camera={camera} onNavigate={stopAutoZoom} />
              </Show>
            </FrameLoop>
          )}
        </Show>
      </GpuCanvas>

      <Show when={drop.isOver()}>
        <div class={s.dropOverlay} role="status" data-testid="document-drop-overlay">
          <div>{i18n.t('dropHint')}</div>
        </div>
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
                  <MenuToggle checked={autoZoom()} onToggle={setAutoZoom}>
                    {i18n.t('autoZoom')}
                  </MenuToggle>
                  <MenuToggle checked={minimap()} onToggle={setMinimap}>
                    {i18n.t('minimap')}
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
