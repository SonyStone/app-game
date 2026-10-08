import type { PsdImage } from '@app-game/psd/viewer';
import { createMemo, createSignal, Errored, isPending, latest, onCleanup, Show } from 'solid-js';
import styles from './App.module.css';
import { createComparison, DifferenceSummary, ViewSwitch, type ViewMode } from './features/comparison';
import { createPsdDocument, createPsdRender, type PsdSource } from './features/document';
import { ExamplesMenu } from './features/examples';
import { createFonts, FontsPanel, TextSupportSection } from './features/fonts';
import { DocumentInspector, LayerInspector } from './features/inspector';
import { collectNotes, createLayerVisibility, LayersPanel } from './features/layers';
import { createFileDrop, fileSource, firstPsd, urlSource } from './features/open-file';
import { createPsdWorker, makePsdClient, type PsdResultOf, type WorkerFailure } from './features/psd-worker';
import { createRenderSettings, RenderSettingsPanel } from './features/render-settings';
import { ariaState } from './features/shared/format';
import { StatusArea } from './features/status';
import { createViewport, RgbaCanvas } from './features/viewport';

/**
 * PSD Viewer: opens a Photoshop document in a worker, renders it with the Rust compositor and compares the result with
 * the merged image Photoshop saved. The screen is assembled here from independent features: the worker client and
 * document session, layer visibility, render settings, the fonts for re-rendering text, the zoomable viewport, the
 * comparison views, the inspector and the renderer status.
 */
export function App() {
  const client = makePsdClient(createPsdWorker());
  onCleanup(client.dispose);

  const { source, opened, open } = createPsdDocument(client);
  const { settings, update, replace, reset } = createRenderSettings();
  const { overrides, pairs, setVisible } = createLayerVisibility(source);
  const [selected, setSelected] = createSignal<number | undefined>(() => {
    source();
    return undefined;
  });
  const fonts = createFonts(client, opened, selected);
  const render = createPsdRender(client, opened, fonts.withFonts(settings), pairs);
  const { view, setView, merged, difference } = createComparison(client, opened, render);

  const [tab, setTab] = createSignal<'layer' | 'document'>('document');
  const layer = createMemo(() => {
    const document = opened();
    const index = selected();
    return document?.ok && index !== undefined ? client.layer(document.value.document, index) : undefined;
  });
  const selectLayer = (index: number) => {
    setSelected(index);
    setTab('layer');
  };

  const document = () => valueOf(opened());
  const openFailure = () => failureOf(opened());
  const layerContents = () => valueOf(layer());
  const documentFonts = () => valueOf(fonts.report());
  const layerTextSupport = () => valueOf(fonts.layerSupport());
  const layerFailure = () => failureOf(layer());
  const differenceValue = () => valueOf(difference());
  const shown = createMemo<PsdImage | undefined>(() => {
    const result = view() === 'ours' ? render() : view() === 'photoshop' ? merged() : difference();
    return result?.ok ? result.value : undefined;
  });
  const shownFailure = () => {
    const result = view() === 'ours' ? render() : view() === 'photoshop' ? merged() : (difference() ?? render());
    return result && !result.ok && result.error.kind !== 'superseded' && result.error.kind !== 'stale'
      ? result.error
      : undefined;
  };
  const viewport = createViewport(() => document()?.info, source);
  const layerNotes = createMemo(() => collectNotes(document()?.layers ?? []));

  const activity = () => {
    if (isPending(opened)) {
      return `Opening ${latest(source)?.name ?? ''}…`;
    }

    if (isPending(render)) {
      return 'Rendering…';
    }

    if (isPending(difference) || isPending(merged)) {
      return 'Comparing…';
    }

    return isPending(layer) ? 'Reading layer…' : undefined;
  };

  /** Opens a source, adopting the settings it was captured with. */
  function openSource(next: PsdSource) {
    open(next);
    if (next.settings) {
      replace(next.settings);
    }
  }

  const drop = createFileDrop((files) => {
    const file = firstPsd(files);
    if (file) {
      openSource(fileSource(file));
    }
  });
  let input!: HTMLInputElement;

  return (
    <div class={[styles.viewer, styles.workspace]} {...drop.handlers}>
      <header class={styles.toolbar}>
        <h1>PSD Viewer</h1>
        <span class={styles.documentName}>{latest(source)?.name ?? 'No document'}</span>
        <ExamplesMenu onOpen={(example) => openSource(urlSource(example.file, example.url, example.settings))} />
        <button type="button" onClick={() => input.click()}>
          Open…
        </button>
        <input
          ref={(element) => (input = element)}
          type="file"
          accept=".psd,.psb"
          hidden
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            if (file) {
              openSource(fileSource(file));
            }

            event.currentTarget.value = '';
          }}
        />
        <span class={styles.spacer} />
        <ViewSwitch view={latest(view)} onView={(next: ViewMode) => setView(next)} disabled={!document()} />
        <div class={styles.zoom} role="group" aria-label="Zoom">
          <button type="button" aria-label="Zoom out" onClick={viewport.zoomOut}>
            −
          </button>
          <output aria-label="Zoom level">{viewport.percent()}%</output>
          <button type="button" aria-label="Zoom in" onClick={viewport.zoomIn}>
            +
          </button>
          <button type="button" aria-pressed={ariaState(viewport.isFitted())} onClick={viewport.fit}>
            Fit
          </button>
          <button type="button" onClick={viewport.actualSize}>
            100%
          </button>
        </div>
      </header>
      <Errored
        fallback={(error) => (
          <div class={styles.crash} role="alert">
            <p>The renderer stopped: {String(error())}</p>
            <button type="button" onClick={() => location.reload()}>
              Reload
            </button>
          </div>
        )}
      >
        <main class={styles.panels}>
          <aside class={styles.layers} aria-label="Layers panel">
            <header class={styles.panelHeading}>
              <h2>Layers</h2>
              <span>{document() ? `${document()!.info.layerRecords} records` : ''}</span>
            </header>
            <Show when={document()} fallback={<p class={styles.empty}>Open a document to see its layers.</p>}>
              {(current) => (
                <LayersPanel
                  layers={current().layers}
                  visibleOf={(node) => latest(overrides).get(node.index) ?? node.visible}
                  onVisible={setVisible}
                  selected={latest(selected)}
                  onSelect={selectLayer}
                />
              )}
            </Show>
          </aside>
          <section class={styles.stage}>
            <div
              ref={viewport.setElement}
              class={styles.viewport}
              {...viewport.surface}
              data-view={view()}
              data-busy={activity() ? 'true' : 'false'}
              data-render-id={(() => {
                const current = render();
                return current?.ok ? current.value.render : undefined;
              })()}
            >
              <Show when={shown()}>
                {(image) => (
                  <div
                    class={styles.imageLayer}
                    style={{
                      transform: viewport.transform(),
                      width: `${image().width}px`,
                      height: `${image().height}px`
                    }}
                  >
                    <RgbaCanvas
                      class={viewport.view().scale >= 2 ? `${styles.canvas} ${styles.pixelated}` : styles.canvas}
                      image={image()}
                      label={
                        view() === 'ours'
                          ? 'Our render'
                          : view() === 'photoshop'
                            ? "Photoshop's merged image"
                            : 'Difference heat map'
                      }
                    />
                  </div>
                )}
              </Show>
              <Show when={!latest(source)}>
                <div class={styles.welcome}>
                  <h2>Drop a PSD or PSB here</h2>
                  <p>Or use Open… or Examples…. Files stay on this computer; rendering runs in a worker.</p>
                </div>
              </Show>
              <Show when={openFailure()}>
                {(failure) => (
                  <div class={styles.message} role="alert">
                    {source()?.name} could not be opened: {failure().message}
                  </div>
                )}
              </Show>
              <Show when={document() && shownFailure()}>
                {(error) => (
                  <div class={styles.message} role="alert">
                    {error().kind === 'unsupported' ? 'Not rendered — unsupported: ' : ''}
                    {error().message}
                  </div>
                )}
              </Show>
              <Show when={view() === 'difference' && differenceValue()}>
                {(value) => <DifferenceSummary difference={value()} />}
              </Show>
              <Show when={activity()}>
                <div class={styles.busy} role="progressbar" aria-label={activity()}>
                  <span class={styles.spinner} aria-hidden="true" />
                  {activity()}
                </div>
              </Show>
            </div>
            <Show when={document()}>
              {(current) => (
                <StatusArea
                  render={render()}
                  layerNotes={layerNotes()}
                  documentNotes={current().info.notes}
                  onSelect={selectLayer}
                />
              )}
            </Show>
          </section>
          <aside class={styles.inspector} aria-label="Inspector">
            <RenderSettingsPanel settings={latest(settings)} onChange={update} onReset={reset} />
            <Show when={documentFonts()?.layers.length ? documentFonts() : undefined}>
              {(report) => (
                <FontsPanel
                  report={report()}
                  library={valueOf(fonts.library()) ?? []}
                  reRender={latest(settings).typeLayers}
                  onReRender={(typeLayers) => update({ typeLayers })}
                  ready={fonts.ready()}
                  missing={fonts.missing()}
                  adding={fonts.adding()}
                  refusals={fonts.refusals()}
                  canUseInstalled={fonts.canUseInstalled}
                  onUseInstalled={() => void fonts.useInstalled()}
                  onFiles={(files) => void fonts.addFiles(files)}
                />
              )}
            </Show>
            <div class={styles.tabs} role="group" aria-label="Inspector view">
              <button type="button" aria-pressed={ariaState(tab() === 'layer')} onClick={() => setTab('layer')}>
                Layer
              </button>
              <button type="button" aria-pressed={ariaState(tab() === 'document')} onClick={() => setTab('document')}>
                Document
              </button>
            </div>
            <div class={styles.inspectorBody}>
              <Show when={document()} fallback={<p class={styles.empty}>No document.</p>}>
                {(current) => (
                  <Show
                    when={tab() === 'layer'}
                    fallback={<DocumentInspector info={current().info} name={source()?.name ?? ''} />}
                  >
                    <Show
                      when={layerContents()}
                      fallback={<p class={styles.empty}>{layerFailure()?.message ?? 'Select a layer.'}</p>}
                    >
                      {(contents) => (
                        <>
                          <LayerInspector contents={contents()} />
                          <Show when={layerTextSupport()}>
                            {(support) => <TextSupportSection support={support()} />}
                          </Show>
                        </>
                      )}
                    </Show>
                  </Show>
                )}
              </Show>
            </div>
          </aside>
        </main>
      </Errored>
      <footer class={styles.status} role="status">
        <span>
          <Show when={activity()}>
            <span class={styles.spinnerSmall} aria-hidden="true" />
          </Show>
          {activity() ?? statusText()}
        </span>
        <span>
          {document()
            ? `${document()!.info.width} × ${document()!.info.height} · ${document()!.info.depth}-bit ${document()!.info.modeName}`
            : ''}
        </span>
      </footer>
      <Show when={drop.dragging()}>
        <div class={styles.dropIndicator}>Drop to open</div>
      </Show>
    </div>
  );

  /** The settled state in words: the last render's time or why there is none. */
  function statusText() {
    const current = render();
    if (!document()) {
      return 'Ready';
    }

    if (!current?.ok) {
      return current?.error.kind === 'unsupported'
        ? 'Not rendered: unsupported feature, see the status below the canvas'
        : 'Not rendered';
    }

    const approximate = current.value.approximations.length ? ', approximated' : '';
    return `Rendered ${current.value.width} × ${current.value.height} at ${current.value.depth} bits in ${Math.round(current.value.milliseconds)} ms${approximate}`;
  }
}

/** The value of a settled result, `undefined` before one or after a failure. */
function valueOf<T>(result: PsdResultOf<T> | undefined): T | undefined {
  return result?.ok ? result.value : undefined;
}

/** The failure of a settled result. */
function failureOf<T>(result: PsdResultOf<T> | undefined): WorkerFailure | undefined {
  return result && !result.ok ? result.error : undefined;
}
