import { createMemo, createSignal, Errored, isPending, latest, onCleanup, Show } from 'solid-js';
import styles from './App.module.css';
import { createBlendingDetection } from './features/blending-detection';
import { createComparison, DifferenceSummary, ViewSwitch, type ViewMode } from './features/comparison';
import { createPsdDocument, createPsdRender, type PsdSource } from './features/document';
import { createOpeningPreview } from './features/document/createOpeningPreview';
import { ExamplesMenu } from './features/examples';
import { createFonts, FontsPanel, TextSupportSection } from './features/fonts';
import { GpuViewport } from './features/gpu-viewport/GpuViewport';
import type { DisplayImage } from './features/gpu-viewport/displayTiles';
import { DocumentInspector, LayerInspector } from './features/inspector';
import { collectNotes, createLayerVisibility, LayersPanel, layerVisibility } from './features/layers';
import { createFileDrop, fileSource, firstPsd, urlSource } from './features/open-file';
import { OpenFailure } from './features/open-file/OpenFailure';
import { createOpenPrompt, OpeningReport, OpenPromptDialog } from './features/open-like-photoshop';
import { createPsdWorker, makePsdClient, type PsdResultOf, type WorkerFailure } from './features/psd-worker';
import { requiresWindowedRendering } from './features/psd-worker/protocol';
import { createRenderSettings, RenderSettingsPanel } from './features/render-settings';
import { ariaState } from './features/shared/format';
import { createStateChoice, StatesPanel } from './features/states';
import { StatusArea } from './features/status';
import { createViewport } from './features/viewport';
import { createWindowedRender } from './features/viewport/createWindowedRender';

/**
 * PSD Viewer: opens a Photoshop document in a worker, renders it with the Rust compositor and compares the result with
 * the merged image Photoshop saved. The screen is assembled here from independent features: the worker client and
 * document session, opening files as Photoshop does with its prompts, layer visibility, render settings with the gamma blending options detected per document, the fonts for
 * re-rendering text, the saved layer comps and animation frames to render, the zoomable viewport, the comparison views,
 * the inspector and the renderer status.
 */
export function App() {
  const client = makePsdClient(createPsdWorker(), createPsdWorker);
  const [displayBusy, setDisplayBusy] = createSignal(false);
  onCleanup(client.dispose);

  const { source, opened, opening, canceled, open, cancel, retry } = createPsdDocument(client);
  const { prompt, answer } = createOpenPrompt(source, opened, open);
  const { settings: stored, update, replace, reset } = createRenderSettings();
  const { overrides, pairs, setVisible } = createLayerVisibility(source);
  const initial = createOpeningPreview(client, opened, stored);
  const blending = createBlendingDetection(client, opened, stored, pairs, initial.ready);
  const settings = blending.settings;
  const [selected, setSelected] = createSignal<number | undefined>(() => {
    source();
    return undefined;
  });
  const fonts = createFonts(client, () => (initial.ready() ? opened() : undefined), selected);
  const { choice: stateChoice, choose: chooseState, withState } = createStateChoice(source);
  const document = () => valueOf(opened());
  const viewport = createViewport(() => document()?.info, source);
  const windowed = () => Boolean(document() && requiresWindowedRendering(document()!.info));
  const renderSettings = fonts.withFonts(withState(settings));
  const wholeRender = createPsdRender(client, () => (blending.settled() ? opened() : undefined), renderSettings, pairs);
  const windows = createWindowedRender(client, opened, renderSettings, pairs, viewport);
  const render = () => (windowed() ? windows.render() : wholeRender());
  const renderWindow = () => valueOf(render())?.window;
  const { view, setView, merged, difference } = createComparison(client, opened, render, () =>
    initial.preview()?.source === 'saved' ? initial.preview()?.image : undefined
  );

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

  // An unanswered prompt shows as the prompt dialog, not as a failure.
  const openFailure = () => {
    const failure = failureOf(opened());
    return failure?.kind === 'needsAnswer' ? undefined : failure;
  };
  const layerContents = () => valueOf(layer());
  const documentFonts = () => valueOf(fonts.report());
  const layerTextSupport = () => valueOf(fonts.layerSupport());
  const layerFailure = () => failureOf(layer());
  const differenceValue = () => valueOf(difference());
  const shown = createMemo<DisplayImage | undefined>(() => {
    const result = view() === 'ours' ? latest(render) : view() === 'photoshop' ? merged() : difference();
    return result?.ok ? result.value : view() === 'ours' && !result ? initial.preview()?.image : undefined;
  });
  const shownFailure = () => {
    const result = view() === 'ours' ? render() : view() === 'photoshop' ? merged() : (difference() ?? render());
    return result && !result.ok && result.error.kind !== 'superseded' && result.error.kind !== 'stale'
      ? result.error
      : undefined;
  };
  const layerNotes = createMemo(() => collectNotes(document()?.layers ?? []));
  const savedStates = () => {
    const states = document()?.states;
    return states?.comps.length || states?.frames.length || states?.errors.length ? states : undefined;
  };

  const activity = () => {
    if (opening()) {
      return `Opening ${latest(source)?.name ?? ''}…`;
    }

    if (document() && !blending.settled()) {
      return initial.ready() ? 'Detecting blending…' : 'Loading preview…';
    }

    if (windows.busy() || isPending(wholeRender)) {
      return 'Rendering…';
    }

    if (isPending(difference) || isPending(merged)) {
      return 'Comparing…';
    }

    if (displayBusy()) {
      return 'Displaying…';
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
        <Show when={source()}>
          <button type="button" onClick={cancel}>
            Cancel
          </button>
        </Show>
        <Show when={canceled()}>
          <button type="button" onClick={() => retry()}>
            Restart
          </button>
        </Show>
        <span class={styles.spacer} />
        <ViewSwitch
          view={latest(view)}
          onView={(next: ViewMode) => setView(next)}
          disabled={!document()}
          windowed={windowed()}
        />
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
              data-render-source={renderWindow()?.source}
              data-render-step={renderWindow()?.step}
              data-render-id={(() => {
                const current = render();
                return current?.ok ? current.value.render : undefined;
              })()}
            >
              <Show when={shown()}>
                {(image) => (
                  <GpuViewport
                    image={image()}
                    onPresented={initial.presented}
                    onBusyChange={setDisplayBusy}
                    view={viewport.view()}
                    size={viewport.size()}
                    label={
                      view() === 'ours'
                        ? !latest(render) && initial.preview()
                          ? 'Opening preview'
                          : 'Our render'
                        : view() === 'photoshop'
                          ? "Photoshop's merged image"
                          : 'Difference heat map'
                    }
                  />
                )}
              </Show>
              <Show when={initial.preview() && !latest(render)}>
                <p class={styles.previewLabel} role="note" data-preview={initial.preview()?.source}>
                  {initial.preview()?.source === 'saved'
                    ? 'Saved preview. May be stale; does not reflect changed settings or visibility.'
                    : 'Chosen-settings preview. Blending detection has not settled.'}{' '}
                  Blending fidelity is unverified until detection finishes.
                </p>
              </Show>
              <Show when={!latest(source)}>
                <div class={styles.welcome}>
                  <h2>Drop a PSD or PSB here</h2>
                  <p>Or use Open… or Examples…. Files stay on this computer; rendering runs in a worker.</p>
                </div>
              </Show>
              <Show when={openFailure()}>
                {(failure) => (
                  <OpenFailure
                    name={source()?.name ?? ''}
                    failure={failure()}
                    class={styles.message}
                    onStrict={() => retry('strict')}
                  />
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
                <>
                  <OpeningReport opening={current().opening} />
                  <Show when={source()?.mode === 'strict'}>
                    <p role="note">
                      Strict reading. Photoshop recovery and repairs were skipped. Layers may differ from a recovered
                      opening; Photoshop view shows the saved composite when available.
                    </p>
                  </Show>
                  <Show when={windowed()}>
                    <p role="note">
                      Windowed layer view. Large canvases use the strict reader and your blending preferences. Photoshop
                      recovery, automatic blending detection and whole-image comparison are unavailable at this size.
                    </p>
                  </Show>
                  <StatusArea
                    render={render()}
                    windowed={windowed()}
                    layerNotes={layerNotes()}
                    documentNotes={current().info.notes}
                    onSelect={selectLayer}
                  />
                </>
              )}
            </Show>
          </section>
          <aside class={styles.inspector} aria-label="Inspector">
            <RenderSettingsPanel
              settings={latest(settings)}
              detected={{
                linearBlending: latest(blending.detected).linearBlending !== null,
                textGamma: latest(blending.detected).textGamma !== null
              }}
              onChange={(patch) => {
                if ('linearBlending' in patch) {
                  blending.choose({ linearBlending: patch.linearBlending });
                }

                if ('textGamma' in patch) {
                  blending.choose({ textGamma: patch.textGamma });
                }

                update(patch);
              }}
              onReset={() => {
                blending.choose({ linearBlending: undefined, textGamma: undefined });
                reset();
              }}
            />
            <Show when={savedStates()}>
              {(states) => <StatesPanel states={states()} choice={stateChoice()} onChoose={chooseState} />}
            </Show>
            <Show when={documentFonts()?.layers.length ? documentFonts() : undefined}>
              {(report) => (
                <FontsPanel
                  report={report()}
                  render={render()}
                  visibleOf={(index) =>
                    stateChoice() ? undefined : layerVisibility(document()?.layers ?? [], index, latest(overrides))
                  }
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
      <Show when={prompt()}>
        {(asked) => (
          <OpenPromptDialog
            prompt={asked()}
            name={latest(source)?.name ?? ''}
            onAnswer={(choice) => answer(asked(), choice)}
          />
        )}
      </Show>
    </div>
  );

  /** The settled state in words: the last render's time or why there is none. */
  function statusText() {
    const current = render();
    if (openFailure()) {
      return 'Failed to open';
    }

    if (canceled()) {
      return 'Canceled';
    }

    if (!document()) {
      return 'Ready';
    }

    if (!current?.ok) {
      return current?.error.kind === 'unsupported'
        ? 'Not rendered: unsupported feature, see the status below the canvas'
        : 'Not rendered';
    }

    if (current.value.window?.source === 'savedComposite') {
      return 'Temporary saved preview, rendering fresh layers…';
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
